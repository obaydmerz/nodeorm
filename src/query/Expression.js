/**
 * @fileoverview Represents a raw SQL expression that shouldn't be bound as a parameter.
 */

/**
 * Represents a raw SQL expression.
 * Values wrapped in this class will be inserted directly into the SQL query
 * string instead of being treated as bound parameters. Use with caution to avoid SQL injection.
 */
export class Expression {
    /** @type {string} */
    #value;

    /**
     * @param {string} value The raw SQL string segment.
     */
    constructor(value) {
        this.#value = String(value);
    }

    /**
     * Gets the raw SQL value.
     * @returns {string}
     */
    getValue() {
        return this.#value;
    }

    /**
     * Returns the raw SQL value when converted to string.
     * @returns {string}
     */
    toString() {
        return this.#value;
    }
}

/**
 * Factory function to create a new raw SQL Expression.
 * Example: `where('column', '=', raw('NOW()'))`
 * @param {string} value The raw SQL string segment.
 * @returns {Expression}
 */
export function raw(value) {
    return new Expression(value);
}