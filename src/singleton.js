import { Connection } from "./connection/Connection.js";
import { ConnectionManager } from "./connection/ConnectionManager.js";
import { Model } from "./model/Model.js";
import { SchemaFacade } from "./schema/Schema.js";

/**
 * Singleton instance of the ConnectionManager.
 * @type {ConnectionManager}
 */
const Manager = new ConnectionManager();

async function init(config, name, ...models) {
    let manager = Manager;

    if(config instanceof ConnectionManager) {
        manager = config;
    }

    if (typeof config == "string") {
      const get = manager.getConnection(config);
      if (get) {
        config = get;
      }
    }

    if (name?.prototype instanceof Model) {
      models.push(name);
      name = Math.random().toString(6).substring(2);
    }

    if (config?.prototype instanceof Model) {
      models.push(config);

      config = manager.defaultConnection() || (await Connection.make(null, name, manager));
    }

    if (!(config instanceof Connection)) {
      config = await Connection.make(config, name, manager);
    }

    if (models.length) await config.init(...models);

    return config;
  }

/**
 * @deprecated
 */
function initialize(config, name, ...models) {
    return init(config, name, ...models);
}

// Export a single instance bound to the default connection
// Allow switching connection via Schema.connection(...)
const Schema = new SchemaFacade(null); // Use default connection initially

export { Manager, Schema, init, initialize };