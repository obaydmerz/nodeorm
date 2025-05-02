/**
 * @fileoverview String manipulation utilities.
 */

/**
 * Simple pluralization (add 's'). Doesn't handle irregulars.
 * @param {string} word The word to pluralize.
 * @returns {string} The pluralized word.
 */
export function pluralize(word) {
    if (!word || word.length === 0) return '';
    // Very basic pluralization
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('ch') || word.endsWith('sh')) {
        return word + 'es';
    }
    if (word.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(word[word.length - 2]?.toLowerCase())) {
        return word.slice(0, -1) + 'ies';
    }
    return word + 's';
}

/**
 * Simple singularization (remove 's'). Doesn't handle irregulars well.
 * @param {string} word The word to singularize.
 * @returns {string} The singularized word.
 */
export function singularize(word) {
     if (!word || word.length === 0) return '';
     // Very basic singularization
     if (word.endsWith('ies') && word.length > 3) {
         return word.slice(0, -3) + 'y';
     }
     if (word.endsWith('es') && word.length > 2 && (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('ches') || word.endsWith('shes'))) {
        return word.slice(0, -2);
     }
     if (word.endsWith('s') && word.length > 1 && !word.endsWith('ss') && word[word.length - 2] !== 'u') { // Avoid 'bus', 'status' etc.
         return word.slice(0, -1);
     }
     return word;
}


/**
 * Converts a string to snake_case.
 * @param {string} str The input string (e.g., camelCase or PascalCase).
 * @returns {string} The snake_case string.
 */
export function snakeCase(str) {
    if (!str) return '';
    return String(str)
        .replace(/^[\W_]+|[\W_]+$|([\W_]+)/g, ($0, $1) => $1 ? '_' : '') // Replace non-alphanumeric with _
        .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase to snake_case
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2') // Handle acronyms like APIClient -> API_Client
        .toLowerCase();
}

/**
 * Converts a string to StudlyCase (PascalCase).
 * @param {string} str The input string (e.g., snake_case).
 * @returns {string} The StudlyCase string.
 */
export function studlyCase(str) {
    if (!str) return '';
    const words = String(str).split(/[\W_]+/); // Split by non-alphanumeric and underscore
    return words
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

/**
 * Converts a string to camelCase.
 * @param {string} str The input string.
 * @returns {string} The camelCase string.
 */
export function camelCase(str) {
    const studly = studlyCase(str);
    return studly.charAt(0).toLowerCase() + studly.slice(1);
}