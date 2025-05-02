/**
 * @fileoverview Main entry point for the NodeORM library.
 * Exports core classes, utilities, and error types.
 * @version 0.1.0
 */

import { Connection } from "./connection/Connection.js";

import {
  ConnectionManager,
} from "./connection/ConnectionManager.js";

import { Model } from "./model/Model.js";

import { raw } from "./query/Expression.js";

import * as errors from "./errors.js";
import { init, initialize, Manager } from "./singleton.js";


export {
  Connection,
  initialize,
  init,
  ConnectionManager,
  Manager,
  Model,
  
  raw,
  errors,
};
