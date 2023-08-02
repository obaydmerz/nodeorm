// src/multisupport.d.ts

import { Model } from "../index.js";
import {
  conditionOrNothing,
  genPairsFromObj,
  generateValueSep,
} from "./utils.js";

/**
 * The abstract class representing a database driver.
 */
export declare class DBDriver {
  /**
   * Verifies if the provided database instance is supported by this driver.
   * @param dbinstance - The database instance to verify.
   * @returns True if the database instance is supported, false otherwise.
   */
  static verify(dbinstance: any): boolean;

  /**
   * Determines the appropriate database driver based on the provided instance and a list of supported drivers.
   * @param dbinstance - The database instance to determine the driver for.
   * @param dbdrivers - The list of supported database drivers.
   * @returns The determined database driver instance or null if none of the drivers match the provided instance.
   */
  static determine(
    dbinstance: any,
    ...dbdrivers: (new (dbinstance: any) => DBDriver)[]
  ): DBDriver | null;

  /**
   * Creates a new DBDriver instance with the given database instance.
   * @param dbinstance - The database instance.
   */
  constructor(dbinstance: any);

  /**
   * The database instance associated with this driver.
   */
  dbinstance: any;

  /**
   * An object containing commands supported by this driver.
   */
  commands: {
    /**
     * Inserts a row into the specified table with the provided data.
     * @param table - The name of the table to insert the row.
     * @param data - The data object representing the attributes of the row.
     * @returns A Promise that resolves when the row is inserted.
     */
    insertRow: ({
      table,
      data,
    }: {
      table: string;
      data: Record<string, any>;
    }) => Promise<void>;

    /**
     * Deletes a row from the specified table based on the provided condition.
     * @param table - The name of the table to delete the row from.
     * @param where - The condition object used to filter the rows for deletion.
     * @returns A Promise that resolves when the row is deleted.
     */
    deleteRow: ({
      table,
      where,
    }: {
      table: string;
      where: Record<string, any>;
    }) => Promise<void>;

    /**
     * Updates a row in the specified table with the provided data based on the provided condition.
     * @param table - The name of the table to update the row in.
     * @param data - The data object representing the updated attributes of the row.
     * @param where - The condition object used to filter the rows for update.
     * @returns A Promise that resolves when the row is updated.
     */
    updateRow: ({
      table,
      data,
      where,
    }: {
      table: string;
      data: Record<string, any>;
      where: Record<string, any>;
    }) => Promise<void>;

    /**
     * Retrieves rows from the specified tables based on the provided conditions.
     * @param tables - The names of the tables to retrieve the rows from.
     * @param columns - The columns to select from the tables (optional, default is all columns).
     * @param where - The condition object used to filter the rows for retrieval (optional).
     * @param limit - The maximum number of rows to retrieve (optional, default is 1000).
     * @param orderby - The column name to order the result by (optional).
     * @param ordertype - The order type (ASC or DESC) for ordering the result (optional, default is ASC).
     * @returns A Promise that resolves with the retrieved rows.
     */
    selectRow: ({
      tables,
      columns,
      where,
      limit,
      orderby,
      ordertype,
    }: {
      tables: string[];
      columns?: string[];
      where?: Record<string, any>;
      limit?: number;
      orderby?: string;
      ordertype?: "ASC" | "DESC";
    }) => Promise<any>;

    /**
     * Retrieves the last inserted row from the specified table based on the primary key.
     * @param columns - The columns to select from the table.
     * @param table - The name of the table to retrieve the row from.
     * @param primary - The name of the primary key column.
     * @returns A Promise that resolves with the last inserted row.
     */
    lastinsert: (
      columns: string[],
      table: string,
      primary: string
    ) => Promise<any>;

    /**
     * Retrieves the column information of the specified table.
     * @param table - The name of the table to retrieve the column information from.
     * @returns A Promise that resolves with an array of column information.
     */
    describe: (
      table: string
    ) => Promise<{ name: string; isPrimary: boolean }[]>;
  };

  /**
   * Initializes the provided model classes with this database driver.
   * @param models - The model classes to initialize with this driver.
   * @returns A Promise that resolves when the models are successfully initialized.
   */
  init(...models: (new () => Model)[]): Promise<void>;

  /**
   * Executes a raw SQL query using the database instance.
   * @param query - The SQL query to execute.
   * @returns A Promise that resolves with the query result.
   */
  query(query: string): Promise<any>;
}

/**
 * The class representing a MySQL database driver.
 */
export declare class MySQLDBDriver extends DBDriver {
  /**
   * Verifies if the provided database instance is a valid MySQL connection.
   * @param dbinstance - The database instance to verify.
   * @returns True if the database instance is a valid MySQL connection, false otherwise.
   */
  static verify(dbinstance: any): boolean;

  /**
   * Creates a new MySQLDBDriver instance with the given database configuration.
   * @param options - The options for the MySQL connection (optional, default values are used if not provided).
   * @returns A Promise that resolves with the MySQLDBDriver instance.
   */
  static from(options?: {
    database?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
  }): Promise<MySQLDBDriver>;

  /**
   * Executes a raw SQL query using the MySQL database instance.
   * @param query - The SQL query to execute.
   * @returns A Promise that resolves with the query result.
   */
  query(query: string): Promise<any>;
}

/**
 * The class representing a SQLite database driver.
 */
export declare class SQLiteDBDriver extends DBDriver {
  /**
   * Verifies if the provided database instance is a valid SQLite connection.
   * @param dbinstance - The database instance to verify.
   * @returns True if the database instance is a valid SQLite connection, false otherwise.
   */
  static verify(dbinstance: any): boolean;

  /**
   * Creates a new SQLiteDBDriver instance with the given SQLite database file path.
   * @param dbPath - The path to the SQLite database file.
   * @returns A Promise that resolves with the SQLiteDBDriver instance.
   */
  static from(dbPath: string): Promise<SQLiteDBDriver>;

  /**
   * Executes a raw SQL query using the SQLite database instance.
   * @param query - The SQL query to execute.
   * @param params - The parameters to be bound to the query (optional).
   * @returns A Promise that resolves with the query result.
   */
  query(query: string, params?: any[]): Promise<any>;
}

/**
 * The class representing a raw function-based database driver.
 */
export declare class RawFunctionDBDriver extends DBDriver {
  /**
   * Verifies if the provided database instance is a valid raw function.
   * @param dbinstance - The database instance to verify.
   * @returns True if the database instance is a valid raw function, false otherwise.
   */
  static verify(dbinstance: any): boolean;

  /**
   * Executes a raw SQL query using the raw function database instance.
   * @param query - The SQL query to execute.
   * @returns A Promise that resolves with the query result.
   */
  query(query: string): Promise<any>;
}
