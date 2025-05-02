/**
 * @fileoverview Date formatting and parsing utilities.
 */

/**
 * Formats a Date object into a string suitable for SQL DATETIME/TIMESTAMP.
 * Defaults to ISO 8601 format suitable for most databases.
 * @param {Date | number | string} date The date to format.
 * @returns {string | null} The formatted date string (YYYY-MM-DD HH:mm:ss.sss) or null if input is invalid.
 */
export function formatDateForDb(date) {
    if (!date) return null;

    let d;
    if (date instanceof Date) {
        d = date;
    } else {
        try {
            d = new Date(date);
            if (isNaN(d.getTime())) { // Check if date is valid
                return null;
            }
        } catch (e) {
            return null;
        }
    }

    // Pad single digits with leading zero
    const pad = (num) => num.toString().padStart(2, '0');
    const padMillis = (num) => num.toString().padStart(3, '0');

    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    const milliseconds = padMillis(d.getMilliseconds());

    // Format: YYYY-MM-DD HH:mm:ss.sss (Standard compatible format)
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}


/**
 * Parses a date value received from the database into a Date object.
 * Handles various common database date string formats and potential numbers (timestamps).
 * @param {string | number | Date | null | undefined} value The value from the database.
 * @returns {Date | null} The parsed Date object, or null if parsing fails or input is null/undefined.
 */
export function parseDateFromDb(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Date) {
        return !isNaN(value.getTime()) ? value : null;
    }
    try {
        // Attempt to parse common formats, including ISO-like strings from formatDateForDb
        const date = new Date(value);
        // Check if the parsed date is valid
        if (!isNaN(date.getTime())) {
            return date;
        }
    } catch (e) {
        // Ignore parsing errors initially
    }

    // Could add more robust parsing for specific formats if needed here

    return null; // Return null if parsing failed
}