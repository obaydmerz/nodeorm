/**
 * @fileoverview PostgreSQL database driver implementation.
 * Supports 'pg' and '@neondatabase/serverless'.
 */
import { BaseDriver } from "../BaseDriver.js";
import { PostgresGrammar } from "./PostgresGrammar.js";
import { QueryError, ConnectionError } from "../../errors.js";
import { debugLog, debugWarn, tryToImport } from "../../utils/helpers.js";
import { PostgresSchemaGrammar } from "./PostgresSchemaGrammar.js";
import { Blueprint } from "../../schema/Blueprint.js";

/**
 * @typedef {import('pg').Pool | import('@neondatabase/serverless').Pool} PgPool
 * @typedef {import('pg').PoolClient | import('@neondatabase/serverless').PoolClient} PgPoolClient
 * @typedef {import('pg').QueryResult | import('@neondatabase/serverless').QueryResult} PgQueryResult
 * @typedef {import('pg').PoolConfig | import('@neondatabase/serverless').PoolConfig} PgPoolConfig
 */

const POSTGRES_DEFAULT_PORT = 5432;

/**
 * PostgreSQL Driver.
 * Attempts to use '@neondatabase/serverless' first, then 'pg'.
 */
export class PostgresDriver extends BaseDriver {
  /** @type {PgPool} */
  _pool;
  /** @type {PgPoolConfig} */
  _poolConfig;
  /** @type {string} Detected library ('pg' or 'neon') */
  _library;
  /** @type {PgPoolClient | null} Client for transaction context */
  _transactionClient = null;

  /** @inheritdoc */
  _createGrammar() {
    return new PostgresGrammar();
  }

  /** @inheritdoc */
  async connect() {
    if (this._isConnected) return;

    let pg;
    try {
      // Prefer @neondatabase/serverless if available
      pg = await this._importPackage(
        "@neondatabase/serverless",
        "postgres (neon)"
      );
      this._library = "neon";
      debugLog("NodeORM: Using '@neondatabase/serverless' driver.");

      if (typeof WebSocket == "undefined") {
        const wsLib = await tryToImport("ws");

        if (!wsLib) {
          throw new Error(
            "Neon needs `ws` installed to function, or a global `WebSocket` constructor to be available."
          );
        }

        global.WebSocket = wsLib.default;

        pg.neonConfig.webSocketConstructor = wsLib.default;
      }
    } catch (e) {
      if (e.code === "DriverPackageNotFoundError") {
        debugLog("NodeORM: '@neondatabase/serverless' not found, trying 'pg'.");
        try {
          pg = await this._importPackage("pg", "postgres (pg)");
          this._library = "pg";
          debugLog("NodeORM: Using 'pg' driver.");
        } catch (e2) {
          if (e2.code === "DriverPackageNotFoundError") {
            throw new ConnectionError(
              "Neither '@neondatabase/serverless' nor 'pg' package found. Please install one (`npm install pg` or `npm install @neondatabase/serverless`)."
            );
          }
          throw e2; // Re-throw other errors from pg import
        }
      } else {
        throw e; // Re-throw other errors from neon import
      }
    }

    this._resolvePoolConfig(pg);

    try {
      debugLog(`NodeORM: Connecting to PostgreSQL with config:`, {
        ...this._poolConfig,
        password: "***",
      });
      this._pool = new pg.Pool(this._poolConfig);

      // Handle pool errors
      this._pool.on("error", (err, client) => {
        debugWarn(
          `NodeORM Warning: PostgreSQL pool error on connection '${
            this._config.name || "default"
          }':`,
          err.message
        );
        // Optional: Attempt to remove client or handle error more gracefully
      });

      // Test connection
      const client = await this._pool.connect();
      await client.query("SELECT NOW()"); // Simple query to test
      client.release();

      this._isConnected = true;
      debugLog(
        `NodeORM: PostgreSQL connection pool established for '${
          this._config.name || "default"
        }'.`
      );
    } catch (error) {
      this._isConnected = false;
      // Clean up pool if partially created
      if (this._pool && typeof this._pool.end === "function") {
        await this._pool
          .end()
          .catch((e) =>
            debugWarn(
              "NodeORM Warning: Failed to clean up pool after connection error:",
              e
            )
          );
        this._pool = null;
      }
      throw new ConnectionError(
        `PostgreSQL connection failed: ${error.message}`,
        error
      );
    }
  }

