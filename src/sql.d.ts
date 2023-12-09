import { Model, ModelItem } from "./model.js";
import { Collection } from "./collection.js";

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
   * Retrieves the last ModelItem from the SQL query result, or creates it.
   * @returns A Promise that resolves to the last ModelItem from the query result, or a new one if not found.
   */
  lastOrCreate(): Promise<ModelItem>;

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
