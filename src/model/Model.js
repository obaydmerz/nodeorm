/**
 * @fileoverview Base Model class for NodeORM, inspired by Laravel Eloquent.
 */
import {
  pluralize,
  singularize,
  snakeCase,
  studlyCase,
  camelCase,
} from "../utils/string.js";
import { parseDateFromDb } from "../utils/date.js";
import { deepClone, isObject, debugLog, debugWarn } from "../utils/helpers.js";
import { ConnectionManager } from "../connection/ConnectionManager.js";
import { QueryBuilder } from "../query/QueryBuilder.js";
import { MassAssignmentError, RelationError } from "../errors.js";

// Relationship imports
import { HasOne } from "../relations/HasOne.js";
import { BelongsTo } from "../relations/BelongsTo.js";
import { HasMany } from "../relations/HasMany.js";
import { BelongsToMany } from "../relations/BelongsToMany.js";
import { Relation } from "../relations/Relation.js";

import { Blueprint } from "../schema/Blueprint.js"; // Import Blueprint

import { Manager, Schema } from "../singleton.js";

/**
 * @typedef {import('../connection/Connection.js').Connection} Connection
 * @typedef {import('../drivers/BaseDriver.js').BaseDriver} BaseDriver
 * @typedef {Record<string, any>} Attributes
 */

/** @type {Map<typeof Model, boolean>} */
const bootingModels = new Map(); // Track booting process
/** @type {Map<typeof Model, Promise<void> | null>} */
const bootPromises = new Map(); // Store boot promises
/** @type {Map<typeof Model, Map<string, Function[]>>} Model event listeners */
const modelEventListeners = new Map();
/** @type {Map<typeof Model, Map<string, Function>>} Global scopes registry */
const globalScopes = new Map();
/** @type {Map<string, any>} Cached attribute getter methods */
const getterCache = new Map();
/** @type {Map<string, any>} Cached attribute setter methods */
const setterCache = new Map();

/**
 * Base Model class providing ORM capabilities.
 */
export class Model {
  // --- Static Properties (Defaults & Configuration) ---

  /** @type {ConnectionManager} */
  static connectionManager = null;

  /** @type {string | null} */
  static connection = null;
  /** @type {string | null} */
  static table = null;
  /** @type {string} */
  static primaryKey = "id";
  /** @type {'integer' | 'string'} */
  static keyType = "integer";
  /** @type {boolean} */
  static incrementing = true;
  /** @type {boolean} */
  static timestamps = true;
  /** @type {string} */
  static createdAtColumn = "created_at";
  /** @type {string} */
  static updatedAtColumn = "updated_at";
  /** @type {boolean} */
  static softDeletes = false;
  /** @type {string} */
  static deletedAtColumn = "deleted_at";
  /** @type {null} */
  static NOT_DELETED_VALUE = null;
  /** @type {Record<string, 'integer' | 'float' | 'boolean' | 'string' | 'date' | 'datetime' | 'timestamp' | 'json' | 'object' | 'array'>} */
  static casts = {};
  /** @type {string[] | null} */
  static fillable = null;
  /** @type {string[]} */
  static guarded = ["*"];
  /** @type {string[]} */
  static hidden = [];
  /** @type {string[] | null} */
  static visible = null;
  /** @type {string[]} */
  static appends = [];
  /** @type {object | null} */
  static _schema = null;

  /**
   * Controls automatic booting (describing table, etc.).
   * Set to false to disable auto-booting for performance if schema is known.
   * @type {boolean}
   */
  static shouldBoot = true; // Default to true for auto-describing

  /**
   * Stores the table structure definition after booting.
   * @type {Blueprint | null}
   */
  static blueprint = null; // Initialize as null

  // --- Instance Properties ---

  /** @type {Attributes} @protected */
  _attributes = {};
  /** @type {Attributes} @protected */
  _original = {};
  /** @type {Record<string, Model | Model[] | null>} @protected */
  _relations = {};
  /** @type {boolean} @protected */
  _exists = false;
  /** @type {boolean} @protected */
  _wasRecentlyCreated = false;
  /** @type {Set<string>} @private */
  _loadingRelations = new Set();
  /** @type {string[] | null} Instance override for visible */
  _instanceVisible = null;
  /** @type {string[] | null} Instance override for hidden */
  _instanceHidden = null;
  /** @type {string[] | null} Instance override for appends */
  _instanceAppends = null;

  // --- Constructor ---

