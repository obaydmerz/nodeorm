/**
 * @fileoverview Custom error classes for NodeORM.
 */

/**
 * Base class for all NodeORM specific errors.
 * @extends Error
 */
export class NodeOrmError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Error thrown when a connection cannot be established or configured.
 * @extends NodeOrmError
 */
export class ConnectionError extends NodeOrmError {}

/**
 * Error thrown when a database driver cannot be found or loaded.
 * @extends NodeOrmError
 */
export class DriverNotFoundError extends NodeOrmError {}

/**
 * Error thrown when a required driver dependency (e.g., 'pg', 'mysql2') is not installed.
 * @extends DriverNotFoundError
 */
export class DriverPackageNotFoundError extends DriverNotFoundError {
     constructor(driverName, packageName) {
         super(`Driver '${driverName}' requires package '${packageName}' which is not installed. Try \`npm install ${packageName}\` or \`yarn add ${packageName}\`.`);
         this.driverName = driverName;
         this.packageName = packageName;
     }
}

/**
 * Error thrown for issues during query execution.
 * @extends NodeOrmError
 */
export class QueryError extends NodeOrmError {
    /**
     * @param {string} message The error message.
     * @param {Error} [originalError] The original error thrown by the driver.
     * @param {string} [sql] The SQL query that caused the error.
     * @param {any[]} [bindings] The bindings used with the query.
     */
    constructor(message, originalError = null, sql = null, bindings = null) {
        let fullMessage = message;
        if (originalError) {
            fullMessage += `\nOriginal Error: ${originalError.message}`;
        }
        if (sql) {
            fullMessage += `\nSQL: ${sql}`;
        }
         if (bindings) {
             try {
                 fullMessage += `\nBindings: ${JSON.stringify(bindings)}`;
             } catch (e) {
                  fullMessage += `\nBindings: [Unable to stringify]`;
             }
         }
        super(fullMessage);
        this.originalError = originalError;
        this.sql = sql;
        this.bindings = bindings;
    }
}

/**
 * Error thrown when a model instance is expected but not found (e.g., findOrFail).
 * @extends NodeOrmError
 */
export class ModelNotFoundError extends NodeOrmError {
    /**
     * @param {string} modelName The name of the model not found.
     * @param {any} [id] The ID or criteria used for searching.
     */
    constructor(modelName, id = null) {
        const message = id
            ? `No ${modelName} found for ID: ${id}`
            : `No ${modelName} found matching the criteria.`;
        super(message);
        this.modelName = modelName;
        this.id = id;
    }
}

/**
 * Error related to model attribute handling (casting, mass assignment).
 * @extends NodeOrmError
 */
export class AttributeError extends NodeOrmError {}

/**
 * Error thrown when mass assignment is blocked by guarded attributes.
 * @extends AttributeError
 */
export class MassAssignmentError extends AttributeError {}

/**
 * Error related to relationship definition or loading.
 * @extends NodeOrmError
 */
export class RelationError extends NodeOrmError {}