  /** @inheritdoc */
  async disconnect() {
    if (this._isConnected && this._pool) {
      try {
        await this._pool.end();
        this._isConnected = false;
        this._pool = null;
        debugLog(
          `NodeORM: PostgreSQL connection pool closed for '${
            this._config.name || "default"
          }'.`
        );
      } catch (error) {
        throw new ConnectionError(
          `Failed to close PostgreSQL connection: ${error.message}`,
          error
        );
      }
    }
    // Ensure any lingering transaction client reference is cleared
    this._transactionClient = null;
  }

  /**
   * Resolves pool configuration from the main config object.
   * @param {any} pg The imported pg or neon library object.
   * @private
   */
  _resolvePoolConfig(pg) {
    // Basic config mapping
    this._poolConfig = {
      host: this._config.host,
      port: this._config.port || POSTGRES_DEFAULT_PORT,
      user: this._config.user || this._config.username,
      password: this._config.password,
      database: this._config.database,
      connectionTimeoutMillis:
        this._config.connectionTimeoutMillis ||
        this._config.connectTimeout ||
        5000, // Standardize timeout name
      idleTimeoutMillis: this._config.idleTimeoutMillis || 30000,
      max: this._config.maxConnections || this._config.connectionLimit || 10, // Standardize pool size name
      ssl: this._config.ssl, // Pass ssl object directly { rejectUnauthorized: false, mode: 'require', ca: '...', cert: '...', key: '...' }
      // Neon specific websocket options? Let user pass via options.
      // Pass other pg options
      ...this._config.options,
    };

    // Handle connection string if other params are missing
    if (
      !this._poolConfig.host &&
      !this._poolConfig.database &&
      this._config.connectionString
    ) {
      this._poolConfig.connectionString = this._config.connectionString;
    }

    // Set application_name for easier debugging on the server side
    this._poolConfig.application_name =
      this._poolConfig.application_name ||
      this._config.application_name ||
      `NodeORM_${this._config.name || "default"}`;

    // Ensure pg types are set up correctly (especially for numeric/decimal)
    // Requires 'pg-types' package if using 'pg' and needing precise numeric handling
    if (this._library === "pg" && pg.types) {
      try {
        const types = pg.types;
        // Example: Keep NUMERIC as string to avoid precision loss
        const TIMESTAMPTZ_OID = 1184;
        const TIMESTAMP_OID = 1114;
        const DATE_OID = 1082;
        const NUMERIC_OID = 1700;
        types.setTypeParser(NUMERIC_OID, (val) => val); // Keep NUMERIC as string
        // Default date parsers are usually okay, but can override if needed
        // types.setTypeParser(TIMESTAMP_OID, (val) => parseDateFromDb(val));
        // types.setTypeParser(TIMESTAMPTZ_OID, (val) => parseDateFromDb(val));
        // types.setTypeParser(DATE_OID, (val) => parseDateFromDb(val));
        debugLog(
          "NodeORM: Configured pg 'numeric' type parser to return strings."
        );
      } catch (e) {
        debugWarn(
          "NodeORM Warning: Could not configure pg types. Ensure 'pg' and potentially 'pg-types' are correctly installed if precise type handling is needed.",
          e
        );
      }
    }
  }

  /**
   * Gets a client, either from the pool or the transaction client.
   * @returns {Promise<PgPoolClient>}
   * @private
   */
  async _getClient() {
    if (this._transactionClient) {
      return this._transactionClient;
    }
    if (!this._pool) {
      throw new ConnectionError(
        "PostgreSQL driver is not connected or pool is missing."
      );
    }
    return this._pool.connect();
  }

