import { DBDriver, NodeORM } from "../index.js";
import { MySQLDBDriver, SQLiteDBDriver } from "./multisupport.js";

export async function readEnv() {
  if (
    typeof process.env["DB_CONNECTION"] !== "string" ||
    process.env["DB_CONNECTION"].length == 0
  ) {
    throw new Error(
      "When using env, the 'DB_CONNECTION' variable must be a non-empty string!"
    );
  }

  const dbConnection = process.env["DB_CONNECTION"].toLowerCase();

  for (const dbdriver in NodeORM.dbdrivers) {
    if (!(dbdriver.prototype instanceof DBDriver)) continue;
    if (!(dbdriver.envType == dbConnection)) continue;
    if (!(typeof dbdriver.extractFromEnv != "function")) continue;

    return await dbdriver.from(dbdriver.extractFromEnv());
  }

  throw new Error(`Unsupported database type: ${dbConnection}`);
}

export function checkPropsOf(obj, ...props) {
  if (typeof obj !== "object") return false;
  for (const prop of props) {
    if (!obj.hasOwnProperty(prop)) return false;
  }
  return true;
}

/**
 * Generates a list from strings
 */
export function generateValueSep(
  array,
  extra = { stringChar: undefined },
  unempty = ""
) {
  if (!Array.isArray(array)) return "";

  let res = "";
  for (let i = 0; i < array.length; i++) {
    const iterator = array[i];
    if (typeof iterator === "string" && iterator.startsWith("@")) {
      res += iterator.substring(1);
    } else {
      res += encodeSQLValue(iterator, extra);
    }
    if (i < array.length - 1) res += ", ";
  }
  if (res.length === 0) {
    res = unempty;
  }
  return res;
}

export function normalize(str) {
  return str.replace(/\'/gm, "\\'");
}

/**
 * Encodes a value into a processable sql value
 */
export function encodeSQLValue(x, { stringChar = undefined } = {}) {
  switch (typeof x) {
    case "boolean":
      return x ? "true" : "false";
    case "number":
    case "bigint":
      return isNaN(x) ? '"NaN"' : String(x);
    case "string":
    case "symbol":
      stringChar = stringChar == undefined ? "'" : stringChar;
      return stringChar + normalize(x) + stringChar;
    case "object":
      return x === null ? "null" : "'" + JSON.stringify(x) + "'";
    case "undefined":
      return "undefined";
    case "function":
      return "< FUNCTION >";
    default:
      return String(x);
  }
}

/**
 * Generate key = value pairs from objects
 * Use keys that starts with `%` to choose the delemiter between key and value;
 *
 * Ex:
 *  `{"key": "value", "%key": ">"}` may return `key > value`.
 * If a delimiter ends with a `@` it's value won't be treated nor processed.
 *
 * @param {Object} obj
 * @returns {string}
 */
export function genPairsFromObj(obj, sep = ", ") {
  if (typeof obj !== "object") return "";

  let res = "";
  const keys = Object.keys(obj);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (key.startsWith("%")) continue;

    const element = obj[key];
    const exp = obj["%" + key] ? obj["%" + key] : "=";
    const isPureExpression = exp.endsWith("@");

    res += `${key} ${isPureExpression ? exp.slice(0, -1) : exp} ${
      isPureExpression ? element : encodeSQLValue(element)
    }`;
    if (i < keys.length - 2) res += sep;
  }

  return res;
}

/**
 * If `cond` content is valuable -> return data
 *
 * Else -> return ""
 */
export function conditionOrNothing(data, cond) {
  if (typeof cond === "object") {
    if (Array.isArray(cond) && cond.length === 0) return "";
    if (cond === null || Object.keys(cond).length === 0) return "";
  }

  if (typeof cond === "string" && cond.trim() === "") return "";

  if (typeof cond === "undefined") return "";

  if (typeof cond === "number" && cond <= 0 && !isNaN(cond)) return "";

  if (typeof cond === "boolean" && !cond) return "";

  return data;
}

/**
 * Only return objects items that their keys included in mask.
 */
export function maskObject(object, mask) {
  const nObject = {};
  for (const key of mask) {
    if (Object.hasOwnProperty.call(object, key)) {
      nObject[key] = object[key];
    }
  }
  return nObject;
}

/**
 * Ensure thats a function.
 *
 * To prevent errors.
 */
export function applyFunction(fn, ...args) {
  if (typeof fn == "function") {
    return fn(...args);
  }

  return undefined;
}

Array.prototype.carePush = function (...x) {
  for (const y of x) {
    if (!this.includes(y)) this.push(y);
  }
};

String.prototype.toPlural = function () {
  if (this.endsWith("y")) {
    return this.slice(0, -1) + "ies";
  }
  if (this.endsWith("s")) {
    return this + "es";
  }
  return this + "s";
};

String.prototype.toSingular = function () {
  if (this.endsWith("ies")) {
    return this.slice(0, -3) + "y";
  }
  if (this.endsWith("es")) {
    return this.slice(0, -2);
  }
  if (this.endsWith("s")) {
    return this.slice(0, -1);
  }
  return this;
};
