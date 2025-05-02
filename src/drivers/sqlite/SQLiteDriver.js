/**
 * @fileoverview SQLite database driver implementation using 'sqlite3'.
 */
import path from "node:path";
import { BaseDriver } from "../BaseDriver.js";
import { SQLiteGrammar } from "./SQLiteGrammar.js";
import { QueryError, ConnectionError } from "../../errors.js";
import { debugLog, debugWarn } from "../../utils/helpers.js";
import { SQLiteSchemaGrammar } from "./SQLiteSchemaGrammar.js";
import { Blueprint } from "../../schema/Blueprint.js";

/**
 * @typedef {import('sqlite3').Database} SQLiteDB
 * @typedef {import('sqlite3').Statement} SQLiteStatement
 */

/**
 * SQLite Driver using the 'sqlite3' package.
 */
export class SQLiteDriver extends BaseDriver {
  /** @type {SQLiteDB} */
  _connection;
  /** @type {string} Database file path. */
  _dbPath;
  /** @type {boolean} Flag to indicate if PRAGMA foreign_keys=ON has been run. */
  _foreignKeysEnabled = false;
  /** @type {boolean} Flag for transaction state */
  _isTransaction = false; // Simple flag, sqlite3 doesn't have separate transaction objects

  /** @inheritdoc */
  _createGrammar() {
    return new SQLiteGrammar();
  }

  /** @inheritdoc */
  async connect() {
    if (this._isConnected) return;

    const sqlite3 = await this._importPackage("sqlite3", "sqlite");
    // Enable verbose mode for debugging driver issues if needed
    // sqlite3.verbose();

    this._dbPath = this._resolveDbPath();

    return new Promise((resolve, reject) => {
      debugLog(`NodeORM: Connecting to SQLite database: ${this._dbPath}`);
      // Determine mode: ReadWrite + Create if not exists is default desired behavior
      const mode = sqlite3.default.OPEN_READWRITE | sqlite3.default.OPEN_CREATE;

      this._connection = new sqlite3.default.Database(
        this._dbPath,
        mode,
        async (err) => {
          if (err) {
            this._isConnected = false;
            return reject(
              new ConnectionError(
                `SQLite connection failed: ${err.message}`,
                err
              )
            );
          }

          try {
            // Enable foreign key constraints (recommended)
            await this._enableForeignKeys();
            // Enable WAL mode for better concurrency (optional but often good)
            await this._enableWAL();

            this._isConnected = true;
            debugLog(
              `NodeORM: SQLite connection established for '${this._dbPath}'.`
            );
            resolve();
          } catch (pragmaError) {
            this._isConnected = false;
            // Close connection if pragmas fail? Maybe just warn.
            await this.disconnect().catch((e) => {}); // Attempt cleanup
            reject(
              new ConnectionError(
                `SQLite PRAGMA setup failed: ${pragmaError.message}`,
                pragmaError
              )
            );
          }
        }
      );
    });
  }

  /** @inheritdoc */
  async disconnect() {
    return new Promise((resolve, reject) => {
      if (this._isConnected && this._connection) {
        this._connection.close((err) => {
          if (err) {
            // Even if close fails, mark as disconnected?
            this._isConnected = false;
            this._connection = null;
            return reject(
              new ConnectionError(
                `Failed to close SQLite connection: ${err.message}`,
                err
              )
            );
          }
          this._isConnected = false;
          this._connection = null;
          this._foreignKeysEnabled = false; // Reset flag
          this._isTransaction = false;
          debugLog(`NodeORM: SQLite connection closed for '${this._dbPath}'.`);
          resolve();
        });
      } else {
        this._isConnected = false; // Ensure state is correct
        this._connection = null;
        this._isTransaction = false;
        resolve(); // Already disconnected or never connected
      }
    });
  }