  /**
   * Releases a client if it came from the pool.
   * @param {PgPoolClient} client
   * @private
   */
  _releaseClient(client) {
    // Only release if it's not the transaction client
    if (
      client &&
      client !== this._transactionClient &&
      typeof client.release === "function"
    ) {
      client.release();
    }
  }

  /** @inheritdoc */
  async run(sql, bindings) {
    if (!this._isConnected && !this._transactionClient) {
      // Allow running queries during transaction setup/teardown via _transactionClient
      throw new ConnectionError(
        `PostgreSQL driver is not connected for connection '${
          this._config.name || "default"
        }'. Cannot run query.`
      );
    }

    const client = await this._getClient();
    try {
      debugLog(
        `NodeORM PostgreSQL Query: ${sql} [${bindings
          .map((b) => (typeof b === "string" ? `'${b}'` : b))
          .join(", ")}]`
      ); // Basic logging, quote strings
      const startTime = process.hrtime.bigint();

      const result = await client.query(sql, bindings);

      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1_000_000; // Milliseconds
      debugLog(`NodeORM PostgreSQL Query Time: ${duration.toFixed(3)}ms`);

      // Process result based on command type
      switch (result.command) {
        case "SELECT":
          // Return rows directly
          return result.rows;
        case "INSERT":
        case "UPDATE":
        case "DELETE":
          // Return affected rows and potentially the ID from RETURNING
          const insertId =
            result.rows && result.rows.length > 0
              ? result.rows[0][Object.keys(result.rows[0])[0]] // Assume first col of first row is ID
              : null;
          return {
            affectedRows: result.rowCount,
            insertId: insertId,
          };
        default:
          // For other commands (e.g., CREATE, ALTER, SET), return metadata
          return {
            command: result.command,
            rowCount: result.rowCount,
            rows: result.rows, // Include rows if any were returned
          };
      }
    } catch (error) {
      throw new QueryError(
        `PostgreSQL query failed: ${error.message}`,
        error,
        sql,
        bindings
      );
    } finally {
      this._releaseClient(client);
    }
  }

  /** @inheritdoc */
  async beginTransaction(options = {}) {
    if (this._transactionClient) {
      throw new ConnectionError(
        "Cannot start a nested transaction with this driver setup."
      );
    }

    const client = await this._pool.connect(); // Get a dedicated client
    try {
      // Set transaction characteristics if provided
      let characteristics = [];
      if (options.isolationLevel) {
        characteristics.push(`ISOLATION LEVEL ${options.isolationLevel}`); // READ COMMITTED, REPEATABLE READ, SERIALIZABLE
      }
      if (options.readOnly) {
        characteristics.push("READ ONLY");
      }
      if (options.deferrable) {
        // NOT DEFERRABLE is default
        characteristics.push("DEFERRABLE");
      }
      if (characteristics.length > 0) {
        await client.query(`SET TRANSACTION ${characteristics.join(" ")}`);
      }

      await client.query("BEGIN");
      debugLog(
        `NodeORM: PostgreSQL transaction started on connection '${
          this._config.name || "default"
        }'.`
      );

      // Store the client for this transaction context
      this._transactionClient = client;

      // Return 'this' instance, but now run() will use the _transactionClient
      // We don't create a new driver instance like MySQL here, just modify state.
      return this; // TODO: Review if returning a new instance is better for state isolation
    } catch (error) {
      client.release(); // Release client if begin fails
      this._transactionClient = null;
      throw new QueryError(
        `Failed to begin PostgreSQL transaction: ${error.message}`,
        error
      );
    }
  }

