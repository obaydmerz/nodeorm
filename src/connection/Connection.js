/**
 * @fileoverview Represents a database connection and handles query execution.
 */
import path from "node:path";
import { URL } from "node:url";
import {
  ConnectionError,
  DriverNotFoundError,
  QueryError,
} from "../errors.js";
import { QueryBuilder } from "../query/QueryBuilder.js";
import { Expression, raw } from "../query/Expression.js";
import { ConnectionManager } from "./ConnectionManager.js"; // Import the singleton Manager
import { debugLog, debugWarn, getClassName } from "../utils/helpers.js";

// Driver loading
import { PostgresDriver } from "../drivers/postgres/PostgresDriver.js";
import { MySQLDriver } from "../drivers/mysql/MySQLDriver.js";
import { SQLiteDriver } from "../drivers/sqlite/SQLiteDriver.js";

import { SchemaBuilder } from "../schema/SchemaBuilder.js"; // Import SchemaBuilder
import { Manager } from "../singleton.js";

/**
 * Represents a single database connection configuration and provides methods
 * for interacting with the database.
 */
export class Connection {
  /** @type {import('../drivers/BaseDriver.js').BaseDriver} */
  #driver;
  /** @type {object | string} */
  #config;
  /** @type {string} */
  #name;
  /** @type {Map<string, typeof import('../model/Model.js').Model>} */
  #models = new Map();
  /** @type {boolean} Indicates if this connection instance represents a transaction */
  #isTransaction = false;
  /** @type {Map<string, any>} Cached table schemas */
  #schemaCache = new Map();

  /**
   * Private constructor. Use Connection.make() to create instances.
   * @param {string | object | import('../drivers/BaseDriver.js').BaseDriver} config Connection configuration or driver instance.
   * @param {string} [name='default'] The name for this connection.
   * @param {boolean} [addToManager=true] Add this connection to the global Manager.
   */
  constructor(config, name = "default", addToManager = true) {
    this.#name = name;
    this.#config = config; // Store original config

    // Driver is set asynchronously by _resolveDriver
  }

  /**
   * Factory method to create and initialize a connection.
   * This handles parsing configuration, selecting, and loading the appropriate driver.
   * @param {string | object | import('../drivers/BaseDriver.js').BaseDriver} config
   *   - Driver Instance: A pre-configured driver instance (e.g., new PostgresDriver(...)).
   *   - Connection String: A URL string (e.g., 'postgresql://...', 'mysql://...', 'sqlite:/path/to/db.sqlite').
   *   - Config Object: An object like { driver: 'mysql', host: '...', ... } or { driver: 'sqlite', database: 'path' }.
   *   - Environment Variables: If config is undefined or process.env, attempts to read from process.env
   *     (DATABASE_URL, DB_CONNECTION, DB_HOST, etc.).
   * @param {string} [name='default'] The name for this connection.
   * @param {ConnectionManager} [addToManager=true] Whether to add this connection to the global ConnectionManager, or a specefic Manager.
   * @returns {Promise<Connection>} A promise resolving to the initialized Connection instance.
   */
  static async make(config, name = "default", addToManager = true) {
    const connection = new Connection(config, name, false); // Don't add to Manager until initialized
    await connection._resolveDriver(config);

    if (addToManager == true) {
      addToManager = Manager;
    }

    if (addToManager instanceof ConnectionManager) {
      // Use name from connection instance in case it was resolved from env
      addToManager.addConnection(
        connection.getName(),
        connection,
        name === Manager.getDefaultConnectionName()
      );
    }
    return connection;
  }

  /**
   * Internal method to resolve and instantiate the database driver based on config.
   * @param {string | object | import('../drivers/BaseDriver.js').BaseDriver | undefined} config
   * @private
   */
  async _resolveDriver(config) {
    if (
      config &&
      typeof config === "object" &&
      typeof config.connect === "function"
    ) {
      // Already a driver instance
      this.#driver = config;
      // Try to infer name/config if possible from driver, might need enhancement in driver classes
      this.#config = this.#config || {
        driver: getClassName(config).replace("Driver", "").toLowerCase(),
      }; // Best guess
      return;
    }

    let resolvedConfig = this._parseConfig(config);

    if (!resolvedConfig || !resolvedConfig.driver) {
      throw new ConnectionError(
        `Could not determine database driver from the provided configuration or environment variables for connection '${
          this.#name
        }'.`
      );
    }

    // Set final resolved config and potentially updated name
    this.#config = resolvedConfig;
    this.#name = resolvedConfig.name || this.#name; // Allow config to override name

