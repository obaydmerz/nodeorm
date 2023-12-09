import { Model, ModelItem } from "./src/model.js";
import { SQLBuilder } from "./src/sql.js";
import {
  DBDriver,
  MySQLDBDriver,
  RawFunctionDBDriver,
  SQLiteDBDriver,
} from "./src/multisupport.js";

/**
 * Main class representing the Node ORM library.
 * @class NodeORM
 */
export declare class NodeORM {
  /**
   * An array of supported database drivers.
   */
  static dbdrivers: (new (dbinstance: any) => DBDriver)[];

  /**
   * The default database instance to use if no other valid instance is provided.
   */
  static defaultDB: any;

  /**
   * Determines the appropriate database driver based on the provided instance or the default database.
   * @param dbinstance - The database instance to determine the driver for. Pass 'env' to read database credentials from environment variables.
   * @returns The determined database driver.
   */
  static determine(dbinstance?: any): Promise<DBDriver>;
}

export declare function initialize(
  connection: typeof DBDriver,
  ...models: Array<typeof Model>
): Promise<void>;

// Exporting the database driver classes
export {
  MySQLDBDriver,
  SQLiteDBDriver,
  RawFunctionDBDriver,
  DBDriver,
  Model,
  ModelItem,
  SQLBuilder,
};