  /** @inheritdoc */
  async commit() {
    if (!this._transactionClient) {
      throw new ConnectionError("Cannot commit: Not in a transaction.");
    }
    const client = this._transactionClient;
    try {
      await client.query("COMMIT");
      debugLog(
        `NodeORM: PostgreSQL transaction committed on '${
          this._config.name || "default"
        }'.`
      );
    } catch (error) {
      // Attempt to rollback after failed commit? Might be complex.
      throw new QueryError(
        `Failed to commit PostgreSQL transaction: ${error.message}`,
        error
      );
    } finally {
      if (client) {
        client.release();
      }
      this._transactionClient = null; // Clear transaction state
    }
  }

  /** @inheritdoc */
  async rollback() {
    if (!this._transactionClient) {
      throw new ConnectionError("Cannot rollback: Not in a transaction.");
    }
    const client = this._transactionClient;
    try {
      await client.query("ROLLBACK");
      debugLog(
        `NodeORM: PostgreSQL transaction rolled back on '${
          this._config.name || "default"
        }'.`
      );
    } catch (error) {
      throw new QueryError(
        `Failed to rollback PostgreSQL transaction: ${error.message}`,
        error
      );
    } finally {
      if (client) {
        client.release();
      }
      this._transactionClient = null; // Clear transaction state
    }
  }

  /** @inheritdoc */
  async getTableSchema(tableName) {
    // Default to 'public' schema if not specified in config
    const schemaName = this._config.schema || "public";
    const sql = `
             SELECT
                 c.column_name AS name,
                 c.udt_name AS type, -- Underlying data type name
                 c.data_type AS dataType, -- General type (e.g., 'character varying', 'integer', 'boolean')
                 c.is_nullable AS nullable,
                 c.column_default AS "default",
                 (SELECT COUNT(*) > 0
                   FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu
                   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                   WHERE tc.constraint_type = 'PRIMARY KEY'
                     AND tc.table_schema = c.table_schema
                     AND tc.table_name = c.table_name
                     AND kcu.column_name = c.column_name) AS "isPrimaryKey",
                 (c.column_default IS NOT NULL AND c.column_default LIKE 'nextval%') AS "isAutoIncrementing" -- Basic check for sequence default
             FROM information_schema.columns c
             WHERE c.table_schema = $1 AND c.table_name = $2
             ORDER BY c.ordinal_position;
         `;

    const results = await this.run(sql, [schemaName, tableName]);

    if (!Array.isArray(results) || results.length === 0) {
      throw new QueryError(
        `Table '${schemaName}.${tableName}' not found or no columns defined.`
      );
    }

    const columns = {};
    results.forEach((row) => {
      columns[row.name] = {
        name: row.name,
        type: row.type, // e.g., 'varchar', 'int4', 'bool'
        dataType: row.dataType, // e.g., 'character varying', 'integer', 'boolean'
        nullable: row.nullable === "YES",
        default: row.default,
        isPrimaryKey: row.isPrimaryKey === true || row.isPrimaryKey === "t", // Handle potential boolean/string variations
        isAutoIncrementing:
          row.isAutoIncrementing === true || row.isAutoIncrementing === "t",
      };
    });

    return { tableName: `${schemaName}.${tableName}`, columns };
  }