  /**
   * Resolves the database file path from config.
   * @private
   * @returns {string} Absolute path to the database file.
   */
  _resolveDbPath() {
    const dbPath = this._config.database;
    if (!dbPath || typeof dbPath !== "string") {
      throw new ConnectionError(
        "SQLite configuration must include a 'database' property (file path)."
      );
    }
    // Handle ':memory:' separately
    if (dbPath.toLowerCase() === ":memory:") {
      return ":memory:";
    }
    // Ensure path is absolute
    return path.resolve(dbPath);
  }

  /**
   * Enables foreign key constraints if not already enabled.
   * @private
   */
  async _enableForeignKeys() {
    if (!this._foreignKeysEnabled) {
      await this._runPragma("PRAGMA foreign_keys = ON;");
      this._foreignKeysEnabled = true;
      debugLog("NodeORM: SQLite PRAGMA foreign_keys=ON set.");
    }
  }

  /**
   * Enables Write-Ahead Logging (WAL) mode.
   * @private
   */
  async _enableWAL() {
    try {
      await this._runPragma("PRAGMA journal_mode = WAL;");
      debugLog("NodeORM: SQLite PRAGMA journal_mode=WAL set.");
    } catch (e) {
      // WAL might not be supported on all filesystems (e.g., network drives)
      debugWarn(
        `NodeORM Warning: Could not enable WAL journal mode for SQLite database '${this._dbPath}'. Performance might be affected. Error: ${e.message}`
      );
    }
  }

  /**
   * Helper to run a PRAGMA command.
   * @param {string} sql PRAGMA statement
   * @returns {Promise<any>}
   * @private
   */
  _runPragma(sql) {
    return this._runSqlite(sql, [], "run"); // Use 'run' for pragmas that don't return rows
  }

  /**
   * Internal helper to promisify sqlite3 methods (run, get, all).
   * @param {string} sql
   * @param {any[]} bindings
   * @param {'run' | 'get' | 'all'} method SQLite method name.
   * @returns {Promise<any>}
   * @private
   */
  _runSqlite(sql, bindings, method = "all") {
    return new Promise((resolve, reject) => {
      if (!this._connection) {
        return reject(new ConnectionError("SQLite driver is not connected."));
      }
      const startTime = process.hrtime.bigint();
      debugLog(
        `NodeORM SQLite Query (${method}): ${sql} [${bindings.join(", ")}]`
      );

      // Use a callback function compatible with sqlite3's this context for run/get
      const callback = function (err, result) {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1_000_000; // Milliseconds
        debugLog(`NodeORM SQLite Query Time: ${duration.toFixed(3)}ms`);

        if (err) {
          return reject(
            new QueryError(
              `SQLite query failed: ${err.message}`,
              err,
              sql,
              bindings
            )
          );
        }

        if (method === "run") {
          // 'this' inside callback refers to Statement object for run/get
          resolve({ affectedRows: this.changes, insertId: this.lastID });
        } else {
          // 'result' contains rows for 'all' or the single row for 'get'
          resolve(result);
        }
      };

      // Call the appropriate sqlite3 method
      if (method === "run") {
        this._connection.run(sql, bindings, callback);
      } else if (method === "get") {
        this._connection.get(sql, bindings, callback);
      } else {
        // 'all'
        this._connection.all(sql, bindings, callback);
      }
    });
  }

  /** @inheritdoc */
  async run(sql, bindings) {
    if (!this._isConnected) {
      throw new ConnectionError(
        `SQLite driver is not connected for connection '${
          this._config.name || "default"
        }'. Cannot run query.`
      );
    }

    // Determine method based on SQL command
    const command = sql.trim().split(" ")[0].toUpperCase();
    let method;
    if (["INSERT", "UPDATE", "DELETE", "REPLACE"].includes(command)) {
      method = "run";
    } else if (
      ["SELECT", "PRAGMA"].includes(command) &&
      sql.match(/limit\s+1\b/i)
    ) {
      // Basic check for LIMIT 1, could be more robust
      method = "get"; // Use 'get' if likely a single row result
      // For PRAGMA table_info, 'all' is needed even if table is empty
      if (command === "PRAGMA" && sql.toLowerCase().includes("table_info")) {
        method = "all";
      }
    } else {
      method = "all"; // Default to 'all' for SELECT, other PRAGMAs
    }

    return this._runSqlite(sql, bindings, method);
  }

