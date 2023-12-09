import { Model } from "../index.js";

/**
 * Interface for objects that represent a database connection.
 */
export interface DBConnection {
  query(query: string, prepared?: any[]): Promise<any>;
}

/**
 * Function to get a database library instance from a set of libraries.
 * @param librarySets - Sets of libraries to choose from.
 * @returns A Promise resolving to a database library instance.
 */
export declare function getLibrary(...librarySets: any[]): Promise<any>;

/**
 * The abstract class representing a database driver.
 */
export declare class DBDriver {
  /**
   * The library property for the database driver.
   */
  static library: any[];

  /**
   * Extracts database configuration from environment variables.
   * @param envObject - The environment variables object.
   * @returns The extracted configuration or undefined.
   */
  static extractFromEnv(envObject: Record<string, string>): any;

  /**
   * Verifies if the provided library object is valid.
   * @param library - The library object to verify.
   * @returns True if the library object is valid, false otherwise.
   */
  static verifyLibraryObject(library: any): boolean;

  /**
   * Verifies if the provided database instance object is valid.
   * @param dbinstance - The database instance object to verify.
   * @returns True if the database instance object is valid, false otherwise.
   */
  static verifyInstanceObject(dbinstance: any): boolean;

  /**
   * Creates a new DBDriver instance with the given database instance.
   * @param dbinstance - The database instance.
   */
  constructor(dbinstance: DBConnection);

  /**
   * The database instance associated with this driver.
   */
  dbinstance: DBConnection;

  /**
   * An object containing commands supported by this driver.
   */
  commands: {
    insertRow: ({
      table,
      data,
    }: {
      table: string;
      data: Record<string, any>;
    }) => Promise<void>;
    deleteRow: ({
      table,
      where,
    }: {
      table: string;
      where: Record<string, any>;
    }) => Promise<void>;
    updateRow: ({
      table,
      data,
      where,
    }: {
      table: string;
      data: Record<string, any>;
      where: Record<string, any>;
    }) => Promise<void>;
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
    lastinsert: (
      columns: string[],
      table: string,
      primary: string
    ) => Promise<any>;
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
   * The library property for the MySQL database driver.
   */
  static library: string[];

  /**
   * Extracts MySQL database configuration from environment variables.
   * @param envObject - The environment variables object.
   * @returns The extracted configuration or undefined.
   */
  static extractFromEnv(envObject: Record<string, string>): any;

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
   * The library property for the SQLite database driver.
   */
  static library: string[];

  /**
   * Extracts SQLite database configuration from environment variables.
   * @param envObject - The environment variables object.
   * @returns The extracted configuration or undefined.
   */
  static extractFromEnv(envObject: Record<string, string>): any;

  /**
   * Creates a new SQLiteDBDriver instance with the given database configuration.
   * @param options - The options for the SQLite connection (optional, default values are used if not provided).
   * @returns A Promise that resolves with the SQLiteDBDriver instance.
   */
  static from(options?: {
    database?: string;
    library?: string;
  }): Promise<SQLiteDBDriver>;

  /**
   * Executes a raw SQL query using the SQLite database instance.
   * @param query - The SQL query to execute.
   * @returns A Promise that resolves with the query result.
   */
  query(query: string): Promise<any>;
}

/**
 * The class representing a raw function database driver.
 */
export declare class RawFunctionDBDriver extends DBDriver {
  /**
   * Creates a new RawFunctionDBDriver instance with the given raw function.
   * @param dbinstance - The raw function representing the database instance.
   * @returns The RawFunctionDBDriver instance.
   */
  static from(
    dbinstance: (query: string, prepared: any[]) => Promise<any>
  ): RawFunctionDBDriver;

  /**
   * Executes a raw SQL query using the raw function database instance.
   * @param query - The SQL query to execute.
   * @returns A Promise that resolves with the query result.
   */
  query(query: string): Promise<any>;
}