  /** @inheritdoc */
  async describeTable(tableName) {
    // Postgres requires more complex queries joining pg_catalog tables for full details
    // This is a simplified version based on information_schema, similar to getTableSchema
    // A more robust version would query pg_attribute, pg_class, pg_constraint etc.
    console.warn(
      "NodeORM Schema (Postgres): describeTable provides simplified schema based on information_schema. Full constraint/index details may be missing."
    );

    const schemaName = this._config.schema || "public";
    const infoSchemaSql = `
         SELECT
             c.column_name AS name,
             c.udt_name AS type, -- Underlying data type name
             c.data_type AS dataType, -- General type (e.g., 'character varying', 'integer', 'boolean')
             c.is_nullable AS nullable,
             c.column_default AS "default",
             c.character_maximum_length AS maxLength,
             c.numeric_precision,
             c.numeric_scale,
             (SELECT COUNT(*) > 0 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND kcu.column_name = c.column_name) AS "isPrimaryKey",
             (SELECT COUNT(*) > 0 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND kcu.column_name = c.column_name) AS "isUnique",
             (c.column_default IS NOT NULL AND c.column_default LIKE 'nextval%') AS "isAutoIncrementing" -- Basic check
         FROM information_schema.columns c
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position;
     `;

    const results = await this.run(infoSchemaSql, [schemaName, tableName]);
    if (!Array.isArray(results) || results.length === 0) {
      throw new QueryError(
        `Table '${schemaName}.${tableName}' not found or has no columns.`
      );
    }

    const blueprint = new Blueprint();
    results.forEach((col) => {
      let command = null;
      let args = [col.name];
      let modifiers = {};

      const type = col.type.toLowerCase();
      const dataType = col.dataType.toLowerCase();

      // --- Type Mapping (Simplified - Needs Expansion) ---
      if (col.isPrimaryKey && col.isAutoIncrementing) {
        if (type === "bigint" || type === "int8") command = "bigIncrements";
        else if (type === "smallint" || type === "int2")
          command = "smallIncrements";
        else command = "increments"; // Default int4
        args = [col.name];
      } else if (type === "uuid") command = "uuid";
      else if (type === "bpchar") {
        command = "char";
        args.push(col.maxLength);
      } else if (type === "varchar") {
        command = "string";
        args.push(col.maxLength || 255);
      } else if (type === "text")
        command = "text"; // Includes various text types
      else if (type === "int8" || type === "bigint") command = "bigInteger";
      else if (type === "int4" || type === "integer") command = "integer";
      else if (type === "int2" || type === "smallint") command = "smallInteger";
      else if (type === "bool" || type === "boolean") command = "boolean";
      else if (type === "numeric") {
        command = "decimal";
        args.push(col.numeric_precision, col.numeric_scale);
      } else if (type === "float4") command = "float"; // real
      else if (type === "float8") command = "double"; // double precision
      else if (type === "date") command = "date";
      else if (type === "timestamp") {
        command = "timestamp";
        args.push(col.datetime_precision ?? 0);
      } // Assuming datetime_precision exists in your version
      else if (type === "timestamptz") {
        command = "timestampTz";
        args.push(col.datetime_precision ?? 0);
      } else if (type === "time") {
        command = "time";
        args.push(col.datetime_precision ?? 0);
      } else if (type === "timetz") {
        command = "timeTz";
        args.push(col.datetime_precision ?? 0);
      } else if (type === "json") command = "json";
      else if (type === "jsonb") command = "jsonb";
      else if (type === "bytea") command = "binary";
      else if (type === "inet") command = "ipAddress";
      else if (type === "macaddr") command = "macAddress";
      // Add GEOMETRY, USER-DEFINED types etc.

      // --- Modifiers ---
      if (col.nullable === "YES") modifiers.nullable = true;
      if (col.default !== null) modifiers.default = col.default; // Need to handle functions like now()
      if (col.isPrimaryKey && !col.isAutoIncrementing) modifiers.primary = true;
      if (col.isUnique) modifiers.unique = true;
      // Other modifiers like comments, collation need specific queries to pg_catalog

      if (command) {
        blueprint._addCommand("column", args[0], {
          columnType: command,
          ...Object.fromEntries(args.slice(1).map((a, i) => [`arg${i}`, a])),
        });
        blueprint._addModifier("modifiers", modifiers);
      } else {
        console.warn(
          `NodeORM Schema Describe (Postgres): Could not map type '${type}' for column '${col.name}'.`
        );
        blueprint._addCommand("column", col.name, {
          columnType: "raw",
          rawDefinition: type,
        });
        blueprint._addModifier("modifiers", modifiers);
      }
    });

    // TODO: Fetch and add separate INDEX, UNIQUE, PRIMARY, FOREIGN constraints from pg_catalog views

    return blueprint;
  }

  _createSchemaGrammar(queryGrammar) {
    return new PostgresSchemaGrammar(queryGrammar);
  }
}
