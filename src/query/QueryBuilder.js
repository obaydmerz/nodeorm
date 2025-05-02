/**
 * @fileoverview Fluent query builder for constructing SQL queries.
 */
import { Expression, raw } from "./Expression.js";
import { ModelNotFoundError, QueryError, RelationError } from "../errors.js";
import { Relation } from "../relations/Relation.js"; // Base class for type checking
import { camelCase, studlyCase } from "../utils/string.js";
import { debugLog, debugWarn } from "../utils/helpers.js";

/**
 * @typedef {import('../connection/Connection.js').Connection} Connection
 * @typedef {typeof import('../model/Model.js').Model} ModelStatic
 * @typedef {import('../drivers/BaseGrammar.js').BaseGrammar} BaseGrammar
 */

const BINDING_TYPES = [
  "select",
  "from",
  "join",
  "where",
  "group",
  "having",
  "order",
  "union",
];

/**
 * Fluent interface for building and executing SQL queries.
 */
export class QueryBuilder {
  /** @type {Connection} */
  _connection;
  /** @type {BaseGrammar} */
  _grammar;
  /** @type {ModelStatic | null} */
  _model = null;

  // Query Components
  /** @type {Array<string | Expression>} */
  _selects = [];
  /** @type {boolean} */
  _distinct = false;
  /** @type {string | Expression | null} */
  _from = null;
  /** @type {Array<object>} */
  _joins = [];
  /** @type {Array<object>} */
  _wheres = [];
  /** @type {Array<string | Expression>} */
  _groups = [];
  /** @type {Array<object>} */
  _havings = [];
  /** @type {Array<object>} */
  _orders = [];
  /** @type {number | null} */
  _limit = null;
  /** @type {number | null} */
  _offset = null;
  /** @type {Array<object>} */
  _unions = [];
  /** @type {Record<string, any[]>} */
  _bindings = {};
  /** @type {string[]} */
  _scopes = [];
  /** @type {boolean} */
  strictMode = true;
  /** @type {Record<string, any>} */
  _truncateOptions = {};
  /** @type {Record<string, Relation>} */
  _eagerLoad = {};
  /** @type {Set<string>} Set of global scopes removed for this query instance */
  _removedGlobalScopes = new Set();

  /**
   * @param {Connection} connection The database connection instance.
   * @param {ModelStatic} [model] Optional associated Model class for hydration.
   */
  constructor(connection, model = null) {
    this._connection = connection;
    this._grammar = connection.getDriver().getGrammar();
    this._model = model;
    if (model) {
      this.from(model.getTableName());
      this._applyGlobalScopes(); // Apply global scopes if model is set
    }
    this._clearBindings();

    // Use Proxy for dynamic methods
    //const specialWheres = ["wherein", "whereraw"];

    // TODO: fix proxy
    /* return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "string") {
          if (prop === "then") {
            // Handle promise awaiting
            return (...args) => target.get().then(...args);
          }
          if (!specialWheres.includes(prop.toLowerCase()) && prop.startsWith("where") && prop.length > 5) {
            // Dynamic whereFieldName
            const field = camelCase(prop.substring(5));
            if (field)
              return (value, operator = "=") =>
                target.where(field, operator, value);
          }
          if (!specialWheres.includes("or" + prop.toLowerCase()) && prop.length > 7) {
            // Dynamic orWhereFieldName
            const field = camelCase(prop.substring(7));
            if (field)
              return (value, operator = "=") =>
                target.orWhere(field, operator, value);
          }
          if (
            target._model &&
            typeof target[prop] !== "function" &&
            !Reflect.has(target, prop)
          ) {
            // Dynamic scope methods
            const scopeMethodName = `scope${studlyCase(prop)}`;
            if (typeof target._model[scopeMethodName] === "function") {
              return (...args) => target.scope(prop, ...args);
            }
          }
        }
        // Default behavior for own properties and methods
        return Reflect.get(target, prop, receiver);
      },
    }); */
  }

  newInstance() {
    return new QueryBuilder(this._connection, this._model);
  }

  _clearBindings() {
    BINDING_TYPES.forEach((type) => (this._bindings[type] = []));
  }

  addBinding(value, type = "where") {
    if (!BINDING_TYPES.includes(type))
      throw new QueryError(`Invalid binding type: ${type}`);
    const formattedValue = this._grammar.formatBinding(value);
    this._bindings[type].push(formattedValue);
    return BINDING_TYPES.reduce(
      (sum, t) => sum + (this._bindings[t]?.length || 0),
      0
    );
  }

