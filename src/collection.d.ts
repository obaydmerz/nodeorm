// ./collection.d.ts

import { Model } from "../index.js";

/**
 * A collection of ModelItem objects.
 */
export declare class Collection {
  /**
   * Creates a new Collection instance.
   * @param arrayOfObjects - An array of ModelItem objects to populate the collection.
   * @param options - Additional options for the collection.
   */
  constructor(
    arrayOfObjects?: ModelItem[],
    options?: {
      /**
       * The template for creating new ModelItem objects in the collection.
       */
      newCreationTemplate?: Record<string, any>;
      /**
       * The model class used for creating new ModelItem objects.
       */
      createModel?: new () => Model;
    }
  );

  /**
   * Returns the number of ModelItem objects in the collection.
   * @returns The number of items in the collection.
   */
  count(): number;

  /**
   * Creates a new ModelItem object using the specified template and adds it to the collection.
   * @param template - The template for creating the new ModelItem object.
   * @returns The newly created ModelItem object.
   */
  create(template?: Record<string, any>): ModelItem;

  /**
   * Converts the collection to an array of ModelItem objects or extracts a specific column's values from the items.
   * @param column - The name of the column to extract values from (optional).
   * @returns An array of ModelItem objects if no column is provided, or an array of column values if a column is specified.
   */
  toArray(column?: string): ModelItem[] | any[];

  /**
   * Adds one or more ModelItem objects to the collection.
   * @param results - The ModelItem objects to add to the collection.
   */
  push(...results: ModelItem[]): void;

  /**
   * Converts the collection to an object with the specified column's values as keys and the ModelItem objects as values.
   * @param column - The name of the column to use as keys for the object.
   * @returns An object with column values as keys and corresponding ModelItem objects as values.
   */
  toObject(column: string): Record<any, ModelItem>;

  /**
   * Returns the last ModelItem object in the collection.
   * @param modIndex - The index modifier for getting an item relative to the last item (optional, default is 0).
   * @returns The last ModelItem object in the collection, or undefined if the collection is empty.
   */
  last(modIndex?: number): ModelItem | undefined;

  /**
   * Returns the value of the specified column from the last ModelItem object in the collection.
   * @param column - The name of the column to retrieve the value from (optional, default is 'id').
   * @param modIndex - The index modifier for getting a value relative to the last item (optional, default is 0).
   * @returns The value of the specified column from the last ModelItem object, or undefined if the collection is empty.
   */
  lasts(column?: string, modIndex?: number): any | undefined;

  /**
   * Returns the first ModelItem object in the collection.
   * @param modIndex - The index modifier for getting an item relative to the first item (optional, default is 0).
   * @returns The first ModelItem object in the collection, or undefined if the collection is empty.
   */
  first(modIndex?: number): ModelItem | undefined;

  /**
   * Returns the value of the specified column from the first ModelItem object in the collection.
   * @param column - The name of the column to retrieve the value from (optional, default is 'id').
   * @param modIndex - The index modifier for getting a value relative to the first item (optional, default is 0).
   * @returns The value of the specified column from the first ModelItem object, or undefined if the collection is empty.
   */
  firsts(column?: string, modIndex?: number): any | undefined;

  /**
   * Iterates through each ModelItem object in the collection and executes the specified callback function.
   * @param callback - The callback function to execute for each ModelItem object.
   * @returns A Promise that resolves to true if all callbacks return truthy values, or false otherwise.
   */
  each(
    callback: (item: ModelItem, index: number) => Promise<any> | any
  ): Promise<boolean>;

  /**
   * Deletes all ModelItem objects in the collection by calling their `delete()` method.
   */
  delete(): Promise<void>;
}