  /** @inheritdoc */
  async beginTransaction(options = {}) {
    // SQLite transaction modes: DEFERRED (default), IMMEDIATE, EXCLUSIVE
    const mode = options.mode?.toUpperCase() || "DEFERRED"; // Default to DEFERRED
    if (!["DEFERRED", "IMMEDIATE", "EXCLUSIVE"].includes(mode)) {
      throw new QueryError(`Invalid SQLite transaction mode: ${options.mode}`);
    }
    if (this._isTransaction) {
      // SQLite supports savepoints for nested transactions, but we'll keep it simple
      throw new ConnectionError(
        "Cannot start nested transaction with this simple SQLite driver setup. Use SAVEPOINT manually if needed."
      );
    }

    try {
      await this._runSqlite(`BEGIN ${mode} TRANSACTION;`, [], "run");
      this._isTransaction = true;
      debugLog(
        `NodeORM: SQLite ${mode} transaction started on '${this._dbPath}'.`
      );
      return this; // Return self, state indicates transaction
    } catch (error) {
      this._isTransaction = false;
      throw new QueryError(
        `Failed to begin SQLite transaction: ${error.message}`,
        error
      );
    }
  }

  /** @inheritdoc */
  async commit() {
    if (!this._isTransaction) {
      throw new ConnectionError("Cannot commit: Not in a transaction.");
    }
    try {
      await this._runSqlite("COMMIT;", [], "run");
      this._isTransaction = false;
      debugLog(`NodeORM: SQLite transaction committed on '${this._dbPath}'.`);
    } catch (error) {
      // Attempt to rollback?
      await this.rollback().catch((e) =>
        debugWarn("Rollback after failed commit also failed:", e)
      );
      throw new QueryError(
        `Failed to commit SQLite transaction: ${error.message}`,
        error
      );
    }
  }

  /** @inheritdoc */
  async rollback() {
    if (!this._isTransaction) {
      // Don't throw error if rollback is called when not in transaction, just do nothing silently.
      // This aligns with behavior of closing connections after explicit rollback calls in tests.
      // debugWarn("NodeORM Warning: Rollback called but not in an active SQLite transaction.");
      return;
    }
    try {
      await this._runSqlite("ROLLBACK;", [], "run");
      this._isTransaction = false;
      debugLog(`NodeORM: SQLite transaction rolled back on '${this._dbPath}'.`);
    } catch (error) {
      // If rollback fails, the transaction state is uncertain. Mark as not in transaction.
      this._isTransaction = false;
      throw new QueryError(
        `Failed to rollback SQLite transaction: ${error.message}`,
        error
      );
    }
  }

  /** @inheritdoc */
  async getTableSchema(tableName) {
    // PRAGMA table_info(`tableName`)
    const sql = `PRAGMA table_info(${this.getGrammar().wrap(tableName)});`;
    const results = await this.run(sql, []); // Use run which uses 'all' for PRAGMA

    if (!Array.isArray(results) || results.length === 0) {
      throw new QueryError(`Table '${tableName}' not found or has no columns.`);
    }

    const columns = {};
    results.forEach((row) => {
      // Normalize types slightly (e.g., 'varchar(255)' -> 'varchar') for basic type name
      const dataTypeMatch = row.type.match(/^(\w+)/);
      const dataType = dataTypeMatch
        ? dataTypeMatch[1].toLowerCase()
        : row.type.toLowerCase();

      columns[row.name] = {
        name: row.name,
        type: row.type, // Full type definition (e.g., 'VARCHAR(255)')
        dataType: dataType, // Simplified type (e.g., 'varchar')
        nullable: row.notnull === 0, // 0 means nullable, 1 means not nullable
        default: row.dflt_value, // Default value as string representation
        isPrimaryKey: row.pk > 0, // Primary key flag (1 or higher if composite)
        // SQLite auto-increment is implicit on INTEGER PRIMARY KEY columns
        isAutoIncrementing: row.pk === 1 && dataType === "integer",
      };
    });

    return { tableName, columns };
  }

