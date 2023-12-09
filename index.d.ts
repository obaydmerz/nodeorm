// index.d.ts
import { Collection } from "./src/collection.js";

// Importing database driver classes
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

/**
 * A class that lets you make complex SQL queries.
 * @class SQLBuilder
 */
export declare class SQLBuilder {
  /**
   * Creates a new SQLBuilder instance for the specified table and model.
   * @param table - The name of the table or an array of table names to query.
   * @param model - The model associated with the table.
   * @param defprefix - The default prefix for column names in the table.
   */
  constructor(table: string | string[], model: Model, defprefix?: string);

  /**
   * Sets a WHERE condition for the SQL query.
   * @param key - The column name or expression to filter on.
   * @param valueOrSep - The value to compare with or the operator to use in the comparison.
   * @param value - The value to compare with (optional if valueOrSep is the operator).
   * @returns The SQLBuilder instance with the updated WHERE condition.
   */
  where(
    key: string,
    valueOrSep: ">" | "<" | "=" | "LIKE" | "NOT LIKE" | any,
    value?: any
  ): this;

  /**
   * Adds a JOIN clause to the SQL query.
   * @param model - The model to join with.
   * @param localKey - The local key in the current table to use for the join (optional).
   * @param foreignKey - The foreign key in the joined table to use for the join (optional).
   * @returns The SQLBuilder instance with the added JOIN clause.
   */
  join(model: Model, localKey?: string, foreignKey?: string): this;

  /**
   * Sets a WHERE expression for the SQL query.
   * @param key - The column name or expression to filter on.
   * @param valueOrSep - The value to compare with or the operator to use in the comparison.
   * @param value - The value to compare with (optional if valueOrSep is the operator).
   * @returns The SQLBuilder instance with the updated WHERE expression.
   */
  whereExpression(
    key: string,
    valueOrSep: ">" | "<" | "=" | "LIKE" | "NOT LIKE" | any,
    value?: any
  ): this;

  /**
   * Sets the ORDER BY clause for the SQL query.
   * @param column - The column name to order by.
   * @param type - The order type (ASC or DESC) (optional).
   * @returns The SQLBuilder instance with the updated ORDER BY clause.
   */
  orderBy(column: string, type?: "ASC" | "DESC"): this;

  /**
   * Sets the LIMIT clause for the SQL query.
   * @param x - The number of records to limit the result to.
   * @returns The SQLBuilder instance with the updated LIMIT clause.
   */
  limit(x: number): this;

  /**
   * Executes the SQL query and returns a Collection of ModelItems representing the result.
   * @returns A Promise that resolves to a Collection of ModelItems representing the query result, or undefined if no result found.
   */
  get(): Promise<Collection | undefined>;

  /**
   * Retrieves the first ModelItem from the SQL query result.
   * @param modIndex - The index modifier for getting the first item (optional, default is 0).
   * @returns A Promise that resolves to the first ModelItem from the query result, or undefined if not found.
   */
  first(modIndex?: number): Promise<ModelItem | undefined>;

  /**
   * Retrieves the first ModelItem from the SQL query result, or creates it.
   * @returns A Promise that resolves to the first ModelItem from the query result, or a new one if not found.
   */
  firstOrCreate(): Promise<ModelItem>;

  /**
   * Retrieves the last ModelItem from the SQL query result.
   * @param modIndex - The index modifier for getting the last item (optional, default is 0).
   * @returns A Promise that resolves to the last ModelItem from the query result, or undefined if not found.
   */
  last(modIndex?: number): Promise<ModelItem | undefined>;

  /**
   * Iterates over each ModelItem in the SQL query result and applies the provided callback function to each item.
   * @param cb - The callback function to apply to each ModelItem.
   * @returns A Promise that resolves to a boolean indicating whether all iterations were successful (true) or not (false).
   */
  each(
    cb: (item: ModelItem, index: number) => Promise<boolean> | boolean
  ): Promise<boolean>;

  /**
   * Deletes all ModelItems matching the SQL query condition.
   * @returns A Promise that resolves when all matching ModelItems are deleted.
   */
  delete(): Promise<void>;
}

/**
 * Represents an item from a model.
 * @class ModelItem
 */
export declare class ModelItem {
  /**
   * Creates a new ModelItem instance.
   * @param model - The model associated with the item.
   * @param data - The data object representing the item's attributes (optional).
   * @param belongs - An object containing the related models that the item belongs to (optional).
   * @param newlyCreated - A boolean indicating if the item is newly created (optional).
   */
  constructor(
    model: Model,
    data?: Partial<Model>,
    belongs?: any,
    newlyCreated?: boolean
  );

  /**
   * The data object representing the item's attributes.
   */
  data: Partial<Model>;

  /**
   * Retrieves the value of a specific attribute from the item.
   * @param key - The name of the attribute to retrieve.
   * @returns The value of the attribute.
   */
  readonly [key: string]: any;

  /**
   * Returns a JSON string representation of the item's data.
   * @returns The JSON string representing the item's data.
   */
  toString(): string;

