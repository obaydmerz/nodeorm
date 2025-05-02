/**
 * @fileoverview Abstract base class for all database drivers.
 */
import { NodeOrmError } from '../errors.js';
import { BaseGrammar } from './BaseGrammar.js';
import { BaseSchemaGrammar } from '../schema/BaseSchemaGrammar.js'; // Import Schema Grammar Base

/**
 * Abstract base class defining the interface for database drivers.
 * Concrete drivers (MySQL, Postgres, SQLite) must extend this class.
 * @abstract
 */
export class BaseDriver {
    /** @type {object} */
    _config;
    /** @type {any} The underlying database connection or pool object. */
    _connection;
    /** @type {BaseGrammar} The grammar instance for this driver's SQL dialect. */
    _grammar;
    /** @type {boolean} Indicates if the driver is currently connected. */
    _isConnected = false;

    /**
     * @param {object} config Driver configuration.
     */
    constructor(config) {
        if (this.constructor === BaseDriver) {
            throw new TypeError('Abstract class "BaseDriver" cannot be instantiated directly.');
        }
        this._config = config;
        this._grammar = this._createGrammar();
    }

    /**
     * Abstract method to create the specific SchemaGrammar instance for this driver.
     * @returns {BaseSchemaGrammar}
     * @protected
     * @abstract
     */
    _createSchemaGrammar() { throw new NodeOrmError('Method "_createSchemaGrammar" must be implemented.'); }

    /**
     * Abstract method to create the specific Grammar instance for this driver.
     * @returns {BaseGrammar}
     * @protected
     * @abstract
     */
    _createGrammar() {
        throw new NodeOrmError('Method "_createGrammar" must be implemented by concrete driver class.');
    }

    /**
     * Establishes the database connection.
     * @returns {Promise<void>}
     * @abstract
     */
    async connect() {
        throw new NodeOrmError('Method "connect" must be implemented by concrete driver class.');
    }

    /**
     * Closes the database connection.
     * @returns {Promise<void>}
     * @abstract
     */
    async disconnect() {
        throw new NodeOrmError('Method "disconnect" must be implemented by concrete driver class.');
    }

    /**
     * Checks if the driver is currently connected.
     * @returns {boolean}
     */
    isConnected() {
        return this._isConnected;
    }

    /**
     * Executes a SQL query with bindings.
     * @param {string} sql The SQL query string.
     * @param {any[]} bindings Parameter bindings.
     * @returns {Promise<any[] | { affectedRows?: number, insertId?: any }>} Results or execution metadata.
     * @abstract
     */
    async run(sql, bindings) {
        throw new NodeOrmError('Method "run" must be implemented by concrete driver class.');
    }

    /**
     * Begins a database transaction.
     * @param {object} [options] Driver-specific transaction options (e.g., isolation level).
     * @returns {Promise<BaseDriver>} A new driver instance representing the transaction context.
     * @abstract
     */
    async beginTransaction(options) {
        throw new NodeOrmError('Method "beginTransaction" must be implemented by concrete driver class.');
    }

    /**
     * Commits the current transaction (if applicable).
     * This method should typically be called on the transactional driver instance.
     * @returns {Promise<void>}
     * @abstract
     */
    async commit() {
        throw new NodeOrmError('Method "commit" must be implemented by concrete driver class.');
    }

    /**
     * Rolls back the current transaction (if applicable).
     * This method should typically be called on the transactional driver instance.
     * @returns {Promise<void>}
     * @abstract
     */
    async rollback() {
        throw new NodeOrmError('Method "rollback" must be implemented by concrete driver class.');
    }

    /**
     * Fetches schema information for a given table.
     * Should return an object describing columns (name, type, nullable, default, etc.).
     * @param {string} tableName The name of the table.
     * @returns {Promise<{tableName: string, columns: Record<string, {name: string, type: string, dataType: string, nullable: boolean, default: any, isPrimaryKey?: boolean, isAutoIncrementing?: boolean}>}>} Schema information.
     * @abstract
     */
    async getTableSchema(tableName) {
        throw new NodeOrmError('Method "getTableSchema" must be implemented by concrete driver class.');
    }

    /**
     * Gets the Grammar instance associated with this driver.
     * @returns {BaseGrammar}
     */
    getGrammar() {
        if (!this._grammar) {
            this._grammar = this._createGrammar();
        }
        return this._grammar;
    }

    /**
     * Gets the SchemaGrammar instance associated with this driver.
     * @returns {BaseSchemaGrammar}
     */
    getSchemaGrammar() {
        if (!this._schemaGrammar) {
             // Pass the query grammar for utility access (like wrapping)
            this._schemaGrammar = this._createSchemaGrammar(this.getGrammar());
        }
        return this._schemaGrammar;
    }

    /**
     * Formats a value for use as a binding in a query, specific to the database.
     * @param {*} value The value to format.
     * @returns {*} The formatted value.
     */
    formatBinding(value) {
        // Base implementation: Let grammar handle basic types
        return this.getGrammar().formatBinding(value);
    }

    /**
     * Dynamically imports a package, handling potential errors.
     * @param {string} packageName The name of the package to import.
     * @param {string} driverName For error messages.
     * @returns {Promise<any>} The imported module.
     * @protected
     * @throws {DriverPackageNotFoundError} If the package cannot be imported.
     */
     async _importPackage(packageName, driverName) {
         try {
             // @ts-ignore Dynamic import
             return await import(packageName);
         } catch (error) {
             if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('Cannot find package')) {
                 throw new DriverPackageNotFoundError(driverName, packageName);
             }
             throw error; // Re-throw other import errors
         }
     }

     /**
      * Describe a table's structure and return a Blueprint object.
      * @param {string} tableName
      * @returns {Promise<Blueprint>}
      * @abstract
      */
     async describeTable(tableName) {
        throw new NodeOrmError('Method "describeTable" must be implemented by concrete driver class.');
     }
}