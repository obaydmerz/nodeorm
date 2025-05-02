/**
 * @fileoverview MySQL specific SQL grammar compiler.
 */
import { BaseGrammar } from '../BaseGrammar.js';

/**
 * MySQL specific SQL grammar.
 */
export class MySQLGrammar extends BaseGrammar {
    /** @inheritdoc */
    _identifierWrapper = '`';

    /** @inheritdoc */
     compileLimit(query, limit) {
         return super.compileLimit(query, limit);
     }

    /**
     * Compile an update statement with joins (MySQL specific).
     * Example: UPDATE users JOIN profiles ON ... SET users.name = ? WHERE ...
     * Note: Standard SQL doesn't support JOINs directly in UPDATE like this.
     * @param {import('../../query/QueryBuilder').QueryBuilder} query
     * @param {object} values
     * @returns {string}
     */
    compileUpdateWithJoins(query, values) {
        const table = this.wrapTable(query._from);
        const joins = this.compileJoins(query, query._joins);

        const columns = Object.keys(values).map(key => {
             // We need to ensure column names are qualified if joins are present
             // For simplicity, assume keys in `values` might need wrapping/qualification.
             // A more robust solution might involve analyzing aliases.
             return `${this.wrap(key)} = ${this.parameter(values[key], query)}`;
        }).join(', ');

        const wheres = this.compileWheres(query); // WHERE clause applies after joins

        // MySQL supports LIMIT on UPDATE
        const limit = query._limit > 0 ? `LIMIT ${parseInt(query._limit, 10)}` : '';

        // Construct the MySQL specific UPDATE ... JOIN syntax
        return `UPDATE ${table} ${joins} SET ${columns} ${wheres} ${limit}`.trim();
    }

    /**
     * Override compileUpdate to handle potential joins.
     * @inheritdoc
     */
    compileUpdate(query, values) {
        if (query._joins && query._joins.length > 0) {
            return this.compileUpdateWithJoins(query, values);
        }
        // Default update compilation without joins
        const table = this.wrapTable(query._from);
        const columns = Object.keys(values).map(key => {
             return `${this.wrap(key)} = ${this.parameter(values[key], query)}`;
        }).join(', ');
        const wheres = this.compileWheres(query);
        const limit = query._limit > 0 ? `LIMIT ${parseInt(query._limit, 10)}` : '';
        return `UPDATE ${table} SET ${columns} ${wheres} ${limit}`.trim();
    }


    /**
     * Compile a delete statement with joins (MySQL specific).
     * Example: DELETE u FROM users u JOIN ... WHERE ...
     * Needs careful handling of which table(s) to delete from.
     * For simplicity, this basic version assumes deleting from the primary table (_from).
     * @param {import('../../query/QueryBuilder').QueryBuilder} query
     * @returns {string}
     */
    compileDeleteWithJoins(query) {
        const tableAlias = typeof query._from === 'string' ? query._from.split(/\s+as\s+/i)[0] : query._from; // Get base table name/alias
        const primaryTableWrapped = this.wrapTable(tableAlias); // Wrap the primary table/alias to delete from

        const table = this.wrapTable(query._from); // FROM clause table
        const joins = this.compileJoins(query, query._joins);
        const wheres = this.compileWheres(query);
        const limit = query._limit > 0 ? `LIMIT ${parseInt(query._limit, 10)}` : '';

        // MySQL Syntax: DELETE alias FROM table alias JOIN ... WHERE ...
        // If the primary table has an alias, use that in the DELETE part.
        const deleteTarget = primaryTableWrapped !== table ? primaryTableWrapped : table; // Use alias if different

        return `DELETE ${deleteTarget} FROM ${table} ${joins} ${wheres} ${limit}`.trim();
    }

    /**
     * Override compileDelete to handle potential joins.
     * @inheritdoc
     */
    compileDelete(query) {
        if (query._joins && query._joins.length > 0) {
            return this.compileDeleteWithJoins(query);
        }
         // Default delete compilation without joins
         const table = this.wrapTable(query._from);
         const wheres = this.compileWheres(query);
         if (!wheres && query.strictMode !== false) {
              throw new Error('Attempting to delete without a WHERE clause. Use .allowFullTableDelete() to bypass this safety check.');
         }
         const limit = query._limit > 0 ? `LIMIT ${parseInt(query._limit, 10)}` : '';
         return `DELETE FROM ${table} ${wheres} ${limit}`.trim();
    }

    /**
     * Compile a truncate statement. Disable foreign key checks for MySQL.
     * @inheritdoc
     */
    compileTruncate(query) {
        const table = this.wrapTable(query._from);
        // Note: This assumes the user has privileges to set session variables.
        // Driver needs to support multipleStatements: true
        return [
            'SET FOREIGN_KEY_CHECKS=0;',
            `TRUNCATE TABLE ${table};`,
            'SET FOREIGN_KEY_CHECKS=1;'
        ].join('\n');
    }

     /**
      * Compile an "insert ignore" statement.
      * @param {import('../../query/QueryBuilder').QueryBuilder} query
      * @param {object[]} values
      * @returns {string}
      */
     compileInsertOrIgnore(query, values) {
         const sql = this.compileInsert(query, values);
         return sql.replace(/^INSERT /i, 'INSERT IGNORE ');
     }

     /**
      * Compile an "upsert" statement (insert on duplicate key update).
      * @param {import('../../query/QueryBuilder').QueryBuilder} query
      * @param {object[]} values Values to insert/update. Assumes single row for simplicity here.
      * @param {string[]} uniqueBy Columns to check for duplicates.
      * @param {string[]} update Columns to update on duplicate.
      * @returns {string}
      */
     compileUpsert(query, values, uniqueBy, update) {
         const insertSql = this.compileInsert(query, values);
         if (update.length === 0) {
              // If no update columns specified, effectively becomes insert ignore
              return this.compileInsertOrIgnore(query, values);
         }
         const updateColumns = update.map(col => {
              const wrappedCol = this.wrap(col);
              // Use VALUES(column) syntax for MySQL
              return `${wrappedCol} = VALUES(${wrappedCol})`;
         }).join(', ');

         return `${insertSql} ON DUPLICATE KEY UPDATE ${updateColumns}`;
     }

      /**
       * Prepare bindings for an update statement. MySQL doesn't reorder like some grammars.
       * @param {object} bindings
       * @param {object} values
       * @returns {any[]}
       */
      prepareBindingsForUpdate(bindings, values) {
          // MySQL bindings are typically in order: SET values first, then WHERE values.
          const sortedBindings = [];
          Object.values(values).forEach(value => sortedBindings.push(this.formatBinding(value)));
          // Order of bindings from QueryBuilder: JOIN, WHERE, HAVING, ORDER, UNION
          bindings.join?.forEach(binding => sortedBindings.push(this.formatBinding(binding)));
          bindings.where?.forEach(binding => sortedBindings.push(this.formatBinding(binding)));
          // Bindings for HAVING, ORDER, UNION are typically not used in standard UPDATEs
          return sortedBindings;
      }

       /**
        * Prepare bindings for insert.
        * @param {any[]} bindings Raw bindings array (usually from the 'where' slot used by parameterize).
        * @returns {any[]} Formatted bindings.
        */
       prepareBindingsForInsert(bindings) {
            // Flatten if necessary (if insert values were nested) and format
            return bindings.flat().map(binding => this.formatBinding(binding));
       }
}