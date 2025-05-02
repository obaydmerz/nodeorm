/**
 * @fileoverview MySQL/MariaDB database driver implementation.
 */
import { BaseDriver } from "../BaseDriver.js";
import { MySQLGrammar } from "./MySQLGrammar.js";
import { QueryError, ConnectionError } from "../../errors.js";
import { debugLog, debugWarn } from "../../utils/helpers.js";
import { MySQLSchemaGrammar } from "./MySQLSchemaGrammar.js";
import { Blueprint } from "../../schema/Blueprint.js";

/**
 * @typedef {import('mysql2/promise').Pool | import('mysql2/promise').Connection} MySQLConnection
 * @typedef {import('mysql2/promise').PoolOptions} MySQLPoolOptions
 * @typedef {import('mysql2/promise').ResultSetHeader} MySQLResultSetHeader
 * @typedef {import('mysql2/promise').RowDataPacket} MySQLRowDataPacket
 */

/**
 * MySQL/MariaDB Driver.
 * Attempts to use 'mysql2/promise'.
 */
export class MySQLDriver extends BaseDriver {
  /** @type {MySQLConnection} */
  _connection; // Can be Pool or single Connection
  /** @type {MySQLPoolOptions} */
  _poolConfig;
  /** @type {boolean} */
  _isTransaction = false; // Track if this instance is a transaction connection

  /** @inheritdoc */
  _createGrammar() {
    return new MySQLGrammar();
  }

  /** @inheritdoc */
  _createSchemaGrammar(queryGrammar) {
    return new MySQLSchemaGrammar(queryGrammar);
  }

  /** @inheritdoc */
  async connect() {
    if (this._isConnected) return;

    const mysql2 = await this._importPackage("mysql2/promise", "mysql");
    this._resolvePoolConfig();

    try {
      debugLog(`NodeORM: Connecting to MySQL with config:`, {
        ...this._poolConfig,
        password: "***",
      });
      // Use createPool for connection pooling
      this._connection = mysql2.createPool(this._poolConfig);

      // Test connection
      const testConn = await this._connection.getConnection();
      await testConn.ping();
      testConn.release();

      this._isConnected = true;
      debugLog(
        `NodeORM: MySQL connection pool established for '${
          this._config.name || "default"
        }'.`
      );
    } catch (error) {
      this._isConnected = false;
      throw new ConnectionError(
        `MySQL connection failed: ${error.message}`,
        error
      );
    }
  }

  /** @inheritdoc */
  async disconnect() {
    if (this._isConnected && this._connection) {
      try {
        // If it's a pool, end it. If single connection (transaction), it should be handled by commit/rollback.
        if (
          typeof this._connection.end === "function" &&
          !this._isTransaction
        ) {
          await this._connection.end();
          debugLog(
            `NodeORM: MySQL connection pool closed for '${
              this._config.name || "default"
            }'.`
          );
        }
        this._isConnected = false;
        this._connection = null;
      } catch (error) {
        throw new ConnectionError(
          `Failed to close MySQL connection: ${error.message}`,
          error
        );
      }
    }
  }

  /**
   * Resolves pool configuration from the main config object.
   * @private
   */
  _resolvePoolConfig() {
    this._poolConfig = {
      host: this._config.host || "localhost",
      port: this._config.port || 3306,
      user: this._config.user || this._config.username,
      password: this._config.password,
      database: this._config.database,
      waitForConnections: this._config.waitForConnections ?? true,
      connectionLimit: this._config.connectionLimit ?? 10,
      queueLimit: this._config.queueLimit ?? 0,
      charset: this._config.charset || "utf8mb4",
      timezone: this._config.timezone || "+00:00", // MySQL timezone setting
      socketPath: this._config.socketPath,
      ssl: this._config.ssl, // Pass SSL options if provided
      multipleStatements: true, // Allow multiple statements for TRUNCATE etc.
      // Allow overriding/adding other mysql2 options
      ...this._config.options, // e.g., { options: { decimalNumbers: true } }
    };
  }

  /**
   * Gets a connection, either from the pool or the transaction connection.
   * @returns {Promise<import('mysql2/promise').PoolConnection | import('mysql2/promise').Connection>}
   * @private
   */
  async _getDbConnection() {
    if (!this._connection) {
      // Check if we are mid-transaction setup, maybe connection exists but isn't marked connected yet
      if (this._isTransaction) {
        // This state shouldn't really happen if beginTransaction handles errors correctly
        throw new ConnectionError(
          "MySQL transaction connection lost or not properly initialized."
        );
      }
      throw new ConnectionError("MySQL driver is not connected.");
    }
    // If this instance represents a transaction, return the transaction connection directly
    if (this._isTransaction) {
      // @ts-ignore Assume transaction connection has query method
      return this._connection;
    }
    // Otherwise, get a connection from the pool
    // @ts-ignore Assume pool has getConnection method
    return this._connection.getConnection();
  }

