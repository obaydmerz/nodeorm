/**
 * @fileoverview Facade for database schema manipulation.
 */
import { SchemaBuilder } from "./SchemaBuilder.js";
import { Blueprint } from "./Blueprint.js";
import { Connection } from "../connection/Connection.js"; // For type checking
import { Manager } from "../singleton.js";

/**
 * Provides a database agnostic way to manipulate tables.
 */
class SchemaFacade {
  /** @type {Connection} */
  _connection;

  getConnection() {
    if (typeof this._connection == "string") {
      const conn = Manager.getConnection(this._connection);

      if (!conn) {
        throw new Error(
          `Schema requires connection '${this._connection}', but it's not configured.`
        );
      }

      return conn;
    }

    if (!this._connection) {
      const defConn = Manager.getConnection(Manager.getDefaultConnectionName());

      if(defConn) return defConn;
      else throw new Error(
        `Schema requires a connection, but it's not configured.`
      );
    }

    return this._connection;
  }

  getSchemaBuilder() {
    return new SchemaBuilder(this.getConnection());
  }

  /**
   * @param {Connection} connection The connection instance to use.
   */
  constructor(connection) {
    this._connection = connection;
  }

  /**
   * Specify the connection to use for the schema operation.
   * @param {string | Connection} nameOrInstance Connection name or instance.
   * @returns {SchemaFacade} A new SchemaFacade instance with the specified connection.
   */
  connection(nameOrInstance) {
    let connection;
    if (typeof nameOrInstance === "string") {
      connection = Manager.getConnection(nameOrInstance);
    } else if (nameOrInstance instanceof Connection) {
      connection = nameOrInstance;
    } else {
      throw new Error(
        "Invalid argument for Schema.connection(). Expected connection name or instance."
      );
    }
    // Return a *new* facade instance bound to the specified connection
    return new SchemaFacade(connection);
  }

  /**
   * Create a new table on the schema.
   * @param {string} tableName The name of the table.
   * @param {(blueprint: Blueprint) => void} callback Callback function receiving the Blueprint instance.
   * @returns {Promise<void>}
   */
  async create(tableName, callback) {
    const blueprint = new Blueprint();
    // Automatically add 'id' if not otherwise specified? Laravel doesn't, requires explicit `table.id()`
    callback(blueprint);
    await this.getSchemaBuilder().createTable(tableName, blueprint);
  }

  /**
   * Modify an existing table on the schema.
   * @param {string} tableName The name of the table.
   * @param {(blueprint: Blueprint) => void} callback Callback function receiving the Blueprint instance.
   * @returns {Promise<void>}
   */
  async table(tableName, callback) {
    const blueprint = new Blueprint();
    callback(blueprint);
    await this.getSchemaBuilder().alterTable(tableName, blueprint);
  }

  /**
   * Rename a table on the schema.
   * @param {string} from Old table name.
   * @param {string} to New table name.
   * @returns {Promise<void>}
   */
  async rename(from, to) {
    await this.getSchemaBuilder().renameTable(from, to);
  }

  /**
   * Drop a table from the schema.
   * @param {string} tableName
   * @returns {Promise<void>}
   */
  async drop(tableName) {
    await this.getSchemaBuilder().dropTable(tableName);
  }

  /**
   * Drop a table from the schema if it exists.
   * @param {string} tableName
   * @returns {Promise<void>}
   */
  async dropIfExists(tableName) {
    await this.getSchemaBuilder().dropTableIfExists(tableName);
  }

  /**
   * Enable foreign key constraints.
   * @returns {Promise<void>}
   */
  async enableForeignKeyConstraints() {
    await this.getSchemaBuilder().enableForeignKeyConstraints();
  }

  /**
   * Disable foreign key constraints.
   * @returns {Promise<void>}
   */
  async disableForeignKeyConstraints() {
    await this.getSchemaBuilder().disableForeignKeyConstraints();
  }

  /**
   * Check if the given table exists.
   * @param {string} tableName
   * @returns {Promise<boolean>}
   */
  async hasTable(tableName) {
    return this.getSchemaBuilder().hasTable(tableName);
  }

  /**
   * Check if the given column exists in a table.
   * @param {string} tableName
   * @param {string} columnName
   * @returns {Promise<boolean>}
   */
  async hasColumn(tableName, columnName) {
    return this.getSchemaBuilder().hasColumn(tableName, columnName);
  }

  /**
   * Get the column listing for a given table.
   * @param {string} tableName
   * @returns {Promise<string[]>}
   */
  async getColumnListing(tableName) {
    return this.getSchemaBuilder().getColumnListing(tableName);
  }

  /**
   * Describe a table and return its structure as a Blueprint.
   * @param {string} tableName
   * @returns {Promise<Blueprint>}
   */
  async describe(tableName) {
    if (typeof this.getConnection().getDriver().describeTable !== "function") {
      throw new Error(
        `The '${
          this.getConnection().getDriver().constructor.name
        }' driver does not support describing tables.`
      );
    }
    const blueprint = await this.getConnection()
      .getDriver()
      .describeTable(tableName);
    if (!(blueprint instanceof Blueprint)) {
      throw new Error(
        "Driver's describeTable method did not return a Blueprint instance."
      );
    }
    return blueprint;
  }
}

export { SchemaFacade };
