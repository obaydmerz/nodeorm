/**
 * @fileoverview HasOne relationship implementation.
 */
import { Relation } from "./Relation.js";
import { QueryError } from "../errors.js";
import { Expression } from "../query/Expression.js";

/**
 * Represents a HasOne (one-to-one) relationship.
 * Example: A User has one Profile.
 */
export class HasOne extends Relation {
  /** @type {string} Foreign key name on the related model's table. */
  foreignKey;
  /** @type {string} Local key name on the parent model's table (usually primary key). */
  localKey;

  /**
   * @param {import('../query/QueryBuilder.js').QueryBuilder} query
   * @param {import('../model/Model.js').Model} parent
   * @param {string} foreignKey Foreign key on the related model.
   * @param {string} localKey Local key on the parent model.
   */
  constructor(query, parent, foreignKey, localKey) {
    super(query, parent);
    this.foreignKey = foreignKey;
    this.localKey = localKey;
    this.addConstraints();
  }

  /**
   * Set the base constraints on the relation query.
   * Matches the foreign key on the related table with the local key on the parent table.
   */
  addConstraints() {
    this.query.where(
      this.foreignKey,
      "=",
      this.parent.getAttribute(this.localKey)
    );
  }

  /** @inheritdoc */
  addEagerConstraints(models) {
    const localKeyName = this.localKey;
    const foreignKeyName = this.foreignKey.split(".").pop(); // Get raw foreign key name without table prefix

    // Collect all local key values from parent models
    const localKeys = models.map((model) => model.getAttribute(localKeyName));

    this.query.whereIn(foreignKeyName, [...new Set(localKeys)]); // Use unique keys
  }

  /** @inheritdoc */
  match(models, results, relationName) {
    const foreignKeyName = this.foreignKey.split(".").pop(); // Raw foreign key
    const dictionary = this.buildDictionary(results, foreignKeyName);

    for (const model of models) {
      const localKeyValue = model.getAttribute(this.localKey);
      let relatedModel = null;
      if (localKeyValue !== null && dictionary[localKeyValue]) {
        relatedModel = dictionary[localKeyValue]; // HasOne expects single result per key
      }
      model.setRelation(relationName, relatedModel);
    }
    return models;
  }

  /** @inheritdoc */
  async getResults() {
    // HasOne relationship expects only one result
    return await this.query.first();
  }

  /**
   * Attach a model instance to the parent model.
   * Sets the foreign key on the related model instance.
   * @param {Model} model The related model instance to save or associate.
   * @returns {Promise<Model | boolean>} The saved related model or false on failure.
   */
  async save(model) {
    if (!(model instanceof this.related)) {
      throw new TypeError(
        `Argument must be an instance of the related model [${this.related.name}].`
      );
    }
    model.setAttribute(this.foreignKey.split(".").pop(), this.parent.getKey());
    return await model.save();
  }

  /**
   * Create a new related model instance and attach it.
   * @param {Record<string, any>} attributes Attributes for the new related model.
   * @returns {Promise<Model>} The created related model instance.
   */
  async create(attributes) {
    const instance = this.related.make(attributes);
    await this.save(instance); // Save sets foreign key and persists
    return instance;
  }

  /**
   * Make a new related model instance and attach it.
   * @param {Record<string, any>} attributes Attributes for the new related model.
   * @returns {Promise<Model>} The created related model instance.
   */
  async make(attributes) {
    const instance = this.related.make(attributes);
    await this.save(instance); // Save sets foreign key and persists
    return instance;
  }

  /** @inheritdoc */
  getRelationExistenceQuery(query, parentQuery, condition) {
    // Check if related model's foreign key matches parent's local key
    query.whereColumn(
      this.getQualifiedForeignKeyName(), // related.foreignKey
      "=",
      parentQuery._model.getQualifiedTableName() + "." + this.localKey // parent.localKey
    );

    // Add the specific existence condition (e.g., count(*) >= 1)
    if (condition instanceof Expression) {
      query.select(condition); // Example: raw('count(*)') or similar
    }

    return query;
  }

  /** Get the fully qualified foreign key name. */
  getQualifiedForeignKeyName() {
    // foreignKey might already be qualified (table.column)
    if (this.foreignKey.includes(".")) {
      return this.foreignKey;
    }
    return this.related.getQualifiedTableName() + "." + this.foreignKey;
  }
}

// Apply proxy for QueryBuilder method delegation
export const HasOneProxy = new Proxy(HasOne, {
  construct(target, args) {
    const instance = new target(...args);
    return Relation.createProxy(instance);
  },
});