  /**
   * Releases a connection if it came from the pool.
   * @param {import('mysql2/promise').PoolConnection | import('mysql2/promise').Connection} dbConn
   * @private
   */
  _releaseDbConnection(dbConn) {
    // Only release if it's a PoolConnection (came from the pool) and not a transaction connection
    if (
      dbConn &&
      typeof dbConn.release === "function" &&
      !this._isTransaction
    ) {
      dbConn.release();
    }
  }

  /** @inheritdoc */
  async run(sql, bindings) {
    if (!this._isConnected && !this._isTransaction) {
      // Allow run during transaction lifecycle
      throw new ConnectionError(
        `MySQL driver is not connected for connection '${
          this._config.name || "default"
        }'. Cannot run query.`
      );
    }

    const dbConn = await this._getDbConnection();
    try {
      debugLog(`NodeORM MySQL Query: ${sql} [${bindings.join(", ")}]`);
      const startTime = process.hrtime.bigint();

      // Execute potentially multiple statements (for truncate)
      const [results, fields] = await dbConn.query(sql, bindings);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000; // Milliseconds
      debugLog(`NodeORM MySQL Query Time: ${duration.toFixed(3)}ms`);

      // Process results: If multipleStatements=true, results might be an array of result arrays/objects.
      // Handle this for TRUNCATE which returns multiple OkPackets/ResultSetHeaders.
      if (
        Array.isArray(results) &&
        results.length > 0 &&
        results.some((r) => r && "affectedRows" in r)
      ) {
        // Multi-statement result likely ending in modification (INSERT/UPDATE/DELETE/TRUNCATE)
        // Find the last relevant result (usually ResultSetHeader or OkPacket)
        const lastModificationResult = [...results]
          .reverse()
          .find((r) => r && ("affectedRows" in r || "insertId" in r));
        if (lastModificationResult) {
          return {
            affectedRows: lastModificationResult.affectedRows ?? 0,
            insertId:
              lastModificationResult.insertId !== 0
                ? lastModificationResult.insertId
                : null,
          };
        }
        // Fallback if only other results (like SELECTs) were returned in multi-statement
        return []; // Or maybe return the full array? Let's return empty array for modification context.
      } else if (
        Array.isArray(results) &&
        (results.length === 0 ||
          Array.isArray(results[0]) ||
          (results[0] &&
            !("affectedRows" in results[0]) &&
            !("insertId" in results[0])))
      ) {
        // Standard SELECT result (array of rows) or empty select, or first element is not a modification result
        return results;
      } else if (
        typeof results === "object" &&
        results !== null &&
        ("affectedRows" in results || "insertId" in results)
      ) {
        // Single INSERT/UPDATE/DELETE result
        const header = /** @type {MySQLResultSetHeader} */ (results);
        return {
          affectedRows: header.affectedRows,
          insertId: header.insertId !== 0 ? header.insertId : null,
        };
      } else {
        // Should not happen with standard queries, maybe CALL procedure? Or unexpected format.
        debugWarn(
          "NodeORM MySQL Warning: Unexpected query result format:",
          results
        );
        return results ?? []; // Return raw result or empty array
      }
    } catch (error) {
      throw new QueryError(
        `MySQL query failed: ${error.message}`,
        error,
        sql,
        bindings
      );
    } finally {
      this._releaseDbConnection(dbConn);
    }
  }

  /** @inheritdoc */
  async beginTransaction(options = {}) {
    if (this._isTransaction) {
      throw new ConnectionError(
        "Cannot start a nested transaction with this driver setup."
      );
    }
    if (
      !this._isConnected ||
      typeof this._connection?.getConnection !== "function"
    ) {
      throw new ConnectionError(
        "Cannot start transaction: Connection pool not available."
      );
    }

    const trxConnection = await this._connection.getConnection(); // Get a dedicated connection from the pool
    try {
      // MySQL specific isolation level setting if provided
      if (options.isolationLevel) {
        await trxConnection.query(
          `SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`
        );
      }
      await trxConnection.beginTransaction();
      debugLog(
        `NodeORM: MySQL transaction started on connection '${
          this._config.name || "default"
        }'.`
      );

      // Create a new driver instance wrapper for this transaction connection
      // Pass the *transaction* connection, not the pool config
      const trxDriver = new MySQLDriver(this._config); // Use original config for metadata
      trxDriver._connection = trxConnection; // Assign the actual transaction connection
      trxDriver._isConnected = true; // Mark as connected for the scope of the transaction
      trxDriver._isTransaction = true; // Mark this driver instance as transactional
      return trxDriver; // Return the transactional driver
    } catch (error) {
      trxConnection.release(); // Release connection if begin fails
      throw new QueryError(
        `Failed to begin MySQL transaction: ${error.message}`,
        error
      );
    }
  }

