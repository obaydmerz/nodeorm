import { NodeORM } from "../index.js";
import { EmptyDataError, errors, fire } from "./errors.js";
import { SQLBuilder } from "./sql.js";
import { maskObject } from "./utils.js";

// Needs to be shipped with data
// Otherwise it will be considered as newly created.
export class ModelItem {
  #model = null;
  #clause = {}; // The "where" clause used to retrieve this item, used for item-specific actions such as editing or deleting.
  #mutation = []; // The mutations made to the item's data
  #data = {};
  #belongs = {};
  #newlyCreated = false;

  constructor(model, data = undefined, belongs = {}, newlyCreated = false) {
    this.#model = model;
    this.#data = { ...data } || {};
    this.#clause = {
      [this.#model.primary]: this.#data[this.#model.primary],
    };
    this.#belongs = belongs;

    // data = undefined then #newlyCreated is true
    // data = {...} but newlyCreated == true then #newlyCreated is true
    // data = {...} but newlyCreated == false then #newlyCreated is false
    this.#newlyCreated = newlyCreated || data === undefined;

    // If newlyCreated then put queue data to be pushed to db
    if (newlyCreated && typeof data == "object")
      this.#mutation = Object.keys(data);

    const that = this;

    for (const attr of this.#model.attributes) {
      Object.defineProperty(this, attr.name, {
        get() {
          return attr.cb.call(this);
        },
        set(v) {},
      });
    }

    for (const col of this.#model.columns) {
      if (col.startsWith("#") || col.endsWith(")")) {
        continue;
      }

      if (this.#model.attributes.includes(col)) {
        continue; // When an attribute is defined
      }

      Object.defineProperty(this, col, {
        get() {
          return that.#data[col];
        },
        set(v) {
          that.#data[col] = v;
          if (!that.#mutation.includes(col)) that.#mutation.push(col);
        },
      });
    }

    this.superConstructor = this.constructor;
    this.constructor = this.model;
  }

  get data() {
    return this.#data;
  }

  get model() {
    return this.#model;
  }

  toString() {
    return JSON.stringify(this.#data);
  }

  hasMany(model, hisKey = null, myKey = null) {
    let res;
    if (model.prototype instanceof Model) {
      if (myKey === null) myKey = this.#model.primary || "id";
      if (hisKey === null)
        hisKey = this.#model.table.toLowerCase().toSingular() + "_" + myKey;
      // Ex: post_id

      res = model.where(hisKey, "=", this.#data[myKey]);

      // We want the usage of Collection.create to be linked automaticlly.
      res._extra.newCreationTemplate = {
        [hisKey]: this.#data[myKey],
      };
    }
    return res;
  }

  belongsTo(model, myKey = null, hisKey = null) {
    if (model.prototype instanceof Model) {
      if (hisKey === null) hisKey = model.primary;
      if (myKey === null)
        myKey = model.table.toLowerCase().toSingular() + "_" + hisKey;

      // Used to short time, because we already have the data.
      if (this.#belongs[model.name] !== undefined) {
        return this.#belongs[model.name];
      }

      return model.where(hisKey, "=", this.#data[myKey]).first();
    }
    return undefined;
  }

  async save() {
    if (!this.#newlyCreated && this.#mutation.length == 0) return false;

    const res = await this.#model.dbdriver.commands[
      this.#newlyCreated ? "insertRow" : "updateRow"
    ]({
      table: this.#model.table,
      data: maskObject(this.#data, this.#mutation),
      where: this.#clause,
    });

    if (this.#newlyCreated) {
      if (this.#mutation.length == 0)
        throw new EmptyDataError("Cannot create an item with empty data.");

      this.#newlyCreated = false; // It's no longer new.

      if (res.insertId) {
        this.#data[this.#model.primary] = res.insertId;
      }
    }

    // Mutations are pushed!
    this.#mutation.length = 0;
    return res || false;
  }

  async delete() {
    const res = await this.#model.dbdriver.commands["deleteRow"]({
      table: this.#model.table,
      where: this.#clause,
    });
    return res || false;
  }
}

export class Model {
  static table = undefined;
  static columns = [];
  static guarded = [];
  static primary = undefined;
  static initilazed = false;
  static dbdriver;

  static async beforeInit() {}

  static async init(connection) {
    if (typeof this.beforeInit === "function") await this.beforeInit();

    if (connection instanceof Promise) connection = await connection;
    connection = await NodeORM.determine(connection);

    this.attributes = [];
    this.dbdriver = connection;

    for (const col of Object.getOwnPropertyNames(this).filter(
      (item) => item.startsWith("_") && typeof this[item] === "function"
      // Like _foobar() and _test()
    )) {
      if (col.startsWith("#") || col.endsWith(")")) {
        continue; // We won't define this.
      }

      this.attributes.push({
        name: col.substring(1),
        cb: this[col],
      }); // attributes = ["foobar", "test"]
    }

    if (this.table == undefined) {
      this.table = this.name.toLowerCase().toPlural();
      // Post => posts
      // Category => categories
    }

    if (this.connection == undefined) {
      this.connection = connection;
    }

    if (this.connection == undefined) {
      return; // Still undefined!
    }

    if (this.columns.length == 0) {
      // Get the tables data
      const result = await this.dbdriver.commands.describe(this.table);

      this.columns = [];
      this.primary = "id";

      for (const row of result) {
        // We don't want our guarded columns to be accessed.
        if ([...this.guarded].includes(row.name)) {
          continue;
        }
        this.columns.push(row.name);
        if (row.isPrimary) {
          this.primary = row.name;
        }
      }

      // If primary is still undefined, set it to the first column
      if (this.primary == undefined && result.length) {
        this.primary = result[0].name;
      }
    }

    if (typeof this.afterInit == "function") await this.afterInit();

    this.initilazed = true;
    return this.dbdriver;
  }

  static async afterInit() {}

  static async all() {
    fire(errors.uninitilazedModel, !this.initilazed);
    return await this.query().get();
  }

  static create(template = {}) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return new ModelItem(this, template, {}, true);
  }

  static find(x) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.wherePrimary(x).first();
  }

  static wherePrimary(x) {
    fire(errors.uninitilazedModel, !this.initilazed);
    if (!this.primary) {
      if (!this.columns[0]) {
        return null;
      }
      return this.where(this.columns[0], "=", x);
    }
    return this.where(this.primary, "=", x);
  }

  static query() {
    fire(errors.uninitilazedModel, !this.initilazed);
    const that = this;
    return new SQLBuilder(this.table, that, `${this.table}.`);
  }

  static where(key, valueOrSep, value = undefined) {
    fire(errors.uninitilazedModel, !this.initilazed);

    return this.query().where(key, valueOrSep, value);
  }

  static each(cb) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().each(cb);
  }

  static last() {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().last();
  }

  static first() {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().first();
  }

  static whereExpression(key, valueOrSep, value = undefined) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().whereExpression(key, valueOrSep, value);
  }
}