  _createSchemaGrammar(queryGrammar) {
    return new SQLiteSchemaGrammar(queryGrammar);
  }

  async getTableSchema(tableName) {
    const sql = `PRAGMA table_info(${this.getGrammar().wrap(tableName)});`;
    const results = await this.run(sql, []); // Uses 'all' internally
    if (!Array.isArray(results) || results.length === 0)
      throw new QueryError(`Table '${tableName}' not found.`);

    const columns = {};
    results.forEach((row) => {
      const dataTypeMatch = row.type.match(/^(\w+)/);
      const dataType = dataTypeMatch
        ? dataTypeMatch[1].toLowerCase()
        : row.type.toLowerCase();
      columns[row.name] = {
        name: row.name,
        type: row.type,
        dataType: dataType,
        nullable: row.notnull === 0,
        default: row.dflt_value,
        isPrimaryKey: row.pk > 0,
        isAutoIncrementing: row.pk === 1 && dataType === "integer",
      };
    });
    return { tableName, columns };
  }

  /** @inheritdoc */
  async describeTable(tableName) {
    const schemaInfo = await this.getTableSchema(tableName);
    const blueprint = new Blueprint();

    for (const colName in schemaInfo.columns) {
      const col = schemaInfo.columns[colName];
      let command = null;
      let args = [colName];
      let modifiers = {};

      const type = col.type.toLowerCase();
      const dataType = col.dataType; // Already lowercased in getTableSchema

      // --- Type Mapping (Simplified) ---
      if (col.isPrimaryKey && col.isAutoIncrementing)
        command = "increments"; // SQLite uses INTEGER PK AI for all sizes
      else if (dataType === "integer") {
        if (col.isPrimaryKey) command = "integer"; // Non-AI integer PK
        else command = "integer";
      } else if (dataType === "text") {
        // Could be string, text, uuid, ulid, date, datetime, json etc.
        if (type.startsWith("varchar")) {
          command = "string";
          args.push(parseInt(type.match(/\((\d+)\)/)?.[1] || "255", 10));
        } else if (type.startsWith("char(36)")) command = "uuid";
        else if (type.startsWith("char(26)")) command = "ulid";
        else if (type === "date") command = "date";
        else if (type === "datetime")
          command = "timestamp"; // Map SQLite DATETIME to timestamp
        else command = "text"; // Default TEXT affinity types
      } else if (dataType === "blob") command = "binary";
      else if (dataType === "real")
        command = "float"; // Includes REAL, FLOAT, DOUBLE
      else if (dataType === "numeric") command = "decimal"; // Or potentially others

      // --- Modifiers ---
      if (col.nullable) modifiers.nullable = true;
      if (col.default !== null && col.default !== undefined)
        modifiers.default = col.default;
      if (col.isPrimaryKey && !col.isAutoIncrementing) modifiers.primary = true;
      // Unique needs separate PRAGMA index_info query

      if (command) {
        blueprint._addCommand("column", args[0], {
          columnType: command,
          ...Object.fromEntries(args.slice(1).map((a, i) => [`arg${i}`, a])),
        });
        blueprint._addModifier("modifiers", modifiers);
      } else {
        console.warn(
          `NodeORM Schema Describe (SQLite): Could not map type '${col.type}' for column '${colName}'.`
        );
        blueprint._addCommand("column", colName, {
          columnType: "raw",
          rawDefinition: col.type,
        });
        blueprint._addModifier("modifiers", modifiers);
      }
    }

    // TODO: Fetch and add INDEX, UNIQUE, FOREIGN constraints separately using PRAGMA index_list, index_info, foreign_key_list

    return blueprint;
  }
}