  /** @inheritdoc */
  async commit() {
    if (!this._isTransaction || !this._connection) {
      throw new ConnectionError(
        "Cannot commit: Not in a transaction or connection missing."
      );
    }
    // @ts-ignore Assume transaction connection
    const dbConn = this._connection;
    try {
      await dbConn.commit();
      debugLog(
        `NodeORM: MySQL transaction committed on '${
          this._config.name || "default"
        }'.`
      );
    } catch (error) {
      throw new QueryError(
        `Failed to commit MySQL transaction: ${error.message}`,
        error
      );
    } finally {
      // Release the connection back to the pool after commit
      if (typeof dbConn.release === "function") {
        dbConn.release();
      }
      this._isConnected = false; // Mark this transaction driver instance as disconnected
      this._isTransaction = false;
      this._connection = null; // Clear connection reference
    }
  }

  /** @inheritdoc */
  async rollback() {
    if (!this._isTransaction || !this._connection) {
      // Allow rollback attempt even if connection might be lost, but log warning if not marked as transaction
      if (!this._isTransaction) {
        debugWarn(
          "NodeORM Warning: Rollback called on non-transactional MySQL driver instance."
        );
        return; // Do nothing if definitely not a transaction instance
      }
      // If connection is missing, can't really rollback, log error
      if (!this._connection) {
        throw new ConnectionError(
          "Cannot rollback: Transaction connection is missing."
        );
      }
    }
    // @ts-ignore Assume transaction connection
    const dbConn = this._connection;
    try {
      await dbConn.rollback();
      debugLog(
        `NodeORM: MySQL transaction rolled back on '${
          this._config.name || "default"
        }'.`
      );
    } catch (error) {
      // Still release connection below, but rethrow error
      throw new QueryError(
        `Failed to rollback MySQL transaction: ${error.message}`,
        error
      );
    } finally {
      // Always try to release the connection back to the pool after rollback attempt
      if (dbConn && typeof dbConn.release === "function") {
        dbConn.release();
      }
      this._isConnected = false; // Mark this transaction driver instance as disconnected
      this._isTransaction = false;
      this._connection = null; // Clear connection reference
    }
  }

  /** @inheritdoc */
  async getTableSchema(tableName) {
    const sql = `
             SELECT
                 COLUMN_NAME AS name,
                 COLUMN_TYPE AS type,
                 DATA_TYPE as dataType,
                 IS_NULLABLE AS nullable,
                 COLUMN_DEFAULT AS \`default\`,
                 COLUMN_KEY AS \`key\`,
                 EXTRA AS extra
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
             ORDER BY ORDINAL_POSITION;
         `;
    const dbName = this._config.database;
    if (!dbName) {
      throw new ConnectionError(
        "Cannot fetch schema without database name configured."
      );
    }

    const results = await this.run(sql, [dbName, tableName]);

    if (!Array.isArray(results) || results.length === 0) {
      throw new QueryError(
        `Table '${tableName}' not found in database '${dbName}' or no columns defined.`
      );
    }

    const columns = {};
    results.forEach((row) => {
      columns[row.name] = {
        name: row.name,
        type: row.type, // e.g., 'varchar(255)', 'int(11)'
        dataType: row.dataType, // e.g., 'varchar', 'int'
        nullable: row.nullable === "YES",
        default: row.default,
        isPrimaryKey: row.key === "PRI",
        isAutoIncrementing: row.extra.toLowerCase().includes("auto_increment"),
      };
    });

    return { tableName, columns };
  }