  getBindings() {
    const orderedBindings = [
      ...this._bindings.select,
      ...this._bindings.join,
      ...this._bindings.where,
      ...this._bindings.having,
      ...this._bindings.union,
    ];
    return orderedBindings.flat();
  }
  getRawBindings() {
    return this._bindings;
  }

  select(...columns) {
    this._selects =
      columns.length > 0
        ? columns.map((c) =>
            typeof c === "string" && c.includes("(") ? raw(c) : c
          )
        : ["*"];
    this._bindings.select = [];
    return this;
  }
  addSelect(...columns) {
    if (
      this._selects.length === 1 &&
      (this._selects[0] === "*" ||
        (this._selects[0] instanceof Expression &&
          this._selects[0].getValue().trim() === "*"))
    ) {
      this._selects = []; // Start fresh if was '*'
    }
    this._selects.push(
      ...columns.map((c) =>
        typeof c === "string" && c.includes("(") ? raw(c) : c
      )
    );
    return this;
  }
  distinct(value = true) {
    this._distinct = value;
    return this;
  }
  from(table, as = null) {
    this._from = as
      ? raw(
          `${this._grammar.wrapTable(table)} AS ${this._grammar.wrapTable(as)}`
        )
      : table;
    return this;
  }

  where(column, operator, value, boolean = "and") {
    if (
      typeof column === "object" &&
      column !== null &&
      !(column instanceof Expression)
    ) {
      Object.entries(column).forEach(([key, val]) =>
        this.where(key, "=", val, boolean)
      );
      return this;
    }
    if (typeof column === "function") {
      const nestedQuery = this.newInstance();
      column(nestedQuery);
      this._wheres.push({ type: "Nested", query: nestedQuery, boolean });
      this._mergeBindings(nestedQuery);
      return this;
    }
    if (
      arguments.length === 2 ||
      (arguments.length === 3 &&
        typeof value === "string" &&
        boolean === "and" &&
        !this._grammar._operators.includes(String(operator).toLowerCase()))
    ) {
      [value, operator] = [operator, "="];
    }
    if (column instanceof Expression) {
      this._wheres.push({ type: "Raw", sql: column.getValue(), boolean });
      return this;
    }
    this._wheres.push({ type: "Basic", column, operator, value, boolean });
    if (!(value instanceof Expression)) this.addBinding(value, "where");
    return this;
  }

  orWhere(column, operator, value) {
    if (
      arguments.length === 2 ||
      (arguments.length === 3 &&
        typeof value === "string" &&
        !this._grammar._operators.includes(String(operator).toLowerCase()))
    ) {
      [value, operator] = [operator, "="];
    }
    return this.where(column, operator, value, "or");
  }

  whereColumn(first, operator, second, boolean = "and") {
    if (second === undefined) [second, operator] = [operator, "="];
    this._wheres.push({ type: "Column", first, operator, second, boolean });
    return this;
  }
  orWhereColumn(first, operator, second) {
    return this.whereColumn(first, operator, second, "or");
  }

  whereIn(column, values, boolean = "and", not = false) {
    const actualValues = Array.isArray(values) ? values : [values];
    this._wheres.push({
      type: "In",
      column,
      values: actualValues,
      boolean,
      not,
    });
    actualValues.forEach((val) => this.addBinding(val, "where"));
    return this;
  }
  orWhereIn(column, values) {
    return this.whereIn(column, values, "or");
  }
  whereNotIn(column, values, boolean = "and") {
    return this.whereIn(column, values, boolean, true);
  }
  orWhereNotIn(column, values) {
    return this.whereIn(column, values, "or", true);
  }

  whereNull(column, boolean = "and", not = false) {
    this._wheres.push({ type: "Null", column, boolean, not });
    return this;
  }
  orWhereNull(column) {
    return this.whereNull(column, "or");
  }
  whereNotNull(column, boolean = "and") {
    return this.whereNull(column, boolean, true);
  }
  orWhereNotNull(column) {
    return this.whereNull(column, "or", true);
  }

  whereBetween(column, values, boolean = "and", not = false) {
    if (!Array.isArray(values) || values.length !== 2)
      throw new QueryError(
        "whereBetween requires an array with exactly two values."
      );
    this._wheres.push({ type: "Between", column, values, boolean, not });
    this.addBinding(values[0], "where");
    this.addBinding(values[1], "where");
    return this;
  }
  orWhereBetween(column, values) {
    return this.whereBetween(column, values, "or");
  }
  whereNotBetween(column, values, boolean = "and") {
    return this.whereBetween(column, values, boolean, true);
  }
  orWhereNotBetween(column, values) {
    return this.whereBetween(column, values, "or", true);
  }

