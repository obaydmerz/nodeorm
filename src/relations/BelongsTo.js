/**
 * @fileoverview BelongsTo relationship implementation.
 */
import { Relation } from './Relation.js';
import { QueryError } from '../errors.js';
import { Expression } from '../query/Expression.js';

/**
 * Represents a BelongsTo (inverse one-to-one or inverse one-to-many) relationship.
 * Example: A Comment belongs to a Post.
 */
export class BelongsTo extends Relation {
    /** @type {string} Foreign key name on the parent model's table. */
    foreignKey;
    /** @type {string} Owner key name on the related model's table (usually primary key). */
    ownerKey;
    /** @type {string} The name of the relationship method on the parent model. */
    relationName;

    /**
     * @param {import('../query/QueryBuilder.js').QueryBuilder} query
     * @param {import('../model/Model.js').Model} parent
     * @param {string} foreignKey Foreign key on the parent model.
     * @param {string} ownerKey Owner key on the related model.
     * @param {string} relationName Name of the relationship method.
     */
    constructor(query, parent, foreignKey, ownerKey, relationName) {
        super(query, parent);
        this.foreignKey = foreignKey;
        this.ownerKey = ownerKey;
        this.relationName = relationName;
        this.addConstraints();
    }

    /**
     * Set the base constraints on the relation query.
     * Matches the owner key on the related table with the foreign key on the parent table.
     */
    addConstraints() {
        if (this.parent.getAttribute(this.foreignKey) !== null) {
            this.query.where(this.ownerKey, '=', this.parent.getAttribute(this.foreignKey));
        } else {
             // If the foreign key is null, the relationship cannot exist.
             // Add a condition that will always be false.
             this.query.whereRaw('1 = 0');
        }
    }

    /** @inheritdoc */
    addEagerConstraints(models) {
        const ownerKeyName = this.ownerKey; // Related model's key
        // Collect all non-null foreign key values from parent models
        const foreignKeys = models
             .map(model => model.getAttribute(this.foreignKey))
             .filter(key => key !== null && key !== undefined);

        if (foreignKeys.length === 0) {
             // No valid foreign keys, no related models can be matched
             this.query.whereRaw('1 = 0');
             return;
        }
        this.query.whereIn(ownerKeyName, [...new Set(foreignKeys)]); // Use unique keys
    }

    /** @inheritdoc */
    match(models, results, relationName) {
         const dictionary = this.buildDictionary(results, this.ownerKey);

         for (const model of models) {
              const foreignKeyValue = model.getAttribute(this.foreignKey);
              let relatedModel = null;
              if (foreignKeyValue !== null && dictionary[foreignKeyValue]) {
                   relatedModel = dictionary[foreignKeyValue];
              }
              model.setRelation(relationName, relatedModel);
         }
         return models;
    }

    /** @inheritdoc */
    async getResults() {
        return this.parent.getAttribute(this.foreignKey) === null
            ? null // Foreign key is null, cannot have a related model
            : await this.query.first();
    }

     /**
      * Associate the relationship with a new related model instance or ID.
      * Sets the foreign key on the parent model.
      * @param {Model | number | string} modelOrId Related model instance or its ID.
      * @returns {Model} The parent model instance.
      */
     associate(modelOrId) {
          const ownerKeyValue = (modelOrId instanceof this.related)
               ? modelOrId.getKey()
               : modelOrId;

           this.parent.setAttribute(this.foreignKey, ownerKeyValue);
           // Set the relation in memory as well if a model instance was provided
           if (modelOrId instanceof this.related) {
                this.parent.setRelation(this.relationName, modelOrId);
           }

          return this.parent; // Return parent for chaining
     }

     /**
      * Dissociate the relationship.
      * Sets the foreign key on the parent model to null.
      * @returns {Model} The parent model instance.
      */
     dissociate() {
          this.parent.setAttribute(this.foreignKey, null);
          this.parent.setRelation(this.relationName, null);
          return this.parent;
     }

      /** @inheritdoc */
      getRelationExistenceQuery(query, parentQuery, condition) {
           // Check if the parent's foreign key matches the related model's owner key
           query.whereColumn(
               this.getQualifiedOwnerKeyName(), // related.ownerKey
                '=',
                parentQuery._model.getQualifiedTableName() + '.' + this.foreignKey // parent.foreignKey
           );
           return query;
      }

       /** Get the fully qualified owner key name. */
       getQualifiedOwnerKeyName() {
            return this.related.getQualifiedTableName() + '.' + this.ownerKey;
       }
}

// Apply proxy for QueryBuilder method delegation
export const BelongsToProxy = new Proxy(BelongsTo, {
     construct(target, args) {
          const instance = new target(...args);
          return Relation.createProxy(instance);
     }
});