/**
 * @fileoverview Manages multiple database connections.
 */
import { Connection } from "./Connection.js";
import { ConnectionError } from "../errors.js";

/**
 * Manages named database connections.
 */
export class ConnectionManager {
  /** @type {Map<string, Connection>} */
  #connections = new Map();
  /** @type {string} */
  #defaultConnectionName = "default";

  async ensureDefault() {
    const def = this.#connections.get(this.#defaultConnectionName);

    if(!def) {
      const conn = await Connection.make(null, this.#defaultConnectionName, this);
    }
  }

  defaultConnection() {
    return this.#defaultConnectionName
      ? this.getConnection(this.#defaultConnectionName)
      : null;
  }

  /**
   * Adds a connection instance to the manager.
   * @param {string} name The name for the connection.
   * @param {Connection} connection The connection instance.
   * @param {boolean} [isDefault=false] Set this connection as the default.
   */
  addConnection(name, connection, isDefault = false) {
    if (!(connection instanceof Connection)) {
      throw new TypeError(
        "Connection must be an instance of Connection class."
      );
    }
    this.#connections.set(name, connection);
    if (isDefault || this.#connections.size == 1) {
      this.#defaultConnectionName = name;
    }
  }

  /**
   * Gets a connection by name, or the default connection if no name is provided.
   * @param {string} [name] The name of the connection.
   * @returns {Connection} The connection instance.
   */
  getConnection(name) {
    const connectionName = name || this.#defaultConnectionName;
    const connection = this.#connections.get(connectionName);
    return connection;
  }

  /**
   * Removes a connection from the manager.
   * @param {string} name The name of the connection to remove.
   * @returns {boolean} True if a connection was removed, false otherwise.
   */
  removeConnection(name) {
    return this.#connections.delete(name);
  }

  /**
   * Checks if a connection exists.
   * @param {string} name The connection name.
   * @returns {boolean}
   */
  hasConnection(name) {
    return this.#connections.has(name);
  }

  /**
   * Gets the name of the default connection.
   * @returns {string}
   */
  getDefaultConnectionName() {
    return this.#defaultConnectionName;
  }

  /**
   * Sets the default connection name.
   * @param {string} name The name of the connection to set as default.
   * @throws {ConnectionError} If the connection name doesn't exist.
   */
  setDefaultConnectionName(name) {
    if (!this.hasConnection(name)) {
      throw new ConnectionError(
        `Cannot set default connection: Connection '${name}' not found.`
      );
    }
    this.#defaultConnectionName = name;
  }

  /**
   * Closes all managed connections.
   * @returns {Promise<void>}
   */
  async disconnectAll() {
    const promises = [];
    for (const connection of this.#connections.values()) {
      promises.push(connection.drop());
    }
    await Promise.all(promises);
    this.#connections.clear();
  }
}