  _addWhereDate(type, column, operator, value, boolean = "and") {
    if (value === undefined) [value, operator] = [operator, "="];
    this._wheres.push({ type, column, operator, value, boolean });
    this.addBinding(value, "where");
    return this;
  }
  whereDate(column, operator, value, boolean = "and") {
    return this._addWhereDate("Date", column, operator, value, boolean);
  }
  orWhereDate(column, operator, value) {
    return this.whereDate(column, operator, value, "or");
  }
  whereYear(column, operator, value, boolean = "and") {
    return this._addWhereDate("Year", column, operator, value, boolean);
  }
  orWhereYear(column, operator, value) {
    return this.whereYear(column, operator, value, "or");
  }
  whereMonth(column, operator, value, boolean = "and") {
    return this._addWhereDate("Month", column, operator, value, boolean);
  }
  orWhereMonth(column, operator, value) {
    return this.whereMonth(column, operator, value, "or");
  }
  whereDay(column, operator, value, boolean = "and") {
    return this._addWhereDate("Day", column, operator, value, boolean);
  }
  orWhereDay(column, operator, value) {
    return this.whereDay(column, operator, value, "or");
  }
  whereTime(column, operator, value, boolean = "and") {
    return this._addWhereDate("Time", column, operator, value, boolean);
  }
  orWhereTime(column, operator, value) {
    return this.whereTime(column, operator, value, "or");
  }

  whereExists(callback, boolean = "and", not = false) {
    const subQuery = this.newInstance();
    callback(subQuery);
    this._wheres.push({ type: "Exists", query: subQuery, boolean, not });
    this._mergeBindings(subQuery);
    return this;
  }
  orWhereExists(callback, not = false) {
    return this.whereExists(callback, "or", not);
  }
  whereNotExists(callback, boolean = "and") {
    return this.whereExists(callback, boolean, true);
  }
  orWhereNotExists(callback) {
    return this.whereExists(callback, "or", true);
  }

  whereRaw(sql, bindings = [], boolean = "and") {
    this._wheres.push({ type: "Raw", sql, boolean });
    bindings.forEach((b) => this.addBinding(b, "where"));
    return this;
  }
  orWhereRaw(sql, bindings = []) {
    return this.whereRaw(sql, bindings, "or");
  }

  join(table, first, operator, second, type = "inner") {
    const joinBuilder = new QueryBuilder(this._connection);
    joinBuilder._from = table;
    if (typeof first === "function") {
      first(joinBuilder);
    } else {
      if (second === undefined) [second, operator] = [operator, "="];
      joinBuilder.on(first, operator, second);
    }
    this._joins.push({ type, table, clauses: joinBuilder._wheres });
    this._mergeBindings(joinBuilder, "join");
    return this;
  }
  leftJoin(table, first, operator, second) {
    return this.join(table, first, operator, second, "left");
  }
  rightJoin(table, first, operator, second) {
    return this.join(table, first, operator, second, "right");
  }
  crossJoin(table) {
    return this.join(table, null, null, null, "cross");
  }

  on(first, operator, second, boolean = "and") {
    if (second === undefined) [second, operator] = [operator, "="];
    this._wheres.push({ type: "Column", first, operator, second, boolean });
    return this;
  }
  orOn(first, operator, second) {
    return this.on(first, operator, second, "or");
  }

  groupBy(...columns) {
    this._groups.push(...columns);
    return this;
  }

  having(column, operator, value, boolean = "and") {
    if (typeof column === "function") {
      const nestedQuery = this.newInstance();
      column(nestedQuery);
      this._havings.push({ type: "Nested", query: nestedQuery, boolean });
      this._mergeBindings(nestedQuery, "having");
      return this;
    }
    if (column instanceof Expression) {
      this._havings.push({ type: "Raw", sql: column.getValue(), boolean });
      return this;
    }
    if (arguments.length === 2) [value, operator] = [operator, "="];
    this._havings.push({ type: "Basic", column, operator, value, boolean });
    if (!(value instanceof Expression)) this.addBinding(value, "having");
    return this;
  }
  orHaving(column, operator, value) {
    return this.having(column, operator, value, "or");
  }
  havingRaw(sql, bindings = [], boolean = "and") {
    this._havings.push({ type: "Raw", sql, boolean });
    bindings.forEach((b) => this.addBinding(b, "having"));
    return this;
  }
  orHavingRaw(sql, bindings = []) {
    return this.havingRaw(sql, bindings, "or");
  }

