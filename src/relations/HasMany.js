/**
 * @fileoverview HasMany relationship implementation.
 */
import { HasOne } from "./HasOne.js"; // Inherits some logic from HasOne/Relation
import { Relation } from "./Relation.js";

/**
 * Represents a HasMany (one-to-many) relationship.
 * Example: A Post has many Comments.
 * Inherits from HasOne as the setup is similar, but getResults differs.
 */
export class HasMany extends HasOne {
  // Reuses constructor, addConstraints, addEagerConstraints logic mostly

  /** @inheritdoc */
  match(models, results, relationName) {
    const foreignKeyName = this.foreignKey.split(".").pop(); // Raw foreign key
    const dictionary = this.buildDictionary(results, foreignKeyName); // Builds dictionary potentially with arrays

    for (const model of models) {
      const localKeyValue = model.getAttribute(this.localKey);
      let relatedModels = [];
      if (localKeyValue !== null && dictionary[localKeyValue]) {
        relatedModels = dictionary[localKeyValue]; // Expects array from buildDictionary for HasMany
      }
      model.setRelation(relationName, relatedModels);
    }
    return models;
  }

  /** @inheritdoc */
  async getResults() {
    // HasMany relationship expects multiple results
    return await this.query.get();
  }

  /** @inheritdoc */
  buildDictionary(results, keyName) {
    // Override to ensure values are always arrays for HasMany
    const dictionary = {};
    for (const result of results) {
      const key = result.getAttribute(keyName);
      if (key === null || key === undefined) continue;

      if (!dictionary[key]) {
        dictionary[key] = [];
      }
      dictionary[key].push(result); // Always push to an array
    }
    return dictionary;
  }

  /**
   * Attach multiple model instances to the parent model.
   * Sets the foreign key on each related model instance and saves them.
   * @param {Model[]} models The related model instances to save or associate.
   * @returns {Promise<Model[]>} The saved related models.
   */
  async saveMany(models) {
    const savedModels = [];
    for (const model of models) {
      const saved = await this.save(model); // Use HasOne's save logic
      if (saved) {
        savedModels.push(model); // Push the instance that was passed and potentially modified
      }
    }
    return savedModels;
  }

  /**
   * Create multiple related model instances and attach them.
   * @param {Array<Record<string, any>>} records Array of attribute objects for new models.
   * @returns {Promise<Model[]>} The created related model instances.
   */
  async createMany(records) {
    const createdModels = [];
    for (const attributes of records) {
      const created = await this.create(attributes); // Use HasOne's create logic
      createdModels.push(created);
    }
    return createdModels;
  }

  /**
   * Make multiple related model instances and attach them.
   * @param {Array<Record<string, any>>} records Array of attribute objects for new models.
   * @returns {Promise<Model[]>} The created related model instances.
   */
  async makeMany(records) {
    const madeModels = [];
    for (const attributes of records) {
      const made = await this.make(attributes); // Use HasOne's create logic
      madeModels.push(made);
    }
    return madeModels;
  }
}

// Apply proxy for QueryBuilder method delegation
export const HasManyProxy = new Proxy(HasMany, {
  construct(target, args) {
    const instance = new target(...args);
    return Relation.createProxy(instance);
  },
});