  /** @inheritdoc */
  async describeTable(tableName) {
    const schemaInfo = await this.getTableSchema(tableName);
    const blueprint = new Blueprint();

    // Map information_schema columns back to Blueprint methods
    for (const colName in schemaInfo.columns) {
      const col = schemaInfo.columns[colName];
      let command = null;
      let args = [colName];
      let modifiers = {};

      // Map data types (this is complex and needs refinement)
      const dataType = col.dataType.toLowerCase();
      const columnType = col.type.toLowerCase(); // Full type e.g., int(11) unsigned

      // --- Basic Type Mapping (Example - Needs Expansion) ---
      /* if (col.isPrimaryKey && col.isAutoIncrementing) {
        if (dataType === "bigint") command = "bigIncrements";
        else if (dataType === "mediumint") command = "mediumIncrements";
        else if (dataType === "smallint") command = "smallIncrements";
        else if (dataType === "tinyint") command = "tinyIncrements";
        else command = "increments"; // Default integer increments
        args = [colName]; // Name only for increments
      } else  */
       
      if (dataType === "bigint") command = "bigInteger";
      else if (dataType === "int") command = "integer";
      else if (dataType === "mediumint") command = "mediumInteger";
      else if (dataType === "smallint") command = "smallInteger";
      else if (dataType === "tinyint") {
        // Could be boolean or tinyint
        if (col.type === "tinyint(1)") command = "boolean";
        else command = "tinyInteger";
      } else if (dataType === "varchar") {
        command = "string";
        args.push(parseInt(columnType.match(/\((\d+)\)/)?.[1] || "255", 10));
      } else if (dataType === "char") {
        if (col.type.length === 36) command = "uuid"; // Guess UUID
        else if (col.type.length === 26) command = "ulid"; // Guess ULID
        else {
          command = "char";
          args.push(parseInt(columnType.match(/\((\d+)\)/)?.[1] || "255", 10));
        }
      } else if (dataType === "text") command = "text";
      else if (dataType === "mediumtext") command = "mediumText";
      else if (dataType === "longtext") command = "longText";
      else if (dataType === "date") command = "date";
      else if (dataType === "datetime") {
        command = "dateTime";
        args.push(parseInt(columnType.match(/\((\d+)\)/)?.[1] || "0", 10));
      } else if (dataType === "timestamp") {
        command = "timestampTz";
        args.push(parseInt(columnType.match(/\((\d+)\)/)?.[1] || "0", 10));
      } // MySQL TIMESTAMP has TZ behavior
      else if (dataType === "time") {
        command = "time";
        args.push(parseInt(columnType.match(/\((\d+)\)/)?.[1] || "0", 10));
      } else if (dataType === "float") {
        command = "float"; /* Add precision/scale parsing */
      } else if (dataType === "double") {
        command = "double"; /* Add precision/scale parsing */
      } else if (dataType === "decimal") {
        command = "decimal";
        const match = columnType.match(/\((\d+),(\d+)\)/);
        if (match) {
          args.push(parseInt(match[1]), parseInt(match[2]));
        }
      } else if (dataType === "json") command = "json";
      else if (dataType === "enum") {
        command = "enum";
        const match = columnType.match(/enum\((.*)\)/);
        if (match)
          args.push(
            match[1].split(",").map((v) => v.replace(/^'(.*)'$/, "$1"))
          );
      } // Parse enum values
      else if (dataType === "set") {
        command = "set";
        const match = columnType.match(/set\((.*)\)/);
        if (match)
          args.push(
            match[1].split(",").map((v) => v.replace(/^'(.*)'$/, "$1"))
          );
      } // Parse set values
      // Add BLOB, GEOMETRY types etc.

      // --- Modifiers ---
      if (col.nullable) modifiers.nullable = true;
      if (col.default !== null && col.default !== undefined)
        modifiers.default = col.default; // Handle default NULL/keyword later
      if (columnType.includes("unsigned")) modifiers.unsigned = true;
      // if (col.comment) modifiers.comment = col.comment; // Need to fetch comments separately usually
      if(col.isAutoIncrementing) modifiers.autoIncrement = true;
      if (col.key === "PRI" || col.isPrimaryKey)
        modifiers.primary = true; // Primary but not auto-increment
      if (col.key === "UNI") modifiers.unique = true;
      // Index modifier handled separately

      if (command) {
        blueprint._addCommand("column", args[0], {
          columnType: command,
          ...Object.fromEntries(args.slice(1).map((a, i) => [`arg${i}`, a])),
          modifiers
        }); // Add command
      } else {
        console.warn(
          `NodeORM Schema Describe: Could not map MySQL type '${col.type}' for column '${colName}'.`
        );
        // Add as a raw type?
        blueprint._addCommand("column", colName, {
          columnType: "raw",
          rawDefinition: col.type,
        });
        blueprint._addModifier("modifiers", modifiers);
      }
    }

    // TODO: Fetch and add indices (INDEX, UNIQUE, PRIMARY, FOREIGN) separately
    // This requires additional queries to information_schema.key_column_usage and information_schema.statistics

    return blueprint;
  }
}
