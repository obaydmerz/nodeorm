/**
 * @fileoverview PostgreSQL specific SQL grammar compiler.
 */
import { debugWarn } from '../../utils/helpers.js';
import { BaseGrammar } from '../BaseGrammar.js';

/**
 * PostgreSQL specific SQL grammar.
 */
export class PostgresGrammar extends BaseGrammar {
    /** @inheritdoc */
    _identifierWrapper = '"';

    /**
     * Compile the LIMIT clause.
     * @inheritdoc
     */
    compileLimit(query, limit) {
        return limit > 0 ? `LIMIT ${parseInt(limit, 10)}` : '';
    }

    /**
     * Compile the OFFSET clause.
     * @inheritdoc
     */
    compileOffset(query, offset) {
        return offset > 0 ? `OFFSET ${parseInt(offset, 10)}` : '';
    }

     /**
      * Get the appropriate query parameter placeholder ($1, $2, etc.).
      * @inheritdoc
      */
     getBindingPlaceholder(index) {
         return `$${index}`;
     }

     /**
      * Compile an insert statement and return the specified column (usually ID).
      * @inheritdoc
      */
     compileInsertGetId(query, values, sequence = 'id') {
         const sql = this.compileInsert(query, values);
         return `${sql} RETURNING ${this.wrap(sequence || 'id')}`;
     }

     /**
      * Compile an "upsert" statement (insert on conflict do update/nothing).
      * @param {import('../../query/QueryBuilder').QueryBuilder} query
      * @param {object[]} values Values to insert/update.
      * @param {string[]} conflictTarget Columns/constraint to check for conflicts.
      * @param {string[]} update Columns to update on conflict. If empty, DO NOTHING.
      * @returns {string}
      */
     compileUpsert(query, values, conflictTarget, update) {
         const insertSql = this.compileInsert(query, values);
         const conflictColumns = this.columnize(conflictTarget);

         if (update.length === 0) {
              // ON CONFLICT DO NOTHING
              return `${insertSql} ON CONFLICT (${conflictColumns}) DO NOTHING`;
         } else {
              // ON CONFLICT DO UPDATE
              const updateColumns = update.map(col => {
                   const wrappedCol = this.wrap(col);
                   // Use EXCLUDED.column syntax for Postgres
                   return `${wrappedCol} = EXCLUDED.${wrappedCol}`;
              }).join(', ');
              return `${insertSql} ON CONFLICT (${conflictColumns}) DO UPDATE SET ${updateColumns}`;
         }
     }

     /**
      * Compile a truncate statement. Postgres supports CASCADE and RESTART IDENTITY.
      * @inheritdoc
      */
     compileTruncate(query) {
         const table = this.wrapTable(query._from);
         // Add options if needed, e.g., query._truncateOptions = { restartIdentity: true, cascade: false }
         let options = '';
         if (query._truncateOptions?.restartIdentity) {
              options += ' RESTART IDENTITY';
         }
         if (query._truncateOptions?.cascade) {
              options += ' CASCADE';
         }
         return `TRUNCATE TABLE ${table}${options}`;
     }

      /**
       * Prepare bindings for update. Postgres uses numbered placeholders, order matters.
       * The QueryBuilder collects bindings in order (set, joins, wheres).
       * @param {object} bindings Collected bindings from QueryBuilder ({ select: [], from: [], join: [], where: [], group: [], having: [], order: [], union: [] }).
       * @param {object} values The values being updated (for the SET clause).
       * @returns {any[]} The final ordered bindings array.
       */
      prepareBindingsForUpdate(bindings, values) {
           // Order: SET, JOIN, WHERE
           const finalBindings = [];
           Object.values(values).forEach(value => finalBindings.push(this.formatBinding(value)));
           bindings.join?.forEach(binding => finalBindings.push(this.formatBinding(binding)));
           bindings.where?.forEach(binding => finalBindings.push(this.formatBinding(binding)));
           return finalBindings;
      }

      /**
       * Prepare bindings for insert.
       * @param {any[]} bindings Raw bindings array.
       * @returns {any[]} Formatted bindings.
       */
      prepareBindingsForInsert(bindings) {
           // Flatten if necessary (if insert values were nested) and format
           return bindings.flat().map(binding => this.formatBinding(binding));
      }

      /**
       * Format JSON binding. Postgres expects strings for JSON/JSONB.
       * @inheritdoc
       */
      formatBinding(value) {
          if (Array.isArray(value) || isObject(value)) {
              // Ensure JSON is stringified for Postgres JSON/JSONB types
              try {
                  return JSON.stringify(value);
              } catch (e) {
                  debugWarn(`NodeORM Warning: Could not JSON stringify value for binding: ${e.message}`);
                  return null;
              }
          }
           if (typeof value === 'boolean') {
               return value; // Postgres handles boolean types directly
           }
          return super.formatBinding(value); // Handle dates, nulls etc.
      }
}