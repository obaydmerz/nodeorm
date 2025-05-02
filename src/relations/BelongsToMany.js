/**
 * @fileoverview BelongsToMany relationship implementation.
 */
import { Relation } from './Relation.js';
import { QueryError } from '../errors.js';
import { formatDateForDb } from '../utils/date.js';

/**
 * Represents a BelongsToMany (many-to-many) relationship.
 * Example: A Post belongs to many Tags, and a Tag belongs to many Posts.
 */
export class BelongsToMany extends Relation {
    /** @type {string} The intermediate pivot table name. */
    pivotTable;
    /** @type {string} Foreign key of the parent model on the pivot table. */
    foreignPivotKey;
    /** @type {string} Foreign key of the related model on the pivot table. */
    relatedPivotKey;
    /** @type {string} Primary key of the parent model. */
    parentKey;
    /** @type {string} Primary key of the related model. */
    relatedKey;
    /** @type {string} The name of the relationship method on the parent model. */
    relationName;

    /** @type {string} Alias for the pivot table during queries. */
    pivotAlias = 'pivot_table';

     /** @type {string[]} Columns to select from the pivot table. */
     pivotColumns = [];
      /** @type {boolean} Indicates if pivot timestamps ('created_at', 'updated_at') should be used. */
      usingPivotTimestamps = false;
      /** @type {string | null} Custom pivot created_at column name. */
      pivotCreatedAt = null;
      /** @type {string | null} Custom pivot updated_at column name. */
      pivotUpdatedAt = null;


    /**
     * @param {import('../query/QueryBuilder.js').QueryBuilder} query Query builder for the related model.
     * @param {import('../model/Model.js').Model} parent Parent model instance.
     * @param {string} pivotTable Intermediate table name.
     * @param {string} foreignPivotKey Foreign key of parent on pivot.
     * @param {string} relatedPivotKey Foreign key of related on pivot.
     * @param {string} parentKey Primary key of parent.
     * @param {string} relatedKey Primary key of related.
     * @param {string} relationName Name of the relationship method.
     */
    constructor(
        query, parent, pivotTable, foreignPivotKey,
        relatedPivotKey, parentKey, relatedKey, relationName
    ) {
        super(query, parent);
        this.pivotTable = pivotTable;
        this.foreignPivotKey = foreignPivotKey;
        this.relatedPivotKey = relatedPivotKey;
        this.parentKey = parentKey;
        this.relatedKey = relatedKey;
        this.relationName = relationName;

        // Default pivot columns include the keys
        this.pivotColumns = [this.foreignPivotKey, this.relatedPivotKey];

        this.addConstraints();
    }

    /**
     * Set the base constraints on the relation query.
     * Joins through the pivot table.
     */
    addConstraints() {
         this.performJoin();
         this.query.where(
             `${this.pivotAlias}.${this.foreignPivotKey}`, '=', this.parent.getAttribute(this.parentKey)
         );
    }

     /**
      * Perform the JOIN operation with the pivot table.
      * @protected
      */
     performJoin() {
           const relatedTable = this.related.getQualifiedTableName();
           const pivot = `${this.pivotTable} AS ${this.pivotAlias}`;
           const relatedKeyQualified = `${relatedTable}.${this.relatedKey}`;
           const pivotRelatedKeyQualified = `${this.pivotAlias}.${this.relatedPivotKey}`;

           this.query.join(pivot, relatedKeyQualified, '=', pivotRelatedKeyQualified);
           return this;
     }

    /** @inheritdoc */
    addEagerConstraints(models) {
         const parentKeyName = this.parentKey;
         const pivotForeignKey = `${this.pivotAlias}.${this.foreignPivotKey}`; // Use alias

         // Collect all parent key values
         const parentKeys = models.map(model => model.getAttribute(parentKeyName));

         this.query.whereIn(pivotForeignKey, [...new Set(parentKeys)]);
    }

    /** @inheritdoc */
    match(models, results, relationName) {
         // Build dictionary keyed by the parent's foreign key on the pivot table
         const dictionary = this.buildDictionaryBelongsToMany(results, this.foreignPivotKey);

         for (const model of models) {
              const parentKeyValue = model.getAttribute(this.parentKey);
              let relatedModels = [];
              if (parentKeyValue !== null && dictionary[parentKeyValue]) {
                   relatedModels = dictionary[parentKeyValue];
              }
              model.setRelation(relationName, relatedModels);
         }
         return models;
    }

    /** @inheritdoc */
    async getResults() {
         // Select related model columns and pivot columns
         this.addSelectPivotColumns();
        return await this.query.get();
    }

     /**
      * Adds select clauses for the pivot table columns.
      * @protected
      */
     addSelectPivotColumns() {
          const relatedTable = this.related.getQualifiedTableName();
          // Ensure related table's columns are selected prefixed
          if (this.query._selects.length === 0 || (this.query._selects.length === 1 && this.query._selects[0] === '*')) {
               this.query._selects = [`${relatedTable}.*`];
          }

          // Add pivot columns prefixed with 'pivot_'
          this.pivotColumns.forEach(column => {
               this.query.addSelect(`${this.pivotAlias}.${column} as pivot_${column}`);
          });
     }

