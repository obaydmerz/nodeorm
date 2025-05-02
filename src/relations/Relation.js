/**
 * @fileoverview Base class for all relationship types.
 */
import { QueryError } from '../errors.js';

/**
 * @typedef {import('../model/Model.js').Model} Model
 * @typedef {typeof import('../model/Model.js').Model} ModelStatic
 * @typedef {import('../query/QueryBuilder.js').QueryBuilder} QueryBuilder
 */

/**
 * Abstract base class for database relationships.
 */
export class Relation {
    /** @type {QueryBuilder} */
    query;
    /** @type {Model} The parent model instance. */
    parent;
    /** @type {ModelStatic} The related model class. */
    related;

    /**
     * @param {QueryBuilder} query The query builder for the related model.
     * @param {Model} parent The parent model instance initiating the relationship.
     */
    constructor(query, parent) {
        if (this.constructor === Relation) {
            throw new TypeError('Abstract class "Relation" cannot be instantiated directly.');
        }
        this.query = query;
        this.parent = parent;
        this.related = query._model; // Get related model class from query builder
    }

    /**
     * Get the results of the relationship.
     * @returns {Promise<Model | Model[] | null>}
     * @abstract
     */
    async getResults() {
        throw new Error('Method "getResults" must be implemented by concrete relation class.');
    }

    /**
     * Add constraints for eager loading to the relation query.
     * @param {Model[]} models Array of parent models.
     * @abstract
     */
    addEagerConstraints(models) {
         throw new Error('Method "addEagerConstraints" must be implemented by concrete relation class.');
    }

    /**
     * Match the eagerly loaded results to their parents.
     * @param {Model[]} models Array of parent models.
     * @param {Model[]} results The related models fetched via eager loading.
     * @param {string} relationName The name of the relation.
     * @abstract
     */
    match(models, results, relationName) {
         throw new Error('Method "match" must be implemented by concrete relation class.');
    }

    /**
     * Get the relationship results for eager loading.
     * @returns {Promise<Model[]>}
     */
    async getEager() {
        return this.query.get();
    }

     /**
      * Build dictionary map keyed by foreign/owner key for efficient matching.
      * @param {Model[]} results Related model results.
      * @param {string} keyName The key name on the related models to use for matching (e.g., foreign key).
      * @returns {Record<string, Model | Model[]>} Dictionary map.
      * @protected
      */
     buildDictionary(results, keyName) {
         const dictionary = {};
         for (const result of results) {
              const key = result.getAttribute(keyName);
               if (key === null || key === undefined) continue;

               // Handle potential one-to-many in dictionary for hasMany
               if (this.constructor.name === 'HasMany') { // Check specific relation type
                    if (!dictionary[key]) {
                         dictionary[key] = [];
                    }
                    dictionary[key].push(result);
               } else {
                    dictionary[key] = result; // For HasOne, BelongsTo
               }
         }
         return dictionary;
     }

      /**
       * Build dictionary map for BelongsToMany relations.
       * @param {Model[]} results Related model results (with pivot data).
       * @param {string} foreignPivotKey Foreign key name on the pivot table corresponding to the parent model.
       * @returns {Record<string, Model[]>} Dictionary map.
       * @protected
       */
      buildDictionaryBelongsToMany(results, foreignPivotKey) {
           const dictionary = {};
           for (const result of results) {
                const key = result.pivot?.[foreignPivotKey]; // Access parent's key from pivot data
                if (key === null || key === undefined) continue;

                if (!dictionary[key]) {
                     dictionary[key] = [];
                }
                dictionary[key].push(result);
           }
           return dictionary;
      }


    /**
     * Get the underlying query builder instance.
     * @returns {QueryBuilder}
     */
    getQuery() {
        return this.query;
    }

    /**
     * Get the related model class.
     * @returns {ModelStatic}
     */
    getRelated() {
        return this.related;
    }

     /**
      * Get the parent model instance.
      * @returns {Model}
      */
     getParent() {
          return this.parent;
     }