  orderBy(column, direction = "asc") {
    const dir = direction.toLowerCase();
    if (dir !== "asc" && dir !== "desc")
      throw new QueryError(
        `Invalid ORDER BY direction: ${direction}. Must be 'asc' or 'desc'.`
      );
    if (column instanceof Expression)
      this._orders.push({ raw: column.getValue() });
    else this._orders.push({ column, direction: dir });
    return this;
  }
  orderByDesc(column) {
    return this.orderBy(column, "desc");
  }
  latest(column) {
    return this.orderBy(
      column || (this._model ? this._model.createdAtColumn : "created_at"),
      "desc"
    );
  }
  oldest(column) {
    return this.orderBy(
      column || (this._model ? this._model.createdAtColumn : "created_at"),
      "asc"
    );
  }
  inRandomOrder(seed) {
    const rawOrder = this._grammar.compileRandomOrder(seed); // Assumes grammar implements this
    this._orders.push({ raw: rawOrder });
    return this;
  }

  limit(count) {
    this._limit = count > 0 ? parseInt(count, 10) : null;
    return this;
  }
  offset(count) {
    this._offset = count > 0 ? parseInt(count, 10) : null;
    return this;
  }
  forPage(pageNumber, perPage = 15) {
    const page = Math.max(1, parseInt(pageNumber, 10));
    const count = Math.max(1, parseInt(perPage, 10));
    return this.limit(count).offset((page - 1) * count);
  }

  union(query, all = false) {
    let unionQuery;
    if (typeof query === "function") {
      unionQuery = this.newInstance();
      query(unionQuery);
    } else if (query instanceof QueryBuilder) unionQuery = query;
    else
      throw new TypeError(
        "Union argument must be a QueryBuilder instance or a callback function."
      );
    this._unions.push({ query: unionQuery, all });
    this._mergeBindings(unionQuery, "union");
    return this;
  }
  unionAll(query) {
    return this.union(query, true);
  }

  async _aggregate(func, column = "*") {
    const aggregateBuilder = this._cloneWithout([
      "_selects",
      "_orders",
      "_limit",
      "_offset",
    ]);
    const wrappedColumn =
      column === "*" || column instanceof Expression
        ? column
        : this._grammar.wrap(column);
    const aggregateColumn = `${func.toUpperCase()}(${wrappedColumn})`;
    aggregateBuilder._selects = [raw(`${aggregateColumn} as aggregate`)];
    const results = await aggregateBuilder._runSelect();
    if (results && results.length > 0) {
      const value = results[0].aggregate;
      if (value === null || value === undefined) return null;
      const num = Number(value);
      return isNaN(num) ? value : num;
    }
    return null;
  }
  async count(column = "*") {
    return (await this._aggregate("count", column)) ?? 0;
  }
  async max(column) {
    return await this._aggregate("max", column);
  }
  async min(column) {
    return await this._aggregate("min", column);
  }
  async avg(column) {
    return await this._aggregate("avg", column);
  }
  async sum(column) {
    return await this._aggregate("sum", column);
  }

  async exists() {
    const existsBuilder = this._cloneWithout([
      "_selects",
      "_orders",
      "_limit",
      "_offset",
    ]);
    existsBuilder._selects = [raw("1 as nodeorm_exists")];
    existsBuilder.limit(1);
    const result = await existsBuilder.first();
    return !!result;
  }
  async doesntExist() {
    return !(await this.exists());
  }

  toSql() {
    this._applyScopes();
    return this._grammar.compileSelect(this);
  }

  async _run(sql, bindings) {
    if (this._model) {
      await this._model.ensureReady();
    }

    return await this._connection.run(sql, bindings);
  }

  async _runSelect() {
    if (this._model) {
      await this._model.ensureReady();
    }

    this._applyScopes();

    const sql = this._grammar.compileSelect(this);
    const bindings = this.getBindings();
    const results = await this._run(sql, bindings);
    return Array.isArray(results) ? results : results ? [results] : [];
  }

  async get() {
    const results = await this._runSelect();
    const hydrated = this._model ? this.hydrate(results) : results;
    if (this._model && Object.keys(this._eagerLoad).length > 0) {
      await this._eagerLoadRelations(hydrated);
    }
    return hydrated;
  }

  async first() {
    this.limit(1);
    const results = await this.get();
    return results.length > 0 ? results[0] : null;
  }
  async firstOrFail() {
    const result = await this.first();
    if (!result)
      throw new ModelNotFoundError(this._model ? this._model.name : "Record");
    return result;
  }

  async last() {
    this.orderBy(this._model.primaryKey, "DESC").limit(1);
    const results = await this.get();
    return results.length > 0 ? results[0] : null;
  }
  async lastOrFail() {
    const result = await this.last();
    if (!result)
      throw new ModelNotFoundError(this._model ? this._model.name : "Record");
    return result;
  }

