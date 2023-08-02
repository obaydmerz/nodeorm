/**
 * Custom Error class for representing an error when data is empty.
 */
export declare class EmptyDataError extends Error {
  /**
   * The name of the error (set to "EmptyDataError").
   */
  name: string;
  /**
   * The error code associated with the error (optional).
   */
  code: string;
  /**
   * Creates a new instance of the EmptyDataError class.
   * @param message - The error message.
   * @param code - The error code (optional).
   */
  constructor(message: string, code?: string);
}

/**
 * Custom Error class for representing an error when the state does not match.
 */
export declare class UnmatchingStateError extends Error {
  /**
   * The name of the error (set to "UnmatchingStateError").
   */
  name: string;
  /**
   * The error code associated with the error (optional).
   */
  code: string;
  /**
   * Creates a new instance of the UnmatchingStateError class.
   * @param message - The error message.
   * @param code - The error code (optional).
   */
  constructor(message: string, code?: string);
}

/**
 * Throws an error if the specified condition is true or undefined.
 * @param err - The error object or error configuration.
 * @param condition - The condition to check (optional).
 * @throws The specified error or a new Error instance based on the error configuration.
 */
export declare function fire(
  err:
    | Error
    | {
        /**
         * The error message.
         */
        message: string;
        /**
         * The error code (optional).
         */
        code?: string;
        /**
         * The error class to use (optional, defaults to Error).
         */
        error?: new (message?: string) => Error;
      },
  condition?: boolean | undefined
): void;

/**
 * Object containing predefined error configurations.
 */
export declare const errors: {
  /**
   * Error configuration for an uninitilazed Model.
   */
  uninitilazedModel: {
    /**
     * The error message.
     */
    message: string;
    /**
     * The error code ("uninitilazedModel").
     */
    code: string;
    /**
     * The error class to use (UnmatchingStateError).
     */
    error: new (message?: string) => Error;
  };
};
