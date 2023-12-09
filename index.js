import { maskObject } from "./src/utils.js";
import {
  DBDriver,
  MySQLDBDriver,
  RawFunctionDBDriver,
  SQLiteDBDriver,
} from "./src/multisupport.js";
import { getJoinedSelection } from "./src/extra.js";
import { EmptyDataError, errors, fire } from "./src/errors.js";

export class NodeORM {
  static dbdrivers = [MySQLDBDriver, SQLiteDBDriver, RawFunctionDBDriver];

  static defaultDB = undefined; // Will fallback to env reading

  static envObject = process.env;

  static async extractFromEnv() {
    if (
      typeof this.envObject["DB_CONNECTION"] !== "string" ||
      this.envObject["DB_CONNECTION"].length == 0
    ) {
      throw new Error(
        "When using environment. no 'DB_CONNECTION' env variable or it isn't a string."
      );
    }

    for (const dbdriver in this.dbdrivers) {
      try {
        if (!(dbdriver.prototype instanceof DBDriver)) continue;
        const data = dbdriver.extractFromEnv(this.envObject); // It should return an array, because that array is going to be 'extracted' into dbdriver.make() directly.

        if (!Array.isArray(data)) continue;

        return await dbdriver.make(...data);
      } catch (error) {}
    }

    throw new Error(`Unsupported database type: ${dbConnection}`);
  }

  static async determine(dbinstance) {
    dbinstance = dbinstance || this.defaultDB;

    // If the given dbinstance is a promise, resolve it
    if (dbinstance instanceof Promise) dbinstance = await dbinstance;

    // Return the given DBDriver
    if (dbinstance instanceof DBDriver) return dbinstance;

    // Search for a DBDriver that can handle the given.
    for (const dbdriver of this.dbdrivers) {
      const made = await dbdriver.make(dbinstance);
      if (made instanceof DBDriver) return made;
    }

    // None of the above, fallback to env reading...
    return await this.extractFromEnv();
  }
}

export class SQLBuilder {
  #tables = [];
  #limit = 1000;
  #orderBy = "";
  #orderType = "ASC";
  #model;
  #defprefix = "";
  #where = {};
  #columns = [];
  #joins = [];
  _extra = {
    newCreationTemplate: {},
  };

  constructor(table, model, defprefix = undefined) {
    if (Array.isArray(table)) {
      this.#tables = table;
    } else {
      this.#tables.push(table);
    }

    this.#columns = [...model.columns];

    this.#model = model;
    this.#defprefix = defprefix || table + ".";
  }

  where(key, valueOrSep, value = undefined) {
    let sep = "=";
    if (value !== undefined) {
      sep = valueOrSep;
    } else {
      value = valueOrSep;
    }

    if (key.indexOf(".") === -1) {
      key = this.#defprefix + key;
    }

    this.#where["%" + key] = sep;
    this.#where[key] = value;
    return this;
  }

