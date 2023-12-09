import { Model, ModelItem } from "./src/model.js";
import { SQLBuilder } from "./src/sql.js";
import {
  DBDriver,
  MySQLDBDriver,
  RawFunctionDBDriver,
  SQLiteDBDriver,
} from "./src/multisupport.js";

export class NodeORM {
  static dbdrivers = [MySQLDBDriver, SQLiteDBDriver, RawFunctionDBDriver];

  static defaultDB = undefined; // Will fallback to env reading

  static envObject = process.env;

  static async extractFromEnv() {
    if (
      typeof this.envObject["DB_CONNECTION"] !== "string" ||
      this.envObject["DB_CONNECTION"].length == 0
    ) {
      throw new Error(
        "When using environment. no 'DB_CONNECTION' env variable or it isn't a string."
      );
    }

    for (const dbdriver of this.dbdrivers) {
      try {
        if (!(dbdriver.prototype instanceof DBDriver)) continue;
        const data = await dbdriver.extractFromEnv(this.envObject); // It should return an array, because that array is going to be 'extracted' into dbdriver.make(...here) directly.

        if (!Array.isArray(data)) continue;

        return await dbdriver.make(...data);
      } catch (error) {}
    }

    throw new Error(
      `Unsupported database type: ${this.envObject["DB_CONNECTION"]}`
    );
  }

  static async determine(dbinstance) {
    dbinstance = dbinstance || this.defaultDB;

    // If the given dbinstance is a promise, resolve it
    if (dbinstance instanceof Promise) dbinstance = await dbinstance;

    // Return the given DBDriver
    if (dbinstance instanceof DBDriver) return dbinstance;

    // Search for a DBDriver that can handle the given.
    for (const dbdriver of this.dbdrivers) {
      const made = await dbdriver.make(dbinstance);
      if (made instanceof DBDriver) {
        if (!dbinstance && !this.defaultDB) this.defaultDB = made; // Prevent creating other connections using multiple initalize().

        return made;
      }
    }

    // None of the above, fallback to env reading...
    return await this.extractFromEnv();
  }
}

export async function initalize(connection, ...models) {
  if (connection instanceof Promise) connection = await connection;

  if (connection.prototype instanceof Model) {
    // All of arguments are models?
    models.push(connection);
    connection = undefined;
  }

  const conn = await NodeORM.determine(connection);

  for (const model of models) {
    if (!(model.prototype instanceof Model)) {
      continue;
    }
    await model.init(conn);
  }
}

export {
  MySQLDBDriver,
  SQLiteDBDriver,
  RawFunctionDBDriver,
  DBDriver,
  Model,
  ModelItem,
  SQLBuilder,
};