  /**
   * Create a new Model instance.
   * @param {Attributes} [attributes={}] Initial attributes.
   */
  constructor(attributes = {}) {
    // Initialize internal properties BEFORE fill
    this._attributes = {};
    this._original = {};
    this._relations = {};
    this._exists = false;
    this._wasRecentlyCreated = false;
    this._loadingRelations = new Set();
    this._instanceVisible = null; // Initialize overrides
    this._instanceHidden = null;
    this._instanceAppends = null;

    // Fill attributes AFTER basic instance setup
    this.fill(attributes);
    // After filling, set the initial original state if not already existing
    if (!this._exists) {
      this.syncOriginal(); // Set original state for new instances after fill
    }

    // Return a Proxy to handle attribute access, mutations, and relations dynamically
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        // Prioritize existing methods/properties on the target object
        if (prop in target || typeof prop === "symbol") {
          return Reflect.get(target, prop, receiver);
        }

        // Handle dynamic attribute access (getters, casts, raw attributes)
        if (typeof prop === "string") {
          return target.getAttribute(prop);
        }

        // Default behavior
        return Reflect.get(target, prop, receiver);
      },
      set: (target, prop, value, receiver) => {
        // Allow setting instance properties like _attributes, _original etc. directly
        if (prop in target || typeof prop !== "string") {
          return Reflect.set(target, prop, value, receiver);
        }

        // Handle dynamic attribute setting (mutators, casts)
        target.setAttribute(prop, value);
        return true; // Indicate success
      },
      has: (target, prop) => {
        return (
          Reflect.has(target, prop) ||
          target.hasAttribute(prop) ||
          target.hasRelation(prop)
        );
      },
      ownKeys: (target) => {
        return [
          ...Reflect.ownKeys(target),
          ...Object.keys(target.getAttributes()),
          ...(target._instanceAppends ?? target.constructor.appends), // Use instance override if exists
          ...Object.keys(target._relations),
        ].filter(
          (key, index, self) =>
            typeof key === "string" && self.indexOf(key) === index
        );
      },
      getOwnPropertyDescriptor: (target, prop) => {
        if (typeof prop === "string" && target.hasAttribute(prop)) {
          return {
            value: target.getAttribute(prop),
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        if (typeof prop === "string" && target.isRelationLoaded(prop)) {
          return {
            value: target.getRelation(prop),
            writable: true,
            enumerable: true,
            configurable: true,
          };
        }
        if (
          typeof prop === "string" &&
          target.hasAppended(prop) &&
          target.hasGetter(prop)
        ) {
          return {
            value: target.getAttribute(prop),
            writable: false,
            enumerable: true,
            configurable: true,
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    });
  }

  // --- Static Booting ---

  /**
   * Ensures the model is booted (runs async boot process if not already done).
   * @returns {Promise<void>}
   */
  static async ensureReady() {
    if(!this.connection) {
      await Manager.ensureDefault();
    }

    if (bootPromises.has(this)) {
      return bootPromises.get(this); // Return existing boot promise
    }

    if (this.boot === false || bootingModels.get(this) === true) {
      // If boot disabled or already successfully booted (true), resolve immediately
      // If boot disabled, we assume user knows what they're doing
      return Promise.resolve();
    }

    // Start booting process
    const bootPromise = (async () => {
      bootingModels.set(this, false); // Mark as booting (false = in progress)
      try {
        await this.boot(); // Perform async boot
        bootingModels.set(this, true); // Mark as successfully booted
        debugLog(`Model [${this.name}] booted successfully.`);
      } catch (error) {
        console.error(
          `NodeORM Error: Failed to boot model [${this.name}].`,
          error
        );
        bootingModels.delete(this); // Remove entry on failure
        bootPromises.delete(this);
        throw error; // Re-throw boot error
      }
    })();
    bootPromises.set(this, bootPromise); // Store the promise
    return bootPromise;
  }

  /**
   * Boot the model (async). Describes table if `boot` is true.
   * @protected
   */
  static async boot() {
    if (!this.connectionManager) this.connectionManager = Manager;
    if (!this.table) this.table = this.generateTableName();
    if (!modelEventListeners.has(this))
      modelEventListeners.set(this, new Map());
    if (!globalScopes.has(this)) globalScopes.set(this, new Map());
    this.addDefaultGlobalScopes();

    // Describe table if boot is enabled and blueprint not set
    if (this.boot === true && !this.blueprint) {
      try {
        // Get connection (doesn't need ensureReady itself)
        const connection = this.getConnection();
        this.blueprint = await Schema.connection(connection).describe(
          this.getTableName()
        );
        debugLog(`Model [${this.name}] described table schema.`);
        // Now potentially sync static properties based on blueprint
        this._syncStaticPropertiesFromBlueprint();
      } catch (error) {
        debugWarn(
          `NodeORM Warning: Could not describe table for model [${this.name}]. Auto-detection features unavailable. Error: ${error.message}`
        );
        // Proceed without blueprint, relying on static properties
      }
      // Set boot to false only after successful boot (or failed describe attempt)
      // This prevents repeated boot attempts on error.
      // However, ensureReady already handles this via bootPromises.
      // We can just rely on ensureReady's logic.
    }
  }

  /**
   * Sync static properties like primaryKey, keyType, incrementing from the fetched blueprint.
   * @protected
   */
  static _syncStaticPropertiesFromBlueprint() {
    if (!this.blueprint) return;

    let foundPrimaryKey = null;
    let isIncrementing = false;
    let keyType = "integer"; // Default

    for (const def of this.blueprint.definitions) {
      if (def.type === "column" && def.modifiers?.primary) {
        foundPrimaryKey = def.name;
        // Check autoIncrement based on column type or modifier
        isIncrementing =
        def.modifiers?.autoIncrement ||
        def.columnType?.includes("Increments") ||
        false;
        // Infer keyType (basic)
        if (
          def.columnType?.toLowerCase().includes("string") ||
          def.columnType?.toLowerCase().includes("uuid") ||
          def.columnType?.toLowerCase().includes("ulid")
        ) {
          keyType = "string";
        } else {
          keyType = "integer"; // Default for numeric increments etc.
        }
        break; // Found primary key defined on column
      }
      if (def.type === "primary") {
        // Composite primary keys are not fully handled here for incrementing/keyType
        if (def.columns.length === 1) {
          foundPrimaryKey = def.columns[0];
          // Need to find the corresponding column definition to check type/incrementing
          const pkColDef = this.blueprint.definitions.find(
            (d) => d.type === "column" && d.name === foundPrimaryKey
          );
          if (pkColDef) {
            isIncrementing =
              pkColDef.modifiers?.autoIncrement ||
              pkColDef.columnType?.includes("Increments") ||
              false;
            if (
              pkColDef.columnType?.toLowerCase().includes("string") ||
              pkColDef.columnType?.toLowerCase().includes("uuid") ||
              pkColDef.columnType?.toLowerCase().includes("ulid")
            )
              keyType = "string";
            else keyType = "integer";
          }
        } else {
          // Composite key - usually not incrementing, often string parts
          isIncrementing = false;
          keyType = "string"; // Default assumption for composite
        }
        break; // Found separate primary key definition
      }
    }

    // Update static properties IF they haven't been explicitly set on the subclass
    if (foundPrimaryKey && this.primaryKey === Model.primaryKey) {
      // Only override if using default 'id'
      this.primaryKey = foundPrimaryKey;
      debugLog(
        `Model [${this.name}] auto-detected primaryKey: ${this.primaryKey}`
      );
    }
    if (this.incrementing === Model.incrementing) {
      // Only override if using default true
      this.incrementing = isIncrementing;
      debugLog(
        `Model [${this.name}] auto-detected incrementing: ${this.incrementing}`
      );
    }
    if (this.keyType === Model.keyType) {
      // Only override if using default 'integer'
      this.keyType = keyType;
      debugLog(`Model [${this.name}] auto-detected keyType: ${this.keyType}`);
    }
  }

  // --- Static Getters based on Blueprint/Statics ---

  /** Get primary key name, checking blueprint first. */
  static getPrimaryKey() {
    return this.primaryKey; // Relies on boot process to update static primaryKey
  }

  /** Check if key is incrementing, checking blueprint first. */
  static getIsIncrementing() {
    return this.incrementing; // Relies on boot process
  }

  /** Get key type, checking blueprint first. */
  static getKeyType() {
    return this.keyType; // Relies on boot process
  }

  /** Get list of table columns from blueprint or schema cache. */
  static getColumns() {
    if (this.blueprint?.definitions) {
      return this.blueprint.definitions
        .filter((def) => def.type === "column")
        .map((def) => def.name);
    }
    // Fallback to schema cache if blueprint wasn't loaded/used
    if (this._schema?.columns) {
      return Object.keys(this._schema.columns);
    }
    return []; // Unknown if not booted or described
  }

  // --- Modified Static Methods to Ensure Booting ---

  static query() {
    return new QueryBuilder(this.getConnection(), this);
  }

  static queryWithoutGlobalScopes() {
    const builder = this.query(); // Gets booted query builder
    builder.withoutGlobalScopes();
    return builder;
  }

  static addDefaultGlobalScopes() {
    if (this.softDeletes) {
      this.addGlobalScope("softDeletes", (query) => {
        query.whereNull(this.getQualifiedDeletedAtColumn());
      });
    }
  }

  static generateTableName() {
    return pluralize(snakeCase(this.name));
  }

  static getTableName() {
    return this.table;
  }

  static getQualifiedTableName() {
    return this.getTableName(); // Schema prefix not implemented yet
  }

  static getQualifiedKeyName() {
    return `${this.getQualifiedTableName()}.${this.primaryKey}`;
  }
  static getQualifiedCreatedAtColumn() {
    return `${this.getQualifiedTableName()}.${this.createdAtColumn}`;
  }
  static getQualifiedUpdatedAtColumn() {
    return `${this.getQualifiedTableName()}.${this.updatedAtColumn}`;
  }
  static getQualifiedDeletedAtColumn() {
    return `${this.getQualifiedTableName()}.${this.deletedAtColumn}`;
  }

  static setConnection(name) {
    this.connection = name;
    // this._connectionInstance = null; // Caching disabled
  }

  static getConnection() {
    if(!this.connectionManager) {
      this.connectionManager = Manager;
    }

    const conn = this.connectionManager.getConnection(this.connection);

    if (!conn) {
      throw new Error(
        `Model [${this.name}] requires connection '${this.connection}', but it's not configured.`
      );
    }

    return conn;
  }

  static initializeSchema(schema) {
    this._schema = schema;
    debugLog(
      `Model [${this.name}] initialized with schema for table [${
        schema?.tableName ?? this.getTableName()
      }]${schema ? "." : " (Schema fetch failed/skipped)."}`
    );
  }

  static getSchema() {
    return this._schema;
  }
  static hasColumn(columnName) {
    return !!this._schema?.columns?.[columnName];
  }

  static query() {
    return new QueryBuilder(this.getConnection(), this);
  }

  static queryWithoutGlobalScopes() {
    const builder = this.query();
    // TODO: Implement withoutGlobalScopes in QueryBuilder if full Eloquent compatibility is needed
    debugWarn(
      "NodeORM Warning: queryWithoutGlobalScopes() needs QueryBuilder support."
    );
    return builder;
  }

  static hydrate(items, connection) {
    const modelInstances = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const instance = this.newInstanceFromDb(item, connection);
      modelInstances.push(instance);
    }
    return modelInstances;
  }

  static newInstanceFromDb(attributes, connection) {
    const instance = new this(); // Creates proxy via constructor
    instance._exists = true;
    instance._wasRecentlyCreated = false;
    // Directly set attributes and original state without accessors/mutators/casting initially
    instance.syncOriginalAttributes(attributes); // This sets both _attributes and _original
    instance._relations = {};
    return instance;
  }

  static make(attributes = {}) {
    return new this(attributes);
  }

  static async create(attributes) {
    const instance = new this(attributes);
    await instance.save();
    return instance;
  }

  static all() {
    return this.query().get();
  }

  static find(id, columns = ["*"]) {
    return this.query().find(id, columns);
  }

  static findMany(ids, columns = ["*"]) {
    return this.query().findMany(ids, columns);
  }

  static findOrFail(id, columns = ["*"]) {
    return this.query().findOrFail(id, columns);
  }

  static first(columns = ["*"]) {
    return this.query()
      .select(...columns)
      .first();
  }

  static firstOrFail(columns = ["*"]) {
    return this.query()
      .select(...columns)
      .firstOrFail();
  }

  static async firstOrCreate(attributes, values = {}) {
    let instance = await this.query().where(attributes).first();
    if (!instance) {
      instance = await this.create({ ...attributes, ...values });
    }
    return instance;
  }

  static async firstOrNew(attributes, values = {}) {
    let instance = await this.query().where(attributes).first();
    if (!instance) {
      instance = this.make({ ...attributes, ...values });
    }
    return instance;
  }

  static last(columns = ["*"]) {
    return this.query()
      .select(...columns)
      .last();
  }

  static lastOrFail(columns = ["*"]) {
    return this.query()
      .select(...columns)
      .lastOrFail();
  }

  static async lastOrCreate(attributes, values = {}) {
    let instance = await this.query().where(attributes).last();
    if (!instance) {
      instance = await this.create({ ...attributes, ...values });
    }
    return instance;
  }

  static async lastOrNew(attributes, values = {}) {
    let instance = await this.query().where(attributes).last();
    if (!instance) {
      instance = this.make({ ...attributes, ...values });
    }
    return instance;
  }

  static async updateOrCreate(attributes, values = {}) {
    await this.query().updateOrInsert(attributes, values);
    return this.query().where(attributes).firstOrFail();
  }

  static async destroy(ids) {
    const keys = Array.isArray(ids) ? ids : [ids];
    if (keys.length === 0) return 0;
    const query = this.query().whereIn(this.primaryKey, keys);
    if (this.softDeletes) {
      const time = new Date();
      const columns = { [this.deletedAtColumn]: time };
      if (this.timestamps) columns[this.updatedAtColumn] = time;
      return await query.update(columns);
    } else {
      return await query.delete();
    }
  }

  // --- Instance Methods ---

  fill(attributes) {
    if (!attributes || typeof attributes !== "object") return this;
    const fillable = this.getFillable();
    const guarded = this.getGuarded();
    const isTotallyGuarded = guarded.includes("*");

    for (const key in attributes) {
      if (this.isFillable(key, fillable, guarded, isTotallyGuarded)) {
        this.setAttribute(key, attributes[key]);
      } else {
        const defaultGuarded = this.constructor.guarded === Model.guarded;
        if ((isTotallyGuarded && defaultGuarded) || guarded.includes(key)) {
          if (!fillable || !fillable.includes(key)) {
            throw new MassAssignmentError(
              `Attribute '${key}' is guarded on model '${this.constructor.name}'.`
            );
          }
        }
      }
    }
    return this;
  }

  forceFill(attributes) {
    if (!attributes || typeof attributes !== "object") return this;
    for (const key in attributes) this.setAttribute(key, attributes[key]);
    return this;
  }

  async save(options = {}) {
    await this.constructor.ensureReady();

    // Use newQueryForSave to handle potential soft delete state correctly
    const query = this._exists
      ? this.newQueryForSave().where(this.getKeyName(), "=", this.getKey())
      : this.newQueryWithoutScopes(); // Use unscoped query for insert


    if ((await this.fireModelEvent("saving", false, options)) === false)
      return false;

    let saved = false;
    if (this._exists) {
      if ((await this.fireModelEvent("updating", false, options)) === false)
        return false;
      saved = await this._performUpdate(query, options);
      if (saved) await this.fireModelEvent("updated", true, options);
    } else {
      if ((await this.fireModelEvent("creating", false, options)) === false)
        return false;

      
      saved = await this._performInsert(query, options); // Pass unscoped query
      if (saved) {
        this._exists = true;
        this._wasRecentlyCreated = true;
        await this.fireModelEvent("created", true, options);
        // syncOriginal called inside _performInsert now
      }
    }

    if (saved) {
      this.syncChanges(); // Sync changes AFTER successful operation and event
      await this.fireModelEvent("saved", true, options);
    }
    return saved;
  }

  async _performUpdate(query, options = {}) {
    await this.constructor.ensureReady();

    const dirty = this.getDirty();
    if (Object.keys(dirty).length === 0 && options.forceUpdate !== true)
      return true;

    if (this.usesTimestamps() && options.timestamps !== false) {
      this.updateTimestamps();
      const updatedAtCol = this.getUpdatedAtColumn();
      // Ensure updated_at is included if timestamps were updated
      if (!(updatedAtCol in dirty) && this.isDirty(updatedAtCol)) {
        dirty[updatedAtCol] = this.getAttributeValue(updatedAtCol);
      }
    }

    if (!this.constructor.incrementing || options.updatePk !== true) {
      delete dirty[this.getKeyName()];
    }

    if (Object.keys(dirty).length === 0) return true;

    // Use the provided query (already constrained to the ID)
    const affectedRows = await query.limit(1).update(dirty);
    return affectedRows > 0;
  }

  async _performInsert(query, options = {}) {
    await this.constructor.ensureReady();

    if (this.usesTimestamps() && options.timestamps !== false) {
      this.updateTimestamps();
    }
    const attributes = this.getAttributesForInsert();
    if (this.getIncrementing()) {
      // Use the passed unscoped query builder for insert
      const id = await query.insertGetId(attributes, this.getKeyName());
      if (id !== null && id !== undefined) {
        this.setAttribute(this.getKeyName(), id);
        this.syncOriginal(); // Sync state AFTER getting ID
        return true;
      }
      debugWarn(
        `NodeORM Warning: Insert succeeded for ${this.constructor.name} but failed to retrieve insert ID.`
      );
      this.syncOriginal(); // Sync state even if ID retrieval fails
      return true;
    } else {
      const result = await query.insert(attributes);
      if (result.affectedRows > 0) {
        this.syncOriginal(); // Sync state after non-incrementing insert
        return true;
      }
      return false;
    }
  }

  async update(attributes, options = {}) {
    if (!this._exists) return false;
    this.fill(attributes);
    return this.save(options);
  }

  async delete(options = {}) {
    if (!this._exists && !this.constructor.softDeletes) return true;
    if ((await this.fireModelEvent("deleting", false, options)) === false)
      return false;

    let deleted = false;
    if (this.constructor.softDeletes && options.force !== true) {
      deleted = await this._performSoftDelete(options);
    } else {
      deleted = await this._performHardDelete(options);
    }

    if (deleted) {
      const wasSoftDelete =
        this.constructor.softDeletes && options.force !== true;
      if (!wasSoftDelete) this._exists = false; // Only mark non-existent on hard delete
      await this.fireModelEvent("deleted", true, {
        ...options,
        softDelete: wasSoftDelete,
      });
    }
    return deleted;
  }

  async _performSoftDelete(options) {
    await this.constructor.ensureReady();

    const query = this.newQueryForSave().where(
      this.getKeyName(),
      this.getKey()
    );
    const time = new Date();
    const columns = { [this.getDeletedAtColumn()]: time };
    if (this.usesTimestamps() && options.timestamps !== false) {
      this.updateTimestamps(); // Ensures updated_at is set in memory
      columns[this.getUpdatedAtColumn()] = this.getAttributeValue(
        this.getUpdatedAtColumn()
      );
    }

    const affectedRows = await query.limit(1).update(columns);
    if (affectedRows > 0) {
      this.setAttribute(this.getDeletedAtColumn(), time); // Update in memory
      return true;
    }
    return false;
  }

  async _performHardDelete(options) {
    await this.constructor.ensureReady();

    const query = this.newQueryWithoutScopes().where(
      this.getKeyName(),
      this.getKey()
    );
    const affectedRows = await query.limit(1).delete();
    return affectedRows > 0;
  }

  async forceDelete(options = {}) {
    return this.delete({ ...options, force: true });
  }

  async restore(options = {}) {
    await this.constructor.ensureReady();

    if (!this.constructor.softDeletes) return false;
    if (!this.getAttribute(this.getDeletedAtColumn())) return true;
    if ((await this.fireModelEvent("restoring", false, options)) === false)
      return false;

    // Use withTrashed to find the model for update
    const query = this.constructor
      .query()
      .withTrashed()
      .where(this.getKeyName(), this.getKey());

    const columns = {
      [this.getDeletedAtColumn()]: this.constructor.NOT_DELETED_VALUE,
    };
    if (this.usesTimestamps() && options.timestamps !== false) {
      this.updateTimestamps();
      columns[this.getUpdatedAtColumn()] = this.getAttributeValue(
        this.getUpdatedAtColumn()
      );
    }

    const affectedRows = await query.limit(1).update(columns);
    if (affectedRows > 0) {
      this.setAttribute(
        this.getDeletedAtColumn(),
        this.constructor.NOT_DELETED_VALUE
      );
      await this.fireModelEvent("restored", true, options);
      this.syncOriginal(); // Resync after restore
      return true;
    }
    return false;
  }

  isSoftDeleting() {
    return this.constructor.softDeletes === true;
  }
  isTrashed() {
    return (
      this.isSoftDeleting() &&
      this.getAttribute(this.getDeletedAtColumn()) !==
        this.constructor.NOT_DELETED_VALUE
    );
  }

  async refresh() {
    if (!this._exists) return this;
    const freshInstance = await this.constructor
      .queryWithoutGlobalScopes()
      .where(this.getKeyName(), this.getKey())
      .first();
    if (!freshInstance) {
      this._exists = false;
      this._attributes = {};
      this._original = {};
      this._relations = {};
      debugWarn(
        `NodeORM Warning: Model [${
          this.constructor.name
        }:${this.getKey()}] marked as existing could not be found during refresh.`
      );
      return this;
    }
    this.syncOriginalAttributes(freshInstance.getAttributes());
    this._relations = {};
    this._exists = true;
    return this;
  }

  async load(relations) {
    const query = this.newQueryWithoutScopes().where(
      this.getKeyName(),
      this.getKey()
    );
    query.with(relations);
    const fresh = await query.first();
    if (fresh) {
      Object.entries(fresh._relations).forEach(([name, value]) => {
        this.setRelation(name, value);
      });
    }
    return this;
  }

  async loadMissing(relations) {
    const relationsToLoad = {};
    const processRelation = (name, callback) => {
      if (!this.isRelationLoaded(name))
        relationsToLoad[name] = callback || (() => {});
    };
    if (typeof relations === "string") processRelation(relations);
    else if (Array.isArray(relations))
      relations.forEach((rel) => processRelation(rel));
    else if (isObject(relations))
      Object.entries(relations).forEach(([name, cb]) =>
        processRelation(name, cb)
      );
    if (Object.keys(relationsToLoad).length > 0)
      await this.load(relationsToLoad);
    return this;
  }

  // --- Attribute Handling ---

  getAttribute(key) {
    if (!key) return null;
    if (key === this.getKeyName()) return this.getKey(); // Use direct access for PK

    if (
      this.hasAttributeMutatorOrCast(key) ||
      key in this._attributes ||
      key in this._original
    ) {
      if (this.hasGetter(key)) return this.mutateAttribute(key, "get");
      return this.getAttributeValue(key);
    }
    if (this.isRelationLoaded(key)) return this._relations[key];
    if (this.hasRelationMethod(key)) return this.loadRelation(key);
    if (this.hasAppended(key) && this.hasGetter(key))
      return this.mutateAttribute(key, "get");
    if (key === "table") return this.constructor.getTableName();
    return null;
  }

  setAttribute(key, value) {
    if (!key) return;
    if (this.hasSetter(key)) this.mutateAttribute(key, "set", value);
    else this._attributes[key] = value;
  }

  getAttributeValue(key) {
    const value = this._attributes[key] ?? this._original[key] ?? null;
    if (this.hasCast(key)) return this.castAttribute(key, value);
    return value;
  }

  getAttributes() {
    const allKeys = new Set([
      ...Object.keys(this._attributes),
      ...Object.keys(this._original),
    ]);
    const values = {};
    allKeys.forEach((key) => {
      values[key] = this.getAttribute(key);
    });
    return values;
  }

  getAttributesForInsert() {
    return { ...this._attributes };
  }
  hasAttribute(key) {
    return key in this._attributes || key in this._original;
  }

  // --- Casting ---

  hasCast(key, types = null) {
    const modelCasts = this.constructor.casts;
    if (!(key in modelCasts)) return false;
    if (types) {
      const castType = modelCasts[key].toLowerCase();
      return (Array.isArray(types) ? types : [types])
        .map((t) => t.toLowerCase())
        .includes(castType);
    }
    return true;
  }
  getCastType(key) {
    return this.constructor.casts[key] || null;
  }

  castAttribute(key, value) {
    const castType = this.getCastType(key);
    if (value === null || value === undefined || !castType) return value;
    switch (castType.toLowerCase()) {
      case "int":
      case "integer":
        return Number.isFinite(value)
          ? Math.floor(Number(value))
          : value === null || value === ""
          ? null
          : Math.floor(Number(value)); // Handle empty string to null for integer
      case "real":
      case "float":
      case "double":
        return Number.isFinite(value)
          ? Number(value)
          : value === null || value === ""
          ? null
          : Number(value);
      case "bool":
      case "boolean":
        if (
          value === true ||
          value === 1 ||
          value === "1" ||
          String(value).toLowerCase() === "true" ||
          String(value).toLowerCase() === "t"
        )
          return true;
        if (
          value === false ||
          value === 0 ||
          value === "0" ||
          String(value).toLowerCase() === "false" ||
          String(value).toLowerCase() === "f"
        )
          return false;
        return value === null ? null : Boolean(value); // Keep null as null for boolean? Or default to false? Let's keep null.
      case "string":
        return String(value);
      case "date":
      case "datetime":
      case "timestamp":
        return parseDateFromDb(value);
      case "array":
      case "json":
      case "object":
        if (typeof value === "object") return value; // Already object/array
        if (typeof value === "string") {
          try {
            return JSON.parse(value);
          } catch (e) {
            return value;
          }
        }
        return value;
      default:
        return value;
    }
  }
  isCastable(key) {
    return this.hasCast(key);
  }

  // --- Accessors & Mutators ---

  hasGetter(key) {
    const studlyKey = studlyCase(key);
    const cacheKey = `${this.constructor.name}:getter:${studlyKey}`;
    if (getterCache.has(cacheKey)) return getterCache.get(cacheKey);
    const methodName = `get${studlyKey}Attribute`;
    const has = typeof this[methodName] === "function";
    getterCache.set(cacheKey, has);
    return has;
  }

  hasSetter(key) {
    const studlyKey = studlyCase(key);
    const cacheKey = `${this.constructor.name}:setter:${studlyKey}`;
    if (setterCache.has(cacheKey)) return setterCache.get(cacheKey);
    const methodName = `set${studlyKey}Attribute`;
    const has = typeof this[methodName] === "function";
    setterCache.set(cacheKey, has);
    return has;
  }
  hasAttributeMutatorOrCast(key) {
    return this.hasGetter(key) || this.hasSetter(key) || this.hasCast(key);
  }

  mutateAttribute(key, type, value) {
    const studlyKey = studlyCase(key);
    const methodName = `${type}${studlyKey}Attribute`;
    if (typeof this[methodName] === "function") {
      if (type === "get") {
        const rawValue = this.getAttributeValue(key); // Pass raw/casted value to getter
        return this[methodName](rawValue);
      } else {
        return this[methodName](value); // Setter handles setting _attributes
      }
    }
    if (type === "get") return this.getAttributeValue(key);
  }

  // --- Timestamps ---

  usesTimestamps() {
    return this.constructor.timestamps;
  }
  updateTimestamps() {
    const time = new Date();
    const updatedAtColumn = this.getUpdatedAtColumn();
    if (updatedAtColumn && !this.isDirty(updatedAtColumn))
      this.setAttribute(updatedAtColumn, time);
    const createdAtColumn = this.getCreatedAtColumn();
    if (!this._exists && createdAtColumn && !this._attributes[createdAtColumn])
      this.setAttribute(createdAtColumn, time);
  }
  getCreatedAtColumn() {
    return this.constructor.createdAtColumn;
  }
  getUpdatedAtColumn() {
    return this.constructor.updatedAtColumn;
  }
  getDeletedAtColumn() {
    return this.constructor.deletedAtColumn;
  }

  // --- Mass Assignment ---

  getFillable() {
    return this.constructor.fillable;
  }
  getGuarded() {
    return this.constructor.guarded;
  }

  isFillable(key, fillable, guarded, isTotallyGuarded) {
    if (Array.isArray(fillable) && fillable.length > 0)
      return fillable.includes(key) || fillable.includes("*");
    if (Array.isArray(guarded)) {
      if (isTotallyGuarded) return false;
      if (guarded.includes(key)) return false;
      if (guarded.length === 0) return true;
    }
    return !isTotallyGuarded && guarded && guarded.length === 0;
  }
  isGuarded(key) {
    const fillable = this.getFillable();
    const guarded = this.getGuarded();
    return !this.isFillable(key, fillable, guarded, guarded.includes("*"));
  }

  // --- Dirty Attribute Tracking ---

  getDirty() {
    const dirty = {};
    const allKeys = new Set([
      ...Object.keys(this._attributes),
      ...Object.keys(this._original),
    ]);
    for (const key of allKeys) {
      const currentValue = this._attributes[key];
      if (!this.originalIsEquivalent(key, currentValue))
        dirty[key] = currentValue;
    }
    return dirty;
  }

  isDirty(...attributes) {
    const dirty = this.getDirty();
    if (attributes.length === 0) return Object.keys(dirty).length > 0;
    return attributes.some((attr) => attr in dirty);
  }
  isClean(...attributes) {
    return !this.isDirty(...attributes);
  }
  wasChanged(attribute) {
    return this.isDirty(attribute);
  } // Simplified check

  getOriginal(key, defaultValue = null) {
    return this._original[key] ?? defaultValue;
  }
  getOriginalAttributes() {
    return { ...this._original };
  }
  syncOriginal() {
    this._original = { ...this._attributes };
  }
  syncChanges() {
    const dirty = this.getDirty(); // Get changes based on current state vs original
    for (const key in dirty) this._original[key] = this._attributes[key]; // Update original with current state for saved fields
    // No need to reset _attributes, they reflect current state
  }
  syncOriginalAttribute(attribute) {
    this._original[attribute] = this._attributes[attribute];
  }
  syncOriginalAttributes(attributes) {
    this._original = deepClone(attributes); // Use deep clone
    this._attributes = deepClone(attributes);
  }

  originalIsEquivalent(key, currentValue) {
    const originalValue = this._original[key];
    if (currentValue === originalValue) return true;
    if (currentValue === null && originalValue !== null) return false;
    if (currentValue !== null && originalValue === null) return false;
    if (currentValue === undefined && originalValue !== undefined) return false;
    if (currentValue !== undefined && originalValue === undefined) return false;
    if (this.isDateAttribute(key)) {
      const current = parseDateFromDb(currentValue);
      const original = parseDateFromDb(originalValue);
      return (
        (current instanceof Date &&
          original instanceof Date &&
          current.getTime() === original.getTime()) ||
        (current === null && original === null)
      );
    }
    if (this.hasCast(key, ["json", "object", "array"])) {
      try {
        return JSON.stringify(currentValue) === JSON.stringify(originalValue);
      } catch (e) {
        return false;
      }
    }
    if (this.hasCast(key, ["integer", "int"])) {
      return parseInt(currentValue, 10) === parseInt(originalValue, 10);
    }
    if (this.hasCast(key, ["float", "real", "double"])) {
      return parseFloat(currentValue) === parseFloat(originalValue);
    }
    if (this.hasCast(key, ["boolean", "bool"])) {
      return (
        this.castAttribute(key, currentValue) ===
        this.castAttribute(key, originalValue)
      );
    }
    return currentValue === originalValue;
  }
  isDateAttribute(key) {
    return (
      this.hasCast(key, ["date", "datetime", "timestamp"]) ||
      (this.usesTimestamps() &&
        [this.getCreatedAtColumn(), this.getUpdatedAtColumn()].includes(key)) ||
      (this.isSoftDeleting() && key === this.getDeletedAtColumn())
    );
  }

  // --- Primary Key ---

  getKey() {
    return (
      this._attributes[this.getKeyName()] ??
      this._original[this.getKeyName()] ??
      null
    );
  }
  getKeyName() {
    return this.constructor.getPrimaryKey();
  } // Use static getter
  getIncrementing() {
    return this.constructor.getIsIncrementing();
  } // Use static getter
  getKeyType() {
    return this.constructor.getKeyType();
  }

  // --- Relationships ---

  hasOne(related, foreignKey = null, localKey = null) {
    foreignKey = foreignKey || this.getForeignKey();
    localKey = localKey || this.getKeyName();
    const relation = new HasOne(
      related.query(),
      this,
      related.getTableName() + "." + foreignKey,
      localKey
    );
    return Relation.createProxy(relation);
  }

  belongsTo(related, foreignKey = null, ownerKey = null, relationName = null) {
    relationName = relationName || camelCase(related.name);
    const relatedInstanceKey = related.primaryKey;
    foreignKey =
      foreignKey || snakeCase(relationName) + "_" + relatedInstanceKey;
    ownerKey = ownerKey || relatedInstanceKey;
    const relation = new BelongsTo(
      related.query(),
      this,
      foreignKey,
      ownerKey,
      relationName
    );
    return Relation.createProxy(relation);
  }

  hasMany(related, foreignKey = null, localKey = null) {
    foreignKey = foreignKey || this.getForeignKey();
    localKey = localKey || this.getKeyName();
    const relation = new HasMany(
      related.query(),
      this,
      related.getTableName() + "." + foreignKey,
      localKey
    );
    return Relation.createProxy(relation);
  }

  belongsToMany(
    related,
    pivotTable = null,
    foreignPivotKey = null,
    relatedPivotKey = null,
    parentKey = null,
    relatedKey = null,
    relationName = null
  ) {
    relationName = relationName || camelCase(related.name);
    // Use static getForeignKey
    const relatedForeignKey = related.getForeignKey();
    const relatedPrimaryKey = related.primaryKey;

    foreignPivotKey = foreignPivotKey || this.getForeignKey();
    relatedPivotKey = relatedPivotKey || relatedForeignKey;
    parentKey = parentKey || this.getKeyName();
    relatedKey = relatedKey || relatedPrimaryKey;
    pivotTable = pivotTable || this.joiningTable(related);

    const relation = new BelongsToMany(
      related.query(),
      this,
      pivotTable,
      foreignPivotKey,
      relatedPivotKey,
      parentKey,
      relatedKey,
      relationName
    );
    return Relation.createProxy(relation);
  }

  getForeignKey() {
    return snakeCase(this.constructor.name) + "_" + this.getKeyName();
  }
  static getForeignKey() {
    return snakeCase(this.name) + "_" + this.primaryKey;
  } // Static version

  joiningTable(related) {
    const models = [
      snakeCase(related.name),
      snakeCase(this.constructor.name),
    ].sort();
    return models.join("_");
  }

  hasRelationMethod(key) {
    return (
      typeof this[key] === "function" &&
      !key.toLowerCase().includes("attribute")
    );
  }
  isRelationLoaded(key) {
    return key in this._relations;
  }
  getRelation(key) {
    return this._relations[key] ?? null;
  }
  setRelation(relation, value) {
    this._relations[relation] = value;
    return this;
  }

  async loadRelation(key) {
    if (this.isRelationLoaded(key) || this._loadingRelations.has(key))
      return this.getRelation(key);
    if (!this.hasRelationMethod(key))
      throw new RelationError(
        `Attempted to lazy load undefined relation '${key}' on model '${this.constructor.name}'.`
      );
    this._loadingRelations.add(key);
    try {
      debugLog(
        `NodeORM Lazy Load: Loading relation "${key}" for ${
          this.constructor.name
        }:${this.getKey()}...`
      );
      const relation = this[key]();
      if (!(relation instanceof Relation))
        throw new RelationError(
          `Method '${key}' did not return a Relation instance.`
        );
      const results = await relation.getResults();
      this.setRelation(key, results);
      debugLog(`NodeORM Lazy Load: Relation "${key}" loaded.`);
      return results;
    } catch (error) {
      this.setRelation(key, null);
      throw error;
    } finally {
      this._loadingRelations.delete(key);
    }
  }

  // --- Serialization ---

  toJSON(space) {
    return JSON.stringify(this.toArray(), null, space);
  }
  toArray() {
    return { ...this.attributesToArray(), ...this.relationsToArray() };
  }

  attributesToArray() {
    const attributes = this.getArrayableAttributes();
    (this._instanceAppends ?? this.constructor.appends).forEach((key) => {
      // Use instance override
      if (!attributes.hasOwnProperty(key))
        attributes[key] = this.mutateAttribute(key, "get");
    });
    return attributes;
  }

  relationsToArray() {
    const relations = {};
    for (const key in this._relations) {
      if (this.isVisible(key)) relations[key] = this.getRelationValue(key);
    }
    return relations;
  }

  getRelationValue(key) {
    const value = this.getRelation(key);
    if (!value) return null;
    if (Array.isArray(value))
      return value.map((model) =>
        model instanceof Model ? model.toArray() : model
      );
    else if (value instanceof Model) return value.toArray();
    return value;
  }

  getHidden() {
    return this.constructor.hidden;
  }
  getVisible() {
    return this.constructor.visible;
  }

  makeVisible(attributes) {
    const attrs = Array.isArray(attributes) ? attributes : [attributes];
    this._instanceVisible =
      this._instanceVisible ??
      (this.getVisible() ? [...this.getVisible()] : null);
    this._instanceHidden = this._instanceHidden ?? [...this.getHidden()];
    if (this._instanceVisible)
      this._instanceVisible.push(
        ...attrs.filter((a) => !this._instanceVisible.includes(a))
      );
    else
      this._instanceHidden = this._instanceHidden.filter(
        (hidden) => !attrs.includes(hidden)
      );
    return this;
  }

  makeHidden(attributes) {
    const attrs = Array.isArray(attributes) ? attributes : [attributes];
    this._instanceVisible =
      this._instanceVisible ??
      (this.getVisible() ? [...this.getVisible()] : null);
    this._instanceHidden = this._instanceHidden ?? [...this.getHidden()];
    if (this._instanceVisible)
      this._instanceVisible = this._instanceVisible.filter(
        (visible) => !attrs.includes(visible)
      );
    else
      this._instanceHidden.push(
        ...attrs.filter((attr) => !this._instanceHidden.includes(attr))
      );
    return this;
  }

  isVisible(key) {
    const visible = this._instanceVisible ?? this.getVisible();
    const hidden = this._instanceHidden ?? this.getHidden();
    if (Array.isArray(visible) && visible.length > 0)
      return visible.includes(key);
    if (Array.isArray(hidden)) {
      if (hidden.includes("*") && !(visible && visible.includes(key)))
        return false;
      return !hidden.includes(key);
    }
    return true;
  }

  getArrayableAttributes() {
    const attributes = this.getAttributes();
    const visibleKeys = Object.keys(attributes).filter((key) =>
      this.isVisible(key)
    );
    const visibleAttributes = {};
    visibleKeys.forEach((key) => {
      visibleAttributes[key] = attributes[key];
    });
    return visibleAttributes;
  }

  append(attributes) {
    const attrsToAppend = Array.isArray(attributes) ? attributes : [attributes];
    this._instanceAppends = this._instanceAppends || [
      ...this.constructor.appends,
    ];
    attrsToAppend.forEach((attr) => {
      if (!this._instanceAppends.includes(attr))
        this._instanceAppends.push(attr);
    });
    return this;
  }
  hasAppended(key) {
    return (this._instanceAppends ?? this.constructor.appends).includes(key);
  }

  // --- Event Handling ---

  async fireModelEvent(event, halt = true, options = {}) {
    const listeners =
      modelEventListeners.get(this.constructor)?.get(event) || [];
    let result = true;
    for (const listener of listeners) {
      try {
        const response = await listener(this, options);
        if (halt && response === false) {
          debugLog(
            `NodeORM Event: Halted by listener for '${event}' on ${
              this.constructor.name
            }:${this.getKey()}`
          );
          result = false;
          break;
        }
        if (response !== undefined && response !== true && response !== false)
          result = response;
      } catch (error) {
        //
        throw error;
      }
    }
    return result;
  }

  static registerModelEvent(event, callback) {
    const classListeners = modelEventListeners.get(this);
    if (!classListeners.has(event)) classListeners.set(event, []);
    classListeners.get(event).push(callback);
  }
  static retrieved(callback) {
    this.registerModelEvent("retrieved", callback);
  }
  static creating(callback) {
    this.registerModelEvent("creating", callback);
  }
  static created(callback) {
    this.registerModelEvent("created", callback);
  }
  static updating(callback) {
    this.registerModelEvent("updating", callback);
  }
  static updated(callback) {
    this.registerModelEvent("updated", callback);
  }
  static saving(callback) {
    this.registerModelEvent("saving", callback);
  }
  static saved(callback) {
    this.registerModelEvent("saved", callback);
  }
  static restoring(callback) {
    this.registerModelEvent("restoring", callback);
  }
  static restored(callback) {
    this.registerModelEvent("restored", callback);
  }
  static deleting(callback) {
    this.registerModelEvent("deleting", callback);
  }
  static deleted(callback) {
    this.registerModelEvent("deleted", callback);
  }
  static forceDeleting(callback) {
    this.registerModelEvent("forceDeleting", callback);
  }
  static forceDeleted(callback) {
    this.registerModelEvent("forceDeleted", callback);
  }
  static on = this.registerModelEvent;
  static flushEventListeners() {
    if (modelEventListeners.has(this)) modelEventListeners.get(this).clear();
  }

  // --- Scopes ---

  static addGlobalScope(identifier, scope) {
    globalScopes.get(this).set(identifier, scope);
  }
  static hasGlobalScope(identifier) {
    return globalScopes.get(this)?.has(identifier) || false;
  }
  static getGlobalScope(identifier) {
    return globalScopes.get(this)?.get(identifier) || null;
  }
  static getGlobalScopes() {
    return globalScopes.get(this) || new Map();
  }
  newQueryWithoutScopes() {
    return new QueryBuilder(this.constructor.getConnection(), this.constructor);
  } // Skips global scopes via constructor potentially
  newQueryForSave() {
    // Return a query suitable for save operations (update/soft delete)
    // This usually means including trashed items if soft deleting.
    const query = this.isSoftDeleting()
      ? this.constructor.query().withTrashed() // Use withTrashed scope for updates/deletes
      : this.constructor.query(); // Use normal query otherwise
    return query;
  }

  // --- Utilities ---

  exists() {
    return this._exists;
  }
  wasRecentlyCreated() {
    return this._wasRecentlyCreated;
  }

  newInstance(attributes = {}, fromDb = false) {
    const Constructor = /** @type {typeof Model} */ (this.constructor);
    return fromDb
      ? Constructor.newInstanceFromDb(attributes, Constructor.connection)
      : new Constructor(attributes);
  }

  clone() {
    const clone = this.newInstance(); // Calls constructor which sets up proxy etc.
    // Manually copy internal state AFTER construction
    clone._attributes = deepClone(this._attributes);
    clone._original = deepClone(this._original);
    clone._relations = { ...this._relations }; // Shallow clone relations initially
    clone._exists = this._exists;
    clone._wasRecentlyCreated = this._wasRecentlyCreated;
    if (this._instanceVisible)
      clone._instanceVisible = [...this._instanceVisible];
    if (this._instanceHidden) clone._instanceHidden = [...this._instanceHidden];
    if (this._instanceAppends)
      clone._instanceAppends = [...this._instanceAppends];
    return clone;
  }

  getRouteKey() {
    return this.getAttribute(this.getRouteKeyName());
  }
  getRouteKeyName() {
    return this.getKeyName();
  }
  static async resolveRouteBinding(value, field = null) {
    const instance = new this(); // Create instance to get route key name
    const keyName = field || instance.getRouteKeyName();
    return this.query().where(keyName, "=", value).first();
  }

  /**
   * Update the model's update timestamp.
   * @param {string} [attribute] Specific timestamp attribute to update (defaults to updated_at).
   * @returns {Promise<boolean>} Success status.
   */
  async touch(attribute) {
    if (!this.usesTimestamps()) return false;
    const column = attribute || this.getUpdatedAtColumn();
    if (!column || !this._exists) return false; // Cannot touch non-existent or non-timestamped model

    this.setAttribute(column, new Date());
    // Perform update only for the timestamp column
    const query = this.newQueryForSave().where(
      this.getKeyName(),
      this.getKey()
    );
    const result = await query
      .limit(1)
      .update({ [column]: this.getAttribute(column) });
    if (result > 0) {
      this.syncOriginalAttribute(column); // Sync the touched timestamp
      return true;
    }
    return false;
  }
}