     /**
      * Hydrate pivot data onto the related model instances.
      * @param {Model[]} results
      * @returns {Model[]}
      * @protected
      */
     hydratePivotRelation(results) {
          for (const model of results) {
               const pivotData = {};
               const attributes = model.getAttributes(); // Get all attributes including pivot_ ones
               Object.keys(attributes).forEach(key => {
                    if (key.startsWith('pivot_')) {
                         const pivotKey = key.substring(6); // Remove 'pivot_' prefix
                         pivotData[pivotKey] = attributes[key];
                         // Optionally remove pivot_ key from main attributes?
                         // delete model._attributes[key];
                    }
               });
               // Attach pivot data to the model instance
               model.pivot = pivotData;
          }
          return results;
     }

      /** @inheritdoc */
      async getEager() {
           this.addSelectPivotColumns(); // Ensure pivot columns are selected
           const results = await this.query.get();
           return this.hydratePivotRelation(results);
      }


    // --- Pivot Table Modification ---

    /**
     * Specify additional columns to retrieve from the pivot table.
     * @param {...string} columns Pivot column names.
     * @returns {this}
     */
    withPivot(...columns) {
         this.pivotColumns.push(...columns.filter(c => !this.pivotColumns.includes(c)));
         return this;
    }

     /**
      * Indicate that the pivot table has timestamps (created_at, updated_at).
      * @param {string} [createdAt='created_at'] Custom created_at column name.
      * @param {string} [updatedAt='updated_at'] Custom updated_at column name.
      * @returns {this}
      */
     withTimestamps(createdAt = 'created_at', updatedAt = 'updated_at') {
          this.usingPivotTimestamps = true;
          this.pivotCreatedAt = createdAt;
          this.pivotUpdatedAt = updatedAt;
          // Add timestamp columns to pivot selection if not already present
           if (!this.pivotColumns.includes(createdAt)) this.pivotColumns.push(createdAt);
           if (!this.pivotColumns.includes(updatedAt)) this.pivotColumns.push(updatedAt);
          return this;
     }

     /**
      * Attach related model IDs to the parent model.
      * @param {any | any[]} ids Single ID or array of IDs to attach.
      * @param {Record<string, any>} [pivotAttributes={}] Additional attributes for the pivot table record.
      * @param {boolean} [touch=true] Touch parent model timestamps.
      * @returns {Promise<void>}
      */
     async attach(ids, pivotAttributes = {}, touch = true) {
          const recordsToInsert = [];
          const attachIds = Array.isArray(ids) ? ids : [ids];
          const parentValue = this.parent.getAttribute(this.parentKey);
           const now = this.usingPivotTimestamps ? new Date() : null;

          for (const id of attachIds) {
               const record = {
                    [this.foreignPivotKey]: parentValue,
                    [this.relatedPivotKey]: id,
                    ...pivotAttributes
               };
                if (this.usingPivotTimestamps) {
                     record[this.pivotCreatedAt] = now;
                     record[this.pivotUpdatedAt] = now;
                }
               recordsToInsert.push(record);
          }

          if (recordsToInsert.length > 0) {
               // Use basic query builder for pivot table
               await this.newPivotQuery().insert(recordsToInsert);

               if (touch) await this.touchIfTouching();
          }
     }

     /**
      * Detach related model IDs from the parent model.
      * If no IDs provided, detaches all related models.
      * @param {any | any[]} [ids] Single ID, array of IDs, or null/undefined to detach all.
      * @param {boolean} [touch=true] Touch parent model timestamps.
      * @returns {Promise<number>} Number of detached records.
      */
     async detach(ids, touch = true) {
          const query = this.newPivotQuery();
          const detachIds = ids !== null && ids !== undefined ? (Array.isArray(ids) ? ids : [ids]) : null;

          // Constrain query to the parent model
          query.where(this.foreignPivotKey, '=', this.parent.getAttribute(this.parentKey));

          if (detachIds) {
               query.whereIn(this.relatedPivotKey, detachIds);
          }

           const affectedRows = await query.delete();

           if (affectedRows > 0 && touch) {
                await this.touchIfTouching();
           }

          return affectedRows;
     }