  join(model, localKey = undefined, foreignKey = undefined) {
    if (!(model.prototype instanceof Model)) {
      return this;
    }

    if (foreignKey === undefined) {
      foreignKey = model.primary || "id";
    }
    if (localKey === undefined) {
      localKey = model.name.toLowerCase() + "_" + foreignKey;
    }

    for (const col of model.columns) {
      this.#columns.push(`@${model.table}.${col} AS \`${model.table}.${col}\``);
    }
    this.#tables.push(model.table);
    this.#where[`${model.table}.${foreignKey}`] = `${
      this.#tables[0]
    }.${localKey}`;
    this.#where[`%${model.table}.${foreignKey}`] = `=@`;
    this.#joins.push(model);
    return this;
  }

  whereExpression(key, valueOrSep, value = undefined) {
    let sep = "=@"; // The trick in "@", it's used to prevent value encoding. that's all.
    if (value !== undefined) {
      sep = valueOrSep + "@";
    } else {
      value = valueOrSep;
    }

    if (key.indexOf(".") === -1) {
      key = this.#defprefix + key;
    }

    this.#where["%" + key] = sep;
    this.#where[key] = value;
    return this;
  }

  orderBy(column, type = "ASC") {
    if (typeof column === "string") {
      this.#orderBy = column;
    }
    if (typeof type === "string") {
      this.#orderType = type;
    }
    return this;
  }

  limit(x) {
    if (typeof x === "number") {
      this.#limit = x;
    }
    return this;
  }

  async get() {
    return (
      getJoinedSelection(
        this.#model,
        await this.#model.dbdriver.commands.selectRow({
          tables: this.#tables,
          where: this.#where,
          columns: this.#columns,
          orderby: this.#orderBy,
          ordertype: this.#orderType,
          limit: this.#limit,
        }),
        this.#joins,
        this._extra.newCreationTemplate
      ) || undefined
    );
  }

  async first() {
    if (!this.#orderBy) this.#orderBy = this.#model.primary;

    this.#limit = 1;

    return await this.get().first();
  }

  async firstOrCreate() {
    const item = (await this.get()).first(0);
    return item || this.#model.create(this._extra.newCreationTemplate);
  }

  async last() {
    if (!this.#orderBy) this.#orderBy = this.#model.primary;
    if (this.#orderType.toLowerCase() == "desc") this.#orderType = "ASC";
    else this.#orderType = "DESC";

    this.#limit = 1;

    return (await this.get()).first();
  }

  async each(cb = async (item, index) => {}) {
    return await (await this.get()).each(cb);
  }

  async delete() {
    return await (await this.get()).delete();
  }
}

// Needs to be shipped with data
// Otherwise it will be considered as newly created.
export class ModelItem {
  #model = null;
  #clause = {}; // The "where" clause used to retrieve this item, used for item-specific actions such as editing or deleting.
  #mutation = []; // The mutations made to the item's data
  #data = {};
  #belongs = {};
  #newlyCreated = false;

  constructor(model, data = undefined, belongs = {}, newlyCreated = false) {
    this.#model = model;
    this.#data = { ...data } || {};
    this.#clause = {
      [this.#model.primary]: this.#data[this.#model.primary],
    };
    this.#belongs = belongs;

    // data = undefined then #newlyCreated is true
    // data = {...} but newlyCreated == true then #newlyCreated is true
    // data = {...} but newlyCreated == false then #newlyCreated is false
    this.#newlyCreated = newlyCreated || data === undefined;

    // If newlyCreated then put queue data to be pushed to db
    if (newlyCreated && typeof data == "object")
      this.#mutation = Object.keys(data);

    const that = this;

    for (const attr of this.#model.attributes) {
      Object.defineProperty(this, attr.name, {
        get() {
          return attr.cb.call(this);
        },
        set(v) {},
      });
    }

    for (const col of this.#model.columns) {
      if (col.startsWith("#") || col.endsWith(")")) {
        continue;
      }

      if (this.#model.attributes.includes(col)) {
        continue; // When an attribute is defined
      }

      Object.defineProperty(this, col, {
        get() {
          return that.#data[col];
        },
        set(v) {
          that.#data[col] = v;
          if (!that.#mutation.includes(col)) that.#mutation.push(col);
        },
      });
    }

    this.superConstructor = this.constructor;
    this.constructor = this.model;
  }

  get data() {
    return this.#data;
  }

  get model() {
    return this.#model;
  }

  toString() {
    return JSON.stringify(this.#data);
  }

  hasMany(model, hisKey = null, myKey = null) {
    let res;
    if (model.prototype instanceof Model) {
      if (myKey === null) myKey = this.#model.primary || "id";
      if (hisKey === null)
        hisKey = this.#model.table.toLowerCase().toSingular() + "_" + myKey;
      // Ex: post_id

      res = model.where(hisKey, "=", this.#data[myKey]);

      // We want the usage of Collection.create to be linked automaticlly.
      res._extra.newCreationTemplate = {
        [hisKey]: this.#data[myKey],
      };
    }
    return res;
  }

  belongsTo(model, myKey = null, hisKey = null) {
    if (model.prototype instanceof Model) {
      if (hisKey === null) hisKey = model.primary;
      if (myKey === null)
        myKey = model.table.toLowerCase().toSingular() + "_" + hisKey;

      // Used to short time, because we already have the data.
      if (this.#belongs[model.name] !== undefined) {
        return this.#belongs[model.name];
      }

      return model.where(hisKey, "=", this.#data[myKey]).first();
    }
    return undefined;
  }

  async save() {
    if (!this.#newlyCreated && this.#mutation.length == 0) return false;

    const res = await this.#model.dbdriver.commands[
      this.#newlyCreated ? "insertRow" : "updateRow"
    ]({
      table: this.#model.table,
      data: maskObject(this.#data, this.#mutation),
      where: this.#clause,
    });

    if (this.#newlyCreated) {
      if (this.#mutation.length == 0)
        throw new EmptyDataError("Cannot create an item with empty data.");

      this.#newlyCreated = false; // It's no longer new.

      if (res.insertId) {
        this.#data[this.#model.primary] = res.insertId;
      }
    }

    // Mutations are pushed!
    this.#mutation.length = 0;
    return res || false;
  }

  async delete() {
    const res = await this.#model.dbdriver.commands["deleteRow"]({
      table: this.#model.table,
      where: this.#clause,
    });
    return res || false;
  }
}

export class Model {
  static table = undefined;
  static columns = [];
  static guarded = [];
  //static attributes = [];
  static primary = undefined;
  static initilazed = false;
  static dbdriver;

  static async init(connection, ...models) {
    if (connection instanceof Promise) connection = await connection;

    if (connection instanceof Model) {
      // All of arguments are models?
      models.push(connection);
      connection = undefined;
    }

    if (models.length) {
      this.dbdriver = await NodeORM.determine(connection);

      // When:
      // Model.init(connectionOrModel, ...models, Post, ...models); <-- This step
      // This will call -> Post.init(conn)

      for (const model of models) {
        if (!(model.prototype instanceof Model)) {
          continue;
        }
        await model.init(this.dbdriver);
      }
    } else {
      this.attributes = [];
      this.dbdriver = connection;

      for (const col of Object.getOwnPropertyNames(this).filter(
        (item) => item.startsWith("_") && typeof this[item] === "function"
        // Like _foobar() and _test()
      )) {
        if (col.startsWith("#") || col.endsWith(")")) {
          continue; // We won't define this.
        }

        this.attributes.push({
          name: col.substring(1),
          cb: this[col],
        }); // attributes = ["foobar", "test"]
      }

      // When:
      // Model.init(connectionOrModel, ...models, Post, ...models);
      // This will call -> Post.init(conn) <-- This step

      if (this.table == undefined) {
        this.table = this.name.toLowerCase().toPlural();
        // Post => posts
        // Category => categories
      }

      if (this.connection == undefined) {
        this.connection = connection;
      }

      if (this.connection == undefined) {
        return; // Still undefined!
      }

      if (this.columns.length == 0) {
        // Get the tables data
        const result = await this.dbdriver.commands.describe(this.table);

        this.columns = [];
        this.primary = "id";

        for (const row of result) {
          // We don't want our guarded columns to be accessed.
          if ([...this.guarded].includes(row.name)) {
            continue;
          }
          this.columns.push(row.name);
          if (row.isPrimary) {
            this.primary = row.name;
          }
        }

        // If primary is still undefined, set it to the first column
        if (this.primary == undefined && result.length) {
          this.primary = result[0].name;
        }
      }

      this.initilazed = true;
    }

    if (typeof this.afterInit == "function") {
      await this.afterInit();
    }

    return this.dbdriver;
  }

  static async afterInit() {}

  static async all() {
    fire(errors.uninitilazedModel, !this.initilazed);
    return await this.query().get();
  }

  static create(template = {}) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return new ModelItem(this, template, {}, true);
  }

  static find(x) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.wherePrimary(x).first();
  }

  static wherePrimary(x) {
    fire(errors.uninitilazedModel, !this.initilazed);
    if (!this.primary) {
      if (!this.columns[0]) {
        return null;
      }
      return this.where(this.columns[0], "=", x);
    }
    return this.where(this.primary, "=", x);
  }

  static query() {
    fire(errors.uninitilazedModel, !this.initilazed);
    const that = this;
    return new SQLBuilder(this.table, that, `${this.table}.`);
  }

  static where(key, valueOrSep, value = undefined) {
    fire(errors.uninitilazedModel, !this.initilazed);

    return this.query().where(key, valueOrSep, value);
  }

  static each(cb) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().each(cb);
  }

  static last() {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().last();
  }

  static first() {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().first();
  }

  static whereExpression(key, valueOrSep, value = undefined) {
    fire(errors.uninitilazedModel, !this.initilazed);
    return this.query().whereExpression(key, valueOrSep, value);
  }
}

export { MySQLDBDriver, SQLiteDBDriver, RawFunctionDBDriver, DBDriver };