    const driverName = resolvedConfig.driver.toLowerCase();

    try {
      switch (driverName) {
        case "postgres":
        case "postgresql":
        case "pg":
        case "neon": // Treat neon as postgres
          this.#driver = new PostgresDriver(resolvedConfig);
          break;
        case "mysql":
        case "mysql2":
          this.#driver = new MySQLDriver(resolvedConfig);
          break;
        case "sqlite":
        case "sqlite3":
          this.#driver = new SQLiteDriver(resolvedConfig);
          break;
        case "custom": // Placeholder for user-defined drivers if config specifies { driver: 'custom', instance: new MyDriver() }
          if (
            resolvedConfig.instance &&
            typeof resolvedConfig.instance.connect === "function"
          ) {
            this.#driver = resolvedConfig.instance;
            break;
          }
          throw new DriverNotFoundError(
            `Driver type 'custom' requires an 'instance' property in the config containing a valid driver.`
          );
        default:
          throw new DriverNotFoundError(
            `Unsupported database driver: ${resolvedConfig.driver}`
          );
      }

      // Establish the actual connection
      await this.#driver.connect();
      debugLog(
        `NodeORM: Connection '${
          this.#name
        }' (${driverName}) established successfully.`
      );
    } catch (error) {
      throw new ConnectionError(
        `Failed to establish connection '${this.#name}': ${error.message}`,
        error
      );
    }
  }

  /**
   * Parses various configuration formats into a standardized object.
   * Reads environment variables if necessary.
   * @param {string | object | undefined} config Initial configuration.
   * @returns {object | null} The parsed configuration object or null.
   * @private
   */
  _parseConfig(config) {
    if (config === process.env || config === undefined || config === null) {
      config = this._parseEnvConfig();

      if(!config) {
        debugWarn("NodeORM Error: Necessary env variables aren't present, did you run dotenv?");
      }

      return config;
    }

    if (typeof config === "string") {
      return this._parseConnectionString(config);
    }

    if (typeof config === "object" && config !== null) {
      // Basic validation if it's an object
      if (!config.driver && !this._isLikelyFilePath(config.database)) {
        // If it's an object but lacks a 'driver', maybe it's a raw driver config obj?
        // Try to infer driver based on keys (less reliable)
        if (
          "user" in config &&
          "password" in config &&
          ("host" in config || "socketPath" in config)
        ) {
          // Likely MySQL or Postgres
          debugWarn(
            `NodeORM Warning: Config object for connection '${
              this.#name
            }' lacks 'driver'. Assuming 'mysql' or 'postgres' based on keys. Please specify 'driver'.`
          );

          // Default to mysql if not specified, user should fix this
          config.driver = config.driver || "mysql";
        } else {
          throw new ConnectionError(
            `Connection configuration object for '${
              this.#name
            }' must include a 'driver' property.`
          );
        }
      } else if (this._isLikelyFilePath(config.database) && !config.driver) {
        config.driver = "sqlite"; // Infer SQLite from path
      }
      return { ...config, name: this.#name }; // Ensure name is included
    }

    return null; // Invalid config type
  }

  /**
   * Parses environment variables to create a configuration object.
   * Mimics Laravel's environment variable precedence.
   * @returns {object | null} Configuration object or null if not found.
   * @private
   */
  _parseEnvConfig() {
    const env = process.env;

    // 1. DATABASE_URL / DB_URL (Highest precedence)
    const dbUrl = env.DATABASE_URL || env.DB_URL;
    if (dbUrl) {
      try {
        const parsed = this._parseConnectionString(dbUrl);
        if (parsed) return { ...parsed, name: this.#name }; // Use connection's name
      } catch (e) {
        debugWarn(
          `NodeORM Warning: Failed to parse DATABASE_URL/DB_URL environment variable: ${e.message}`
        );
      }
    }

    // 2. DB_CONNECTION and related variables
    const driver = env.DB_CONNECTION?.toLowerCase();
    if (!driver) return null; // Cannot proceed without driver

    const config = { driver: driver, name: this.#name }; // Start with driver and name

    if (driver === "sqlite") {
      config.database = env.DB_DATABASE; // Path for SQLite
      if (!config.database) {
        throw new ConnectionError(
          `SQLite connection requires DB_DATABASE (file path) environment variable.`
        );
      }
    } else {
      // Common for MySQL/Postgres
      config.host = env.DB_HOST || "127.0.0.1";
      config.port = env.DB_PORT
        ? parseInt(env.DB_PORT, 10)
        : driver === "postgres"
        ? 5432
        : 3306;
      config.database = env.DB_DATABASE;
      config.user = env.DB_USERNAME || env.DB_USER; // Allow both variants
      config.password = env.DB_PASSWORD;
      config.charset = env.DB_CHARSET;
      config.timezone = env.DB_TIMEZONE;
      // Driver-specific options from env? (e.g., DB_SSLMODE for Postgres)
      if (driver === "postgres" || driver === "postgresql") {
        if (env.DB_SSLMODE)
          config.ssl = { rejectUnauthorized: false, mode: env.DB_SSLMODE }; // Basic mapping
        if (env.DB_SCHEMA) config.schema = env.DB_SCHEMA;
      }
      if (env.DB_SOCKET_PATH) config.socketPath = env.DB_SOCKET_PATH;

      // Basic validation
      if (!config.database || !config.user) {
        throw new ConnectionError(
          `Database connection '${driver}' requires DB_DATABASE and DB_USERNAME (or DB_USER) environment variables.`
        );
      }
    }

    return config;
  }

  /**
   * Parses a database connection string (URL).
   * @param {string} connectionString The URL string.
   * @returns {object | null} Configuration object or null.
   * @private
   */
  _parseConnectionString(connectionString) {
    try {
      // Handle simple file paths for SQLite directly
      if (this._isLikelyFilePath(connectionString)) {
        return {
          driver: "sqlite",
          database: path.resolve(connectionString),
          name: this.#name,
        };
      }

      const url = new URL(connectionString);
      const driver = url.protocol.replace(":", "").toLowerCase();
      const config = { driver, name: this.#name };

      if (driver === "sqlite") {
        // Handle sqlite://path/to/db or sqlite:path/to/db
        // pathname might include leading slash depending on OS/URL format
        let dbPath = url.pathname;
        // Correct for potential windows path issues like sqlite:///C:/path...
        if (
          url.hostname &&
          url.protocol === "sqlite:" &&
          /^[a-zA-Z]:$/.test(url.hostname)
        ) {
          dbPath = `${url.hostname}${dbPath}`;
        } else if (dbPath.startsWith("/") && process.platform === "win32") {
          // Remove leading slash if it looks like a windows path was //C:/...
          if (/^\/[a-zA-Z]:\//.test(dbPath)) {
            dbPath = dbPath.substring(1);
          }
        }
        config.database = path.resolve(dbPath);
      } else {
        config.host = url.hostname;
        if (url.port) config.port = parseInt(url.port, 10);
        config.database = url.pathname ? url.pathname.slice(1) : undefined; // Remove leading '/'
        config.user = url.username
          ? decodeURIComponent(url.username)
          : undefined;
        config.password = url.password
          ? decodeURIComponent(url.password)
          : undefined;

        // Extract query parameters for additional options
        url.searchParams.forEach((value, key) => {
          // Map common query params to config options
          const lowerKey = key.toLowerCase();
          if (lowerKey === "sslmode") {
            config.ssl = { rejectUnauthorized: false, mode: value }; // Basic mapping
          } else if (lowerKey === "charset") {
            config.charset = value;
          } else if (lowerKey === "timezone") {
            config.timezone = value;
          } else if (
            lowerKey === "schema" &&
            (driver === "postgres" || driver === "postgresql")
          ) {
            config.schema = value; // Postgres schema
          } else if (lowerKey === "socketpath") {
            config.socketPath = value; // MySQL socket path
          } else {
            // Add other parameters directly, might be driver-specific
            config[key] = value;
          }
        });
      }

      // Basic validation
      if (!config.driver || (driver !== "sqlite" && !config.database)) {
        throw new Error(
          "Invalid connection string format or missing database name."
        );
      }
      if (driver !== "sqlite" && !config.host) {
        throw new Error("Missing host in connection string.");
      }

      return config;
    } catch (e) {
      // Check if it's a file path that failed URL parsing
      if (this._isLikelyFilePath(connectionString)) {
        return {
          driver: "sqlite",
          database: path.resolve(connectionString),
          name: this.#name,
        };
      }
      throw new ConnectionError(
        `Failed to parse connection string: ${e.message}. String: "${connectionString}"`,
        e
      );
    }
  }

  /**
   * Simple check if a string looks like a file path.
   * @param {string} str
   * @returns {boolean}
   * @private
   */
  _isLikelyFilePath(str) {
    if (typeof str !== "string") return false;
    // Basic checks: contains slashes, doesn't look like a URL protocol, maybe ends with common db extensions.
    return (
      (str.includes("/") || str.includes("\\")) &&
      !str.includes("://") &&
      (str.endsWith(".db") ||
        str.endsWith(".sqlite") ||
        str.endsWith(".sqlite3") ||
        str.includes(path.sep))
    ); // Includes path separator check
  }

  /**
   * Registers Model classes with this connection.
   * This allows models to use this connection implicitly and fetches schema info.
   * @param {...typeof import('../model/Model.js').Model} models The model classes to initialize.
   * @returns {Promise<void>}
   */
  async init(...models) {
    for (const model of models) {
      if (!model || typeof model.getTableName !== "function") {
        console.warn(
          `NodeORM Warning: Invalid item passed to connection.init(). Expected Model class.`
        );
        continue;
      }
      const modelName = model.name;
      this.#models.set(modelName, model);
      model.connectionManager = Manager; // Ensure model has access to Manager
      model.connection = this.#name; // Associate model with this connection name

      await model.ensureReady(); // Ensure model is ready

      // Model booting (which includes describing) is now handled by Model.ensureReady()
      // We don't necessarily need to fetch schema here anymore, unless we want to pre-warm cache.
      // Let's remove the schema fetching from here to rely on Model's boot process.
      // const tableName = model.getTableName();
      // try {
      //     if (!this.#schemaCache.has(tableName)) { ... fetch and cache ... }
      //     if (typeof model.initializeSchema === 'function') { model.initializeSchema(this.#schemaCache.get(tableName)); }
      // } catch (error) { ... warning ... }
    }
  }

  /**
   * Retrieves the schema information for a given table name from the cache.
   * @param {string} tableName The name of the table.
   * @returns {object | null} The cached schema object or null if not found.
   */
  getCachedSchema(tableName) {
    return this.#schemaCache.get(tableName) || null;
  }

  /**
   * Gets a registered Model class by its name.
   * @param {string} name The name of the Model class.
   * @returns {typeof import('../model/Model.js').Model | undefined} The Model class or undefined.
   */
  getModel(name) {
    return this.#models.get(name);
  }

  /**
   * Gets the underlying driver instance.
   * Use with caution, direct driver interaction bypasses ORM features.
   * @returns {import('../drivers/BaseDriver.js').BaseDriver}
   */
  getDriver() {
    if (!this.#driver) {
      throw new ConnectionError(
        `Connection '${
          this.#name
        }' is not fully initialized or driver is missing.`
      );
    }
    return this.#driver;
  }

  /**
   * Gets the name of this connection.
   * @returns {string}
   */
  getName() {
    return this.#name;
  }

  /**
   * Creates a new QueryBuilder instance for this connection, optionally
   * associated with a specific Model class for hydration.
   * @param {typeof import('../model/Model.js').Model} [model] The model class for hydration.
   * @returns {QueryBuilder}
   */
  query(model) {
    return new QueryBuilder(this, model);
  }

  /**
   * Creates a new QueryBuilder instance targeting a specific table name directly.
   * Results will be plain objects, not model instances.
   * @param {string} tableName The name of the table.
   * @returns {QueryBuilder}
   */
  table(tableName) {
    const builder = new QueryBuilder(this);
    builder.from(tableName);
    return builder;
  }

  /**
   * Executes a raw SQL query with bindings.
   * @param {string} sql The raw SQL string.
   * @param {any[]} [bindings=[]] An array of parameter bindings.
   * @returns {Promise<any[] | { affectedRows?: number, insertId?: any }>}
   *   - For SELECT: Returns an array of result objects.
   *   - For INSERT, UPDATE, DELETE: Returns an object with affectedRows and potentially insertId.
   * @throws {QueryError} If the query fails.
   */
  async run(sql, bindings = []) {
    try {
      return await this.getDriver().run(sql, bindings);
    } catch (error) {
      throw new QueryError(
        `Raw query failed on connection '${this.#name}'`,
        error,
        sql,
        bindings
      );
    }
  }

  /**
   * Executes a raw SQL query using tagged template literals.
   * Allows syntax like: db.sql`SELECT * FROM users WHERE id = ${userId}`
   * @param {TemplateStringsArray} strings The raw SQL string segments.
   * @param {...any} values The interpolated values to bind.
   * @returns {Promise<any[] | { affectedRows?: number, insertId?: any }>}
   *   - For SELECT: Returns an array of result objects.
   *   - For INSERT, UPDATE, DELETE: Returns an object with affectedRows and potentially insertId.
   * @throws {QueryError} If the query fails.
   */
  sql(strings, ...values) {
    const sql = strings.reduce(
      (query, part, i) => query + part + (i < values.length ? "?" : ""),
      ""
    );
    return this.run(sql, values);
  }

  /**
   * Executes a raw SQL query using a tagged template literal.
   * Automatically handles parameter bindings.
   * Example: await connection.raw`SELECT * FROM users WHERE id = ${userId} AND status = ${'active'}`;
   * @param {TemplateStringsArray} strings The template literal strings.
   * @param {...any} values The values to bind.
   * @returns {Promise<any[] | { affectedRows?: number, insertId?: any }>} Query results.
   */
  raw(strings, ...values) {
    let sql = "";
    const bindings = [];

    values.forEach((value, i) => {
      sql += strings[i];
      if (value instanceof Expression) {
        // If value is raw(), embed it directly
        sql += value.getValue();
      } else {
        // Otherwise, add placeholder and binding
        sql += this.getDriver()
          .getGrammar()
          .getBindingPlaceholder(bindings.length + 1); // Use driver's placeholder format
        bindings.push(value);
      }
    });

    sql += strings[strings.length - 1];

    return this.run(sql, bindings);
  }

  /**
   * Executes a database transaction.
   * The callback receives the connection instance operating within the transaction.
   * The transaction is automatically committed if the callback promise resolves,
   * and rolled back if it rejects or throws an error.
   * @param {(trx: Connection) => Promise<any>} callback The function to execute within the transaction.
   * @param {object} [options] Transaction options (e.g., isolation level - driver dependent).
   * @returns {Promise<any>} The result returned by the callback function.
   * @throws {QueryError} If transaction control fails or the callback throws.
   */
  async transaction(callback, options = {}) {
    const trxDriver = await this.getDriver().beginTransaction(options);

    // Create a temporary Connection instance that uses the transactional driver
    const trxConnection = new Connection(this.#config, this.#name, false); // Don't add to Manager
    trxConnection.#driver = trxDriver; // Use the transaction driver
    trxConnection.#models = this.#models; // Share model registry
    trxConnection.#schemaCache = this.#schemaCache; // Share schema cache
    trxConnection.#isTransaction = true; // Mark as transaction

    try {
      const result = await callback(trxConnection);
      await trxDriver.commit();
      debugLog(`NodeORM: Transaction committed on connection '${this.#name}'.`);
      return result;
    } catch (error) {
      await trxDriver.rollback();
      // Re-throw the original error that caused the rollback
      throw error instanceof QueryError
        ? error
        : new QueryError(
            `Transaction failed on connection '${this.#name}'`,
            error
          );
    }
  }

  /**
   * Checks if the current connection instance is part of an active transaction.
   * @returns {boolean}
   */
  isTransaction() {
    return this.#isTransaction;
  }

  /**
   * Explicitly rolls back the current transaction (if this connection is transactional).
   * Note: `connection.transaction()` handles rollback on error automatically.
   * This is for manual rollback scenarios within the transaction callback.
   * @returns {Promise<void>}
   * @throws {ConnectionError} If not in a transaction.
   * @throws {QueryError} If rollback fails.
   */
  async rollback() {
    if (!this.#isTransaction) {
      throw new ConnectionError(
        "Cannot rollback: Not currently in a transaction."
      );
    }
    try {
      await this.getDriver().rollback(); // Driver handles the actual rollback
      debugLog(
        `NodeORM: Transaction explicitly rolled back on connection '${
          this.#name
        }'.`
      );
    } catch (error) {
      throw new QueryError(
        `Explicit rollback failed on connection '${this.#name}'`,
        error
      );
    }
  }

  /**
   * Closes the database connection or pool.
   * @returns {Promise<void>}
   */
  async drop() {
    try {
      if (this.#driver) {
        await this.#driver.disconnect();
        debugLog(`NodeORM: Connection '${this.#name}' closed.`);
        // Clear driver reference? Maybe not, allow potential reconnect?
        // this.#driver = null;
      }
      // Remove from Manager if it exists there
      if (Manager.hasConnection(this.#name)) {
        Manager.removeConnection(this.#name);
      }
    } catch (error) {
      throw new ConnectionError(
        `Failed to close connection '${this.#name}': ${error.message}`,
        error
      );
    }
  }

  getSchemaBuilder() {
    // No need to cache this usually, it's lightweight
    return new SchemaBuilder(this);
  }
}