     /**
      * Add the constraints for a relationship existence query.
      * Used by has(), whereHas() etc. on the parent model's query.
      * @param {QueryBuilder} query Query builder for the related model (subquery).
      * @param {QueryBuilder} parentQuery Query builder for the parent model.
      * @param {Expression} condition The condition to check (e.g., count(*) >= 1).
      * @returns {QueryBuilder} The modified subquery builder.
      * @abstract
      */
      getRelationExistenceQuery(query, parentQuery, condition) {
           throw new Error('Method "getRelationExistenceQuery" must be implemented by concrete relation class.');
      }

    // --- Magic Method Handling for Query Builder Delegation ---

    /**
     * Handle dynamic method calls by forwarding them to the query builder.
     * Allows calling QueryBuilder methods directly on the Relation object.
     * e.g., user.posts().where('active', true).get()
     */
    __call(method, args) {
        const result = this.query[method](...args);
        // If the method returns the QueryBuilder instance, return this (Relation instance)
        // to maintain the fluent interface on the Relation object.
        if (result === this.query) {
            return this;
        }
        // Otherwise, return the result from the QueryBuilder method (e.g., get(), first(), count())
        return result;
    }

     /**
      * Handle dynamic property access by forwarding to the query builder or parent model.
      * Primarily useful for debugging or accessing builder properties.
      */
     __get(prop) {
         // Prioritize properties/methods on the Relation instance itself
         if (Reflect.has(this, prop)) {
              return Reflect.get(this, prop);
         }
         // Try forwarding to the query builder
         if (Reflect.has(this.query, prop)) {
             const value = Reflect.get(this.query, prop);
             // If it's a function, bind it to the query builder and return (allows calling builder methods)
             if (typeof value === 'function') {
                  return (...args) => this.__call(prop, args); // Use __call for proper return handling
             }
             return value; // Return property value directly
         }
         // Could potentially forward to parent model? Less common.
         throw new QueryError(`Property or method '${prop}' not found on Relation or its QueryBuilder.`);
     }

     /**
      * Make relation instance callable like a function (for syntactic sugar if desired).
      * e.g., user.posts // Accessor -> lazy loads Promise<Model[]>
      * e.g., user.posts() // Method -> returns Relation instance (QueryBuilder proxy)
      */
     apply(target, thisArg, argumentsList) {
         // When called like `relation()`, return the relation instance itself
         // This allows chaining query builder methods.
         return this;
     }

     // --- Proxy setup for Query Builder delegation ---
     static createProxy(relationInstance) {
          // Ensure the target is the relation instance itself, not the constructor
          const target = relationInstance;
          return new Proxy(target, {
               get(targetInstance, prop, receiver) {
                    // Prioritize properties on the Relation instance itself
                    if (prop in targetInstance || typeof prop === 'symbol') {
                         return Reflect.get(targetInstance, prop, receiver);
                    }
                    // Forward to the QueryBuilder
                    const query = targetInstance.query;
                    const queryProp = Reflect.get(query, prop);

                    if (typeof queryProp === 'function') {
                         // If accessing a method, return a function that calls it on the query builder
                         // and returns the Relation instance (proxy) for chaining if appropriate.
                         return (...args) => {
                              const result = queryProp.apply(query, args);
                              // Return the proxy (receiver) to allow chaining on the relation object
                              return result === query ? receiver : result;
                         };
                    }
                    // Return property value from query builder
                    return queryProp;
               },
                // Add set trap if needed to forward to query builder properties
               set(targetInstance, prop, value, receiver) {
                   // Allow setting properties on the relation itself
                   if (prop in targetInstance || typeof prop === 'symbol') {
                       return Reflect.set(targetInstance, prop, value, receiver);
                   }
                   // Forward setting to the query builder
                   return Reflect.set(targetInstance.query, prop, value);
               },
               has(targetInstance, prop) {
                    return Reflect.has(targetInstance, prop) || Reflect.has(targetInstance.query, prop);
               },
               // Add other traps (ownKeys, getOwnPropertyDescriptor) if needed for full transparency
          });
     }
}