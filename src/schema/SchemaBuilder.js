/**
 * @fileoverview Translates Blueprint definitions into executable SQL schema commands.
 */
import { QueryError } from '../errors.js';

/**
 * @typedef {import('../connection/Connection.js').Connection} Connection
 * @typedef {import('../drivers/BaseGrammar.js').BaseGrammar} BaseGrammar
 * @typedef {import('./Blueprint.js').Blueprint} Blueprint
 */

/**
 * Executes schema operations defined by a Blueprint.
 */
export class SchemaBuilder {
    /** @type {Connection} */
    _connection;
    /** @type {BaseGrammar} */
    _grammar;

    /**
     * @param {Connection} connection
     */
    constructor(connection) {
        this._connection = connection;
        // We need the SchemaGrammar, not the query grammar
        this._grammar = connection.getDriver().getSchemaGrammar();
    }

    /**
     * Create a new table based on the Blueprint definition.
     * @param {string} tableName
     * @param {Blueprint} blueprint
     * @returns {Promise<void>}
     */
    async createTable(tableName, blueprint) {
        const sqlCommands = this._grammar.compileCreate(tableName, blueprint);
        await this._runCommands(sqlCommands, `Create table ${tableName}`);
    }

    /**
     * Modify an existing table based on the Blueprint definition.
     * @param {string} tableName
     * @param {Blueprint} blueprint
     * @returns {Promise<void>}
     */
    async alterTable(tableName, blueprint) {
        const sqlCommands = this._grammar.compileAlter(tableName, blueprint);
        if (sqlCommands.length > 0) {
             await this._runCommands(sqlCommands, `Alter table ${tableName}`);
        } else {
             console.log(`NodeORM Schema: No alter commands generated for table ${tableName}.`);
        }
    }

    /**
     * Drop a table if it exists.
     * @param {string} tableName
     * @returns {Promise<void>}
     */
    async dropTableIfExists(tableName) {
        const sql = this._grammar.compileDropIfExists(tableName);
        await this._runCommands([sql], `Drop table if exists ${tableName}`);
    }

    /**
     * Drop a table.
     * @param {string} tableName
     * @returns {Promise<void>}
     */
    async dropTable(tableName) {
         const sql = this._grammar.compileDrop(tableName);
         await this._runCommands([sql], `Drop table ${tableName}`);
    }

     /**
      * Rename a table.
      * @param {string} from Old table name.
      * @param {string} to New table name.
      * @returns {Promise<void>}
      */
     async renameTable(from, to) {
         const sql = this._grammar.compileRename(from, to);
         await this._runCommands([sql], `Rename table ${from} to ${to}`);
     }

      /**
       * Enable foreign key constraints (if driver supports/needs it).
       * @returns {Promise<void>}
       */
      async enableForeignKeyConstraints() {
          if (typeof this._grammar.compileEnableForeignKeyConstraints === 'function') {
              const sql = this._grammar.compileEnableForeignKeyConstraints();
               if(sql) await this._runCommands([sql], `Enable foreign keys`);
          }
      }

      /**
       * Disable foreign key constraints (if driver supports/needs it).
       * @returns {Promise<void>}
       */
      async disableForeignKeyConstraints() {
          if (typeof this._grammar.compileDisableForeignKeyConstraints === 'function') {
              const sql = this._grammar.compileDisableForeignKeyConstraints();
              if(sql) await this._runCommands([sql], `Disable foreign keys`);
          }
      }

       /**
        * Get the column listing for a given table.
        * @param {string} tableName
        * @returns {Promise<string[]>}
        */
       async getColumnListing(tableName) {
            const sql = this._grammar.compileColumnListing(tableName);
            const results = await this._connection.run(sql);
            // The result format depends heavily on the driver and the specific query used by the grammar
            // Assume the grammar's compileColumnListing produces SQL returning rows with a 'name' or similar field.
            // This needs refinement based on actual grammar implementations.
            if (!Array.isArray(results)) {
                 console.warn(`NodeORM Schema: Unexpected result format for getColumnListing on table ${tableName}`);
                 return [];
            }
            // Attempt common patterns for column name extraction
            return results.map(row => row.name || row.Name || row.COLUMN_NAME || row.column_name).filter(Boolean);
       }

        /**
         * Check if a table exists.
         * @param {string} tableName
         * @returns {Promise<boolean>}
         */
        async hasTable(tableName) {
             const sql = this._grammar.compileTableExists(tableName);
             try {
                  const result = await this._connection.run(sql);
                  // Result interpretation depends on the grammar's query.
                  // Often it's checking if a query returns any rows or a specific count/value.
                  return Array.isArray(result) ? result.length > 0 : !!result;
             } catch (e) {
                  // Some drivers might throw if table doesn't exist even with checking query
                  if(e instanceof QueryError && e.originalError?.code?.includes('DOES_NOT_EXIST')) { // Example check
                    return false;
                  }
                  // Don't suppress other errors
                  throw e;
             }
        }

        /**
         * Check if a specific column exists in a table.
         * @param {string} tableName
         * @param {string} columnName
         * @returns {Promise<boolean>}
         */
        async hasColumn(tableName, columnName) {
             // Optimization: Fetch all columns once and check
             const columns = await this.getColumnListing(tableName);
             return columns.map(c => c.toLowerCase()).includes(columnName.toLowerCase());
        }


    /**
     * Run the given SQL commands.
     * @param {string | string[]} commands
     * @param {string} operationDesc Description for logging
     * @returns {Promise<void>}
     * @private
     */
    async _runCommands(commands, operationDesc) {
        const commandArray = Array.isArray(commands) ? commands : [commands];
        for (const sql of commandArray) {
            if (!sql || typeof sql !== 'string' || sql.trim() === '') continue;
            console.debug(`NodeORM Schema Executing (${operationDesc}): ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);
            try {
                 // Use run directly as schema changes don't usually return meaningful rows
                await this._connection.run(sql);
            } catch (error) {
                 console.error(`NodeORM Schema Error (${operationDesc}): Failed to execute command.\nSQL: ${sql}`);
                throw error; // Re-throw schema execution errors
            }
        }
    }
}