     /**
      * Sync the intermediate table records for the relationship.
      * Attaches new IDs, detaches missing IDs.
      * @param {any[]} ids Array of related model IDs to sync.
      * @param {boolean} [detaching=true] Whether to detach IDs not present in the sync array.
      * @returns {Promise<{ attached: any[], detached: any[], updated: any[] }>} Sync results.
      */
     async sync(ids, detaching = true) {
          const currentIds = await this.newPivotQuery()
               .where(this.foreignPivotKey, '=', this.parent.getAttribute(this.parentKey))
               .pluck(this.relatedPivotKey); // Get currently attached related IDs

           // Convert all IDs to string/number for consistent comparison
           const current = currentIds.map(String);
           const sync = ids.map(String);

           const detachIds = current.filter(id => !sync.includes(id));
           const attachIds = sync.filter(id => !current.includes(id));

           const results = { attached: [], detached: [], updated: [] }; // Updated not implemented in basic sync

           if (attachIds.length > 0) {
               // Attach new IDs (basic attach without pivot attributes here)
               await this.attach(attachIds);
               results.attached = attachIds;
           }

           if (detaching && detachIds.length > 0) {
               // Detach missing IDs
               await this.detach(detachIds);
               results.detached = detachIds;
           }

          // Touch timestamp only once if changes were made
           if (results.attached.length > 0 || results.detached.length > 0) {
                await this.touchIfTouching();
           }

          return results;
     }

      /**
       * Update existing records in the pivot table.
       * @param {any} id Related model ID whose pivot record should be updated.
       * @param {Record<string, any>} attributes Attributes to update on the pivot record.
       * @param {boolean} [touch=true] Touch parent timestamps.
       * @returns {Promise<number>} Number of affected rows.
       */
      async updateExistingPivot(id, attributes, touch = true) {
           const query = this.newPivotQuery()
                .where(this.foreignPivotKey, '=', this.parent.getAttribute(this.parentKey))
                .where(this.relatedPivotKey, '=', id);

            const updateData = { ...attributes };
            // Add updated_at timestamp if needed
            if (this.usingPivotTimestamps) {
                 updateData[this.pivotUpdatedAt] = new Date();
            }

           const affectedRows = await query.limit(1).update(updateData);

           if (affectedRows > 0 && touch) {
                await this.touchIfTouching();
           }
           return affectedRows;
      }


     /**
      * Create a new query builder for the pivot table.
      * @returns {QueryBuilder}
      * @protected
      */
     newPivotQuery() {
           // Use the parent model's connection
          return this.parent.constructor.getConnection().table(this.pivotTable);
     }

      /**
       * Touch the parent model's timestamps if applicable.
       * @returns {Promise<void>}
       * @protected
       */
      async touchIfTouching() {
           if (this.parent.usesTimestamps()) {
                await this.parent.touch(); // Assumes parent has a touch() method
           }
           // TODO: Implement touch() method on Model base class if not already present.
           // It should simply update the updated_at timestamp.
      }

      /**
       * Add a basic WHERE clause to the query for the pivot table.
       * @param {string} column Pivot table column name.
       * @param {string | any} operator Operator or value.
       * @param {any} [value] Value.
       * @param {string} [boolean='and']
       * @returns {this}
       */
      wherePivot(column, operator, value, boolean = 'and') {
           if (value === undefined) { [value, operator] = [operator, '=']; }
           this.query.where(`${this.pivotAlias}.${column}`, operator, value, boolean);
           return this;
      }
      orWherePivot(column, operator, value) { return this.wherePivot(column, operator, value, 'or'); }

       /** Add WHERE IN clause for pivot table column. */
       wherePivotIn(column, values, boolean = 'and', not = false) {
           this.query.whereIn(`${this.pivotAlias}.${column}`, values, boolean, not);
           return this;
       }
       orWherePivotIn(column, values) { return this.wherePivotIn(column, values, 'or'); }
       wherePivotNotIn(column, values, boolean = 'and') { return this.wherePivotIn(column, values, boolean, true); }
       orWherePivotNotIn(column, values) { return this.wherePivotIn(column, values, 'or', true); }


       /** @inheritdoc */
       getRelationExistenceQuery(query, parentQuery, condition) {
            // Check if a related record exists linked via the pivot table
            query.whereColumn(
                 this.getQualifiedRelatedPivotKeyName(), // pivot.related_pivot_key
                 '=',
                 this.related.getQualifiedTableName() + '.' + this.relatedKey // related.relatedKey
            );

            // Further constrain by parent key match on pivot
            query.whereColumn(
                 this.getQualifiedForeignPivotKeyName(), // pivot.foreign_pivot_key
                 '=',
                 parentQuery._model.getQualifiedTableName() + '.' + this.parentKey // parent.parentKey
            );

           // Add the specific existence condition (e.g., count(*) >= 1)
           if (condition instanceof Expression) {
                query.select(condition);
           }

           return query;
      }

       /** Get the qualified foreign pivot key name. */
       getQualifiedForeignPivotKeyName() { return `${this.pivotTable}.${this.foreignPivotKey}`; }
       /** Get the qualified related pivot key name. */
       getQualifiedRelatedPivotKeyName() { return `${this.pivotTable}.${this.relatedPivotKey}`; }
}

// Apply proxy for QueryBuilder method delegation
export const BelongsToManyProxy = new Proxy(BelongsToMany, {
     construct(target, args) {
          const instance = new target(...args);
          return Relation.createProxy(instance);
     }
});