  async find(id, columns = ["*"]) {
    if (!this._model)
      throw new QueryError("find() method requires an associated Model.");
    return this.where(this._model.primaryKey, "=", id)
      .select(...columns)
      .first();
  }
  async findMany(ids, columns = ["*"]) {
    if (!this._model)
      throw new QueryError("findMany() method requires an associated Model.");
    if (!Array.isArray(ids) || ids.length === 0) return [];
    // Handle composite keys later if needed
    return this.whereIn(this._model.primaryKey, ids)
      .select(...columns)
      .get();
  }
  async findOrFail(id, columns = ["*"]) {
    const result = await this.find(id, columns);
    if (!result) throw new ModelNotFoundError(this._model.name, id);
    return result;
  }

  async value(column) {
    this.select(column);
    const result = await this.first();
    if (result) {
      return result[column] !== undefined
        ? result[column]
        : result.getAttribute
        ? result.getAttribute(column)
        : null;
    }
    return null;
  }

  async pluck(column, keyColumn) {
    const columnsToSelect = keyColumn ? [column, keyColumn] : [column];
    this.select(...columnsToSelect);
    const results = await this.get();
    if (keyColumn) {
      const map = {};
      results.forEach((row) => {
        const key =
          row[keyColumn] !== undefined
            ? row[keyColumn]
            : row.getAttribute
            ? row.getAttribute(keyColumn)
            : undefined;
        const value =
          row[column] !== undefined
            ? row[column]
            : row.getAttribute
            ? row.getAttribute(column)
            : undefined;
        if (key !== undefined) map[key] = value;
      });
      return map;
    } else {
      return results.map((row) =>
        row[column] !== undefined
          ? row[column]
          : row.getAttribute
          ? row.getAttribute(column)
          : undefined
      );
    }
  }

  async _eagerLoadRelations(models) {
    if (models.length === 0 || Object.keys(this._eagerLoad).length === 0)
      return;
    for (const name in this._eagerLoad) {
      const constraints = this._eagerLoad[name];
      if (!this._model || typeof models[0]?.[name] !== "object") {
        console.warn(
          `NodeORM Warning: Cannot eager load relation "${name}". Relation not found or no model associated with query.`
        );
        continue;
      }
      const relation = models[0][name]; // Access getter to get Relation instance
      if (!(relation instanceof Relation)) {
        debugWarn(
          `NodeORM Warning: Cannot eager load relation "${name}". Property does not return a Relation instance.`
        );
        continue;
      }
      debugLog(`NodeORM Eager Load: Loading relation "${name}"...`);
      await relation.addEagerConstraints(models);
      if (typeof constraints === "function") constraints(relation.getQuery());
      await relation.match(models, await relation.getEager(), name);
      debugLog(`NodeORM Eager Load: Relation "${name}" loaded.`);
    }
  }

  async insert(values) {
    if(this._model) {
      await this._model.ensureReady();
    }

    if (!values || (Array.isArray(values) && values.length === 0))
      return { affectedRows: 0, insertId: null };
    const records = Array.isArray(values) ? values : [values];
    this._clearBindings();
    const sql = this._grammar.compileInsert(this, records);
    const bindings = this._grammar.prepareBindingsForInsert(
      this._bindings.where
    ); // Use 'where' slot for insert values
    return await this._run(sql, bindings);
  }

  async insertGetId(values, sequence) {
    if(this._model) {
      await this._model.ensureReady();
    }

    if (!values || typeof values !== "object" || Array.isArray(values))
      throw new QueryError("insertGetId requires a single object.");
    const pk = sequence || (this._model ? this._model.primaryKey : "id");
    this._clearBindings();
    const sql = this._grammar.compileInsertGetId(this, [values], pk);
    const bindings = this._grammar.prepareBindingsForInsert(
      this._bindings.where
    );
    const result = await this._run(sql, bindings);
    if (typeof result === "object" && result !== null) {
      if (result.insertId) return result.insertId;
      if (
        Array.isArray(result) &&
        result.length > 0 &&
        typeof result[0] === "object"
      ) {
        const returnedId = result[0][pk];
        if (returnedId !== undefined) return returnedId;
      }
      if (result.lastID) return result.lastID;
    }
    debugWarn(
      "NodeORM Warning: Could not reliably determine insert ID after insertGetId."
    );
    return null;
  }