  /**
   * Establishes a "has many" relationship between the current item and a related model.
   * @param model - The related model to establish the relationship with.
   * @param hisKey - The foreign key in the related model (optional).
   * @param myKey - The local key in the current model (optional).
   * @returns A Collection of ModelItems representing the related model's items that belong to the current item.
   */
  hasMany(model: Model, hisKey?: string, myKey?: string): Collection;

  /**
   * Establishes a "belongs to" relationship between the current item and a related model.
   * @param model - The related model to establish the relationship with.
   * @param myKey - The local key in the current model (optional).
   * @param hisKey - The foreign key in the related model (optional).
   * @returns A ModelItem representing the related model's item that the current item belongs to.
   */
  belongsTo(
    model: Model,
    myKey?: string,
    hisKey?: string
  ): ModelItem | undefined;

  /**
   * Saves the changes made to the item's data to the database.
   * @returns A Promise that resolves to the result of the save operation.
   */
  save(): Promise<any>;

  /**
   * Deletes the item from the database.
   * @returns A Promise that resolves to the result of the delete operation.
   */
  delete(): Promise<any>;
}

/**
 * The base class to easily access your database.
 * @class Model
 */
export declare class Model {
  /**
   * Define a custom table for the model.
   *
   * If left `undefined`, the model will infer the table name from the class name.
   * For example, `Test` will map to `tests`, `Category` to `categories`, and so on.
   */
  static table: string | undefined;

  /**
   * Define the columns for your table.
   *
   * When left empty, the model will retrieve the columns from the database.
   */
  static columns: string[];

  /**
   * Prevent specified columns from being defined from the database.
   *
   * This property works only if the `columns` array is empty.
   */
  static guarded: string[];

  static attributes: string[];

  /**
   * Define the primary key for the table.
   *
   * Auto-set of this property works only if the `columns` array is empty.
   */
  static primary: string | undefined;

  /**
   * Indicates whether the model has been initialized.
   */
  static initilazed: boolean;

  /**
   * The database driver used for database interactions.
   */
  static dbdriver: any;

  /**
   * Initializes model dependencies.
   * @param connection - The database connection or a driver instance.
   * @param models - Optional model classes that depend on the current model.
   * @returns A Promise that resolves when the model is successfully initialized.
   */
  static init(
    connection: typeof DBDriver | Object,
    ...models: (new () => Model)[]
  ): Promise<void>;

  /**
   * Retrieves all items of the model from the database.
   * @returns A Promise that resolves to a Collection of ModelItems representing all items of the model.
   */
  static all(): Promise<Collection>;

  /**
   * Creates a new ModelItem with the specified template data.
   * @param template - The template data for the new item.
   * @returns A new ModelItem representing the newly created item.
   */
  static create(template?: Partial<Model>): ModelItem;

  /**
   * Finds a specific item of the model by its primary key value.
   * @param x - The value of the primary key.
   * @returns A Promise that resolves to the ModelItem representing the found item, or undefined if not found.
   */
  static find(x: any): Promise<ModelItem | undefined>;

  /**
   * Constructs a SQLBuilder instance for querying items based on the primary key.
   * @param x - The value of the primary key to use in the WHERE condition.
   * @returns A SQLBuilder instance with the WHERE condition set to the primary key value.
   */
  static wherePrimary(x: any): SQLBuilder;

  /**
   * Constructs a SQLBuilder instance for creating a new query.
   * @returns A SQLBuilder instance.
   */
  static query(): SQLBuilder;

  /**
   * Constructs a SQLBuilder instance with a WHERE condition for the query.
   * @param key - The column name or expression to filter on.
   * @param valueOrSep - The value to compare with or the operator to use in the comparison.
   * @param value - The value to compare with (optional if valueOrSep is the operator).
   * @returns A SQLBuilder instance with the WHERE condition set.
   */
  static where(key: string, valueOrSep: string, value?: any): SQLBuilder;

  /**
   * Iterates over each item of the model returned by the SQL query and applies the provided callback function to each item.
   * @param cb - The callback function to apply to each ModelItem.
   * @returns A Promise that resolves to a boolean indicating whether all iterations were successful (true) or not (false).
   */
  static each(
    cb: (item: ModelItem, index: number) => Promise<boolean> | boolean
  ): Promise<boolean>;

  /**
   * Retrieves the last item of the model from the database.
   * @returns A Promise that resolves to the last ModelItem of the model, or undefined if the model is empty.
   */
  static last(): Promise<ModelItem | undefined>;

  /**
   * Retrieves the first item of the model from the database.
   * @returns A Promise that resolves to the first ModelItem of the model, or undefined if the model is empty.
   */
  static first(): Promise<ModelItem | undefined>;

  /**
   * Constructs a SQLBuilder instance with a WHERE expression for the query.
   * @param key - The column name or expression to filter on.
   * @param valueOrSep - The value to compare with or the operator to use in the comparison.
   * @param value - The value to compare with (optional if valueOrSep is the operator).
   * @returns A SQLBuilder instance with the WHERE expression set.
   */
  static whereExpression(
    key: string,
    valueOrSep: string,
    value?: any
  ): SQLBuilder;
}

// Exporting the database driver classes
export { MySQLDBDriver, SQLiteDBDriver, RawFunctionDBDriver, DBDriver };
