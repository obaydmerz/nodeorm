import { Model } from "../index.js";

/**
 * Represents a collection of Model items.
 * @class Collection
 */
export declare class Collection {
  #arr: Model[];
  #conf: {
    newCreationTemplate?: any;
    createModel?: typeof Model | undefined;
  };

  /**
   * Creates a new Collection instance.
   * @param arrayOfObjects - An array of Model instances.
   * @param options - Additional options for collection configuration.
   */
  constructor(
    arrayOfObjects: Model[],
    options?: {
      newCreationTemplate?: any;
      createModel?: typeof Model | undefined;
    }
  );

  /**
   * Returns the number of items in the collection.
   * @returns The number of items in the collection.
   */
  count(): number;

  /**
   * Creates a new Model item using the collection's createModel and newCreationTemplate.
   * @param template - Template data for the new item.
   * @returns A new Model item.
   */
  create(template?: any): Model;

  /**
   * Converts the collection to an array.
   * @param column - Optional column name to extract from each item in the collection.
   * @returns An array representation of the collection.
   */
  toArray(column?: string): Model[] | any[];

  /**
   * Adds new items to the end of the collection.
   * @param results - Items to add to the collection.
   */
  push(...results: Model[]): void;

  /**
   * Converts the collection to an object with keys based on the specified column.
   * @param column - The column name to use as keys in the resulting object.
   * @returns An object representation of the collection.
   */
  toObject(column: string): { [key: string]: Model };

  /**
   * Retrieves the last item from the collection.
   * @param modIndex - Optional index modifier for getting an item relative to the last item (default is 0).
   * @returns The last item from the collection or undefined if the collection is empty.
   */
  last(modIndex?: number): Model | undefined;

  /**
   * Retrieves the first item from the collection.
   * @param modIndex - Optional index modifier for getting an item relative to the first item (default is 0).
   * @returns The first item from the collection or undefined if the collection is empty.
   */
  first(modIndex?: number): Model | undefined;

  /**
   * Iterates over each item in the collection and applies the provided callback function to each item.
   * @param callback - The callback function to apply to each item.
   * @returns A Promise that resolves to a boolean indicating whether all iterations were successful (true) or not (false).
   */
  each(
    callback?: (item: Model, index: number) => Promise<boolean> | boolean
  ): Promise<boolean>;

  /**
   * Deletes all items in the collection from the database.
   * @returns A Promise that resolves when all items are deleted.
   */
  delete(): Promise<void>;
}