  async insertOrIgnore(values, conflictTarget = []) {
    if(this._model) {
      await this._model.ensureReady();
    }

    if (!values || (Array.isArray(values) && values.length === 0))
      return { affectedRows: 0 };
    const records = Array.isArray(values) ? values : [values];
    this._clearBindings();
    let sql;
    if (typeof this._grammar.compileInsertOrIgnore === "function")
      sql = this._grammar.compileInsertOrIgnore(this, records, conflictTarget);
    else if (typeof this._grammar.compileUpsert === "function")
      sql = this._grammar.compileUpsert(this, records, conflictTarget, []);
    // Simulate via upsert DO NOTHING
    else
      throw new QueryError(
        `insertOrIgnore is not directly supported by the ${this._grammar.constructor.name}.`
      );
    const bindings = this._grammar.prepareBindingsForInsert(
      this._bindings.where
    );
    const result = await this._run(sql, bindings);
    return { affectedRows: result?.affectedRows ?? 0 };
  }

  async upsert(values, conflictTarget, updateColumns) {
    if(this._model) {
      await this._model.ensureReady();
    }

    if (!Array.isArray(values) || values.length === 0)
      return { affectedRows: 0 };
    if (!Array.isArray(conflictTarget) || conflictTarget.length === 0)
      throw new QueryError(
        "Upsert requires specifying conflict target columns."
      );
    if (!Array.isArray(updateColumns))
      throw new QueryError(
        "Upsert requires specifying columns to update (or an empty array for DO NOTHING)."
      );
    this._clearBindings();
    if (typeof this._grammar.compileUpsert !== "function")
      throw new QueryError(
        `Upsert is not supported by the ${this._grammar.constructor.name}.`
      );
    const sql = this._grammar.compileUpsert(
      this,
      values,
      conflictTarget,
      updateColumns
    );
    const bindings = this._grammar.prepareBindingsForInsert(
      this._bindings.where
    ); // Assumes values are bound for INSERT part
    const result = await this._run(sql, bindings);
    return { affectedRows: result?.affectedRows ?? 0 };
  }

  async update(values) {
    if (
      !values ||
      typeof values !== "object" ||
      Object.keys(values).length === 0
    )
      return 0;
    const currentBindings = { ...this._bindings };
    this._clearBindings(); // Clear main bindings for update compilation
    const sql = this._grammar.compileUpdate(this, values); // This adds SET clause bindings
    const bindings =
      typeof this._grammar.prepareBindingsForUpdate === "function"
        ? this._grammar.prepareBindingsForUpdate(currentBindings, values) // Pass original bindings + values
        : [
            ...Object.values(values).map((v) => this._grammar.formatBinding(v)),
            ...currentBindings.join,
            ...currentBindings.where,
          ].flat(); // Basic fallback
    const result = await this._run(sql, bindings);
    return result?.affectedRows ?? 0;
  }

  async increment(column, amount = 1, extra = {}) {
    if (typeof amount !== "number" || isNaN(amount))
      throw new QueryError("Increment amount must be a number.");
    const values = {
      ...extra,
      [column]: raw(`${this._grammar.wrap(column)} + ${amount}`),
    };
    const extraValues = { ...extra }; // Values for binding
    const currentBindings = { ...this._bindings };
    this._clearBindings(); // Clear for update compilation
    const sql = this._grammar.compileUpdate(this, values); // Compile with raw expression
    const bindings =
      typeof this._grammar.prepareBindingsForUpdate === "function"
        ? this._grammar.prepareBindingsForUpdate(currentBindings, extraValues) // Pass only extra values for binding
        : [
            ...Object.values(extraValues).map((v) =>
              this._grammar.formatBinding(v)
            ),
            ...currentBindings.join,
            ...currentBindings.where,
          ].flat(); // Basic fallback
    const result = await this._run(sql, bindings);
    return result?.affectedRows ?? 0;
  }
  async decrement(column, amount = 1, extra = {}) {
    return this.increment(column, -amount, extra);
  }

  async delete() {
    const sql = this._grammar.compileDelete(this);
    const bindings = [...this._bindings.join, ...this._bindings.where].flat(); // WHERE and JOIN bindings
    const result = await this._run(sql, bindings);
    return result?.affectedRows ?? 0;
  }

  allowFullTableDelete() {
    this.strictMode = false;
    return this;
  }

  async truncate(options = {}) {
    this._clearBindings();
    this._truncateOptions = options;
    const sql = this._grammar.compileTruncate(this);
    await this._run(sql, []);
  }

  async forceDelete() {
    let originalWheres = [...this._wheres];
    let softDeleteColumn = null;
    if (this._model?.softDeletes) {
      softDeleteColumn = this._model.getQualifiedDeletedAtColumn();
      this._wheres = this._wheres.filter(
        (where) =>
          !(
            where.type === "Null" &&
            where.column === softDeleteColumn &&
            !where.not
          )
      );
    }
    try {
      const sql = this._grammar.compileDelete(this); // Compile delete without soft delete scope
      const bindings = [...this._bindings.join, ...this._bindings.where].flat();
      const result = await this._run(sql, bindings);
      return result?.affectedRows ?? 0;
    } finally {
      this._wheres = originalWheres; // Restore original wheres
    }
  }

