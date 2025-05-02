/**
 * @fileoverview General helper functions.
 */

export function debugLog(...args) {
    if((process.env["NodeORM_DEBUG"] || false) == true) {
        console.log(...args);
    }
}

export function debugWarn(...args) {
    if((process.env["NodeORM_DEBUG"] || true) == true) {
        console.log(...args);
    }
}

/**
 * Checks if a value is a plain object.
 * @param {*} value The value to check.
 * @returns {boolean} True if the value is a plain object.
 */
export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp);
}

/**
 * Checks if a value is empty (null, undefined, empty string, empty array, empty object).
 * @param {*} value The value to check.
 * @returns {boolean} True if the value is empty.
 */
export function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (isObject(value) && Object.keys(value).length === 0) return true;
    return false;
}

/**
 * Clones a value deeply. Handles plain objects, arrays, dates, and primitives.
 * Does not handle complex objects like functions, Maps, Sets, etc. perfectly.
 * @param {*} value The value to clone.
 * @returns {*} The deeply cloned value.
 */
export function deepClone(value) {
    if (typeof value !== 'object' || value === null) {
        return value; // Primitives or null
    }

    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    if (Array.isArray(value)) {
        return value.map(item => deepClone(item));
    }

    if (isObject(value)) {
        const clone = {};
        for (const key in value) {
            // eslint-disable-next-line no-prototype-builtins
            if (value.hasOwnProperty(key)) {
                clone[key] = deepClone(value[key]);
            }
        }
        return clone;
    }

    // For unsupported types, return the original value
    return value;
}

/**
 * Gets the class name of an object or function.
 * @param {object | Function} target The target object or constructor.
 * @returns {string} The class name.
 */
export function getClassName(target) {
    if (target && target.constructor && target.constructor.name !== 'Object') {
        return target.constructor.name;
    }
    if (typeof target === 'function' && target.name) {
        return target.name;
    }
    return 'Object';
}

export async function tryToImport(moduleName) {
    try {
        return await import(moduleName);
    } catch (error) {
        return null;
    }
}