  _applyGlobalScopes() {
    if (this._model && typeof this._model.getGlobalScopes === "function") {
      const globalScopes = this._model.getGlobalScopes();
      globalScopes.forEach((scope, name) => {
        if (!this._removedGlobalScopes.has(name)) {
          scope(this);
        }
      });
    }
  }

  scope(scopeName, ...parameters) {
    if (typeof scopeName === "function") scopeName(this, ...parameters);
    else if (this._model) {
      const methodName = `scope${studlyCase(scopeName)}`;
      if (typeof this._model[methodName] === "function")
        this._model[methodName](this, ...parameters);
      else
        throw new QueryError(
          `Scope method '${methodName}' not found on model '${this._model.name}'.`
        );
    } else
      throw new QueryError(
        `Cannot apply named scope '${scopeName}' without an associated Model.`
      );
    return this;
  }
  _applyScopes() {
    /* Global scopes applied at construction/new query */
  }

  withoutGlobalScopes(scopes) {
    if (!this._model) return this;
    const scopesToRemove =
      scopes || Array.from(this._model.getGlobalScopes().keys());
    scopesToRemove.forEach((scopeName) =>
      this._removedGlobalScopes.add(scopeName)
    );
    // Rebuild query without these scopes? Hard - better to handle in _applyGlobalScopes
    debugWarn(
      "NodeORM Warning: Removing global scopes might require re-running the query setup."
    );
    return this;
  }
  withoutGlobalScope(scopeName) {
    return this.withoutGlobalScopes([scopeName]);
  }

  // --- Soft Delete Scopes ---
  withTrashed() {
    if (this._model?.softDeletes) this.withoutGlobalScope("softDeletes");
    return this;
  }
  onlyTrashed() {
    if (this._model?.softDeletes) {
      this.withoutGlobalScope("softDeletes"); // Remove the default 'not null' scope
      this.whereNotNull(this._model.getDeletedAtColumn()); // Add 'is not null' condition
    }
    return this;
  }

  has(relationName, operator = ">=", count = 1, boolean = "and", constraints) {
    if (!this._model)
      throw new RelationError(
        "Cannot query relationship existence without an associated Model."
      );
    // Instantiate relation to get query details
    const modelInstance = new this._model();
    if (typeof modelInstance[relationName] !== "function")
      throw new RelationError(
        `Relation method '${relationName}' not found on model '${this._model.name}'.`
      );
    const relation = modelInstance[relationName]();
    if (!(relation instanceof Relation))
      throw new RelationError(
        `Method '${relationName}' did not return a Relation instance.`
      );

    // Adjust condition based on count for EXISTS vs count check
    let conditionExpression;
    if (count === 1 && operator === ">=") {
      // Optimize for simple existence check (EXISTS usually faster)
      conditionExpression = raw("1"); // Select 1 for EXISTS
    } else {
      // Use count aggregation
      conditionExpression = raw(`count(*) ${operator} ${parseInt(count, 10)}`);
    }

    // Get the subquery - Relation method should handle EXISTS vs COUNT based on condition
    const subQuery = relation.getRelationExistenceQuery(
      relation.getRelated().query(),
      this,
      conditionExpression
    );
    if (constraints) constraints(subQuery);

    // Add appropriate where clause (EXISTS or comparison)
    if (count === 1 && operator === ">=") {
      this._wheres.push({
        type: "Exists",
        query: subQuery,
        boolean: boolean,
        not: false,
      });
    } else {
      // This requires grammar support for subquery comparisons or needs refactoring
      // For now, stick to EXISTS-based approach for simplicity. Enhance later.
      this._wheres.push({
        type: "Exists",
        query: subQuery,
        boolean: boolean,
        not: false,
      });
      debugWarn(
        "NodeORM Warning: has() with count/operator other than >= 1 currently uses EXISTS check. Refine for aggregate comparison."
      );
    }

    this._mergeBindings(subQuery);
    return this;
  }
  orHas(relationName, operator = ">=", count = 1, constraints) {
    return this.has(relationName, operator, count, "or", constraints);
  }
  doesntHave(relationName, boolean = "and", constraints) {
    // This should use NOT EXISTS or count < 1
    const modelInstance = new this._model();
    const relation = modelInstance[relationName]();
    const subQuery = relation.getRelationExistenceQuery(
      relation.getRelated().query(),
      this,
      raw("1")
    );
    if (constraints) constraints(subQuery);
    this._wheres.push({
      type: "Exists",
      query: subQuery,
      boolean: boolean,
      not: true,
    }); // Use 'not' flag
    this._mergeBindings(subQuery);
    return this;
  }
  orDoesntHave(relationName, constraints) {
    return this.doesntHave(relationName, "or", constraints);
  }
  whereHas(
    relationName,
    constraints,
    operator = ">=",
    count = 1,
    boolean = "and"
  ) {
    return this.has(relationName, operator, count, boolean, constraints);
  }
  orWhereHas(relationName, constraints, operator = ">=", count = 1) {
    return this.whereHas(relationName, constraints, operator, count, "or");
  }

  with(relations) {
    const parseRelations = (rels) => {
      const parsed = {};
      if (typeof rels === "string") parsed[rels] = () => {};
      else if (Array.isArray(rels))
        rels.forEach((rel) => {
          if (typeof rel === "string") parsed[rel] = () => {};
        });
      else if (isObject(rels))
        Object.entries(rels).forEach(([name, cb]) => {
          if (typeof cb === "function") parsed[name] = cb;
        });
      else
        throw new TypeError(
          "Argument for 'with' must be a string, array, or object."
        );
      return parsed;
    };
    const newEagerLoads = parseRelations(relations);
    this._eagerLoad = { ...this._eagerLoad, ...newEagerLoads }; // Merge new loads
    return this;
  }
  without(relations) {
    debugWarn(
      "NodeORM Warning: `without()` for eager loading is not fully implemented yet."
    );
    const relationsToRemove = Array.isArray(relations)
      ? relations
      : [relations];
    relationsToRemove.forEach((relName) => {
      delete this._eagerLoad[relName];
    });
    return this;
  }

  _cloneWithout(except = []) {
    const clone = new QueryBuilder(this._connection, this._model);
    const propertiesToClone = Object.keys(this).filter(
      (key) =>
        !except.includes(key) &&
        ![
          "_connection",
          "_grammar",
          "_model",
          "_bindings",
          "_scopes",
          "_eagerLoad",
          "_removedGlobalScopes",
        ].includes(key)
    );
    propertiesToClone.forEach((key) => {
      try {
        // Attempt deep clone for safety, fallback to shallow
        clone[key] = JSON.parse(JSON.stringify(this[key]));
      } catch (e) {
        clone[key] = Array.isArray(this[key])
          ? [...this[key]]
          : isObject(this[key])
          ? { ...this[key] }
          : this[key];
      }
    });
    clone._bindings = JSON.parse(JSON.stringify(this._bindings));
    clone._eagerLoad = JSON.parse(JSON.stringify(this._eagerLoad));
    clone._scopes = [...this._scopes];
    clone._removedGlobalScopes = new Set(this._removedGlobalScopes);
    return clone;
  }

  _mergeBindings(query, defaultType = "where") {
    const otherBindings = query.getRawBindings();
    BINDING_TYPES.forEach((type) => {
      if (otherBindings[type] && otherBindings[type].length > 0)
        this._bindings[type].push(...otherBindings[type]);
    });
  }

  hydrate(results) {
    if (!this._model)
      throw new QueryError(
        "Cannot hydrate results without an associated Model."
      );
    return this._model.hydrate(results, this._connection.getName());
  }

  /**
   * Insert or update a record matching the attributes, and fill it with values.
   * Performs a select, then either updates the found record or inserts a new one.
   * Note: This is less efficient than native upsert and not atomic.
   * @param {Record<string, any>} attributes Attributes to find the record by.
   * @param {Record<string, any>} [values={}] Values to set on update or create.
   * @returns {Promise<boolean>} True if operation resulted in an existing or new record.
   */
  async updateOrInsert(attributes, values = {}) {
    // Clone the current builder to check existence without modifying original constraints
    const checkQuery = this._cloneWithout([]); // Full clone
    const instance = await checkQuery.where(attributes).first();

    if (instance instanceof this._model) {
      // Record exists, perform update using the *original* builder instance
      const updateValues = { ...values };
      if (Object.keys(updateValues).length === 0) return true;
      // Apply constraints from 'attributes' to the original builder for update
      const affected = await this.where(attributes)
        .limit(1)
        .update(updateValues);
      return affected > 0;
    } else {
      // Record doesn't exist, perform insert
      const insertData = { ...attributes, ...values };
      // Use a new query builder instance for insert
      const insertResult = await this.newInstance()
        .from(this._from)
        .insert(insertData);
      return insertResult.affectedRows > 0;
    }
  }
}
