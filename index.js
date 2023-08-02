import { maskObject, readEnv } from "./src/utils.js";
import {
  DBDriver,
  MySQLDBDriver,
  RawFunctionDBDriver,
  SQLiteDBDriver,
} from "./src/multisupport.js";
import { getJoinedSelection } from "./src/extra.js";
import {
  EmptyDataError,
  errors,
  fire,
} from "./src/errors.js";

export class NodeORM {
  static dbdrivers = [MySQLDBDriver, SQLiteDBDriver, RawFunctionDBDriver];

  static defaultDB = undefined;

  static async determine(dbinstance = undefined) {
    // They told us to read env variables.
    if (typeof dbinstance == "string" && dbinstance.toLowerCase() == "env")
      return await readEnv();

    // No need to redo much stuff...
    if (dbinstance instanceof DBDriver) return dbinstance;

    const dbdetermine = DBDriver.determine(dbinstance, this.dbdrivers);
    // They gave us some stuff that helped us connecting to a database.
    if (dbdetermine instanceof DBDriver) return dbdetermine;

    const dfdetermine = DBDriver.determine(this.defaultDB, this.dbdrivers);
    // But they also gave us a default..
    if (dfdetermine instanceof DBDriver) return dfdetermine;

    // None of the above, fallback to env reading...
    return await readEnv();
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

  async first(modIndex = 0) {
    return (await this.get()).first(modIndex);
  }

  async last(modIndex = 0) {
    return (await this.get()).last(modIndex);
  }

  async each(cb = async (item, index) => {}) {
    return await (await this.get()).each(cb);
  }

  async delete() {
    return await (await this.get()).delete();
  }
}

// Needs to be shipped with original data
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

    // Dont have any data yet.. I'm newly created!
    // But if newlyCreated is forced. then data is a template!
    this.#newlyCreated = newlyCreated || data === undefined;

    // So i will put my data to be pushed to database.
    if (newlyCreated && typeof data == "object")
      this.#mutation = Object.keys(data);

    const that = this;
    const attributes = [];

    for (const col of Object.getOwnPropertyNames(this.#model).filter(
      (item) => typeof this.#model[item] === "function" && item.startsWith("_")
      // Like _haha() and _test()
    )) {
      const name = col.substring(1); // Remove that underscore
      attributes.push(name);

      if (name.startsWith("#") || name.endsWith(")")) {
        continue; // We won't define this.
      }
      Object.defineProperty(this, name, {
        get() {
          if (typeof that.#model[col] === "function") {
            return that.#model[col](that);
          }
          return undefined;
        },
        set(v) {},
      });
    }

    for (const col of this.#model.columns) {
      if (col.startsWith("#") || col.endsWith(")")) {
        continue;
      }
      if (attributes.includes(col)) {
        continue; // When an attribute is defined
      }
      Object.defineProperty(this, col, {
        get() {
          return that.#data[col];
        },
        set(v) {
          that.#data[col] = v;
          that.#mutation.carePush(col);
        },
      });
    }
  }

  get data() {
    return this.#data;
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
      const res = await this.#model.dbdriver.commands.lastinsert(
        this.#model.columns,
        this.#model.table,
        this.#model.primary
      );

      for (const col of this.#model.columns) {
        // Let's fetch data, there are some changes. like auto_increment, defaults...
        if (res[0] != undefined) this.#data[col] = res[0][col];
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
  static attributes = [];
  static primary = undefined;
  static initilazed = false;
  static dbdriver;

  static async init(connection, ...models) {
    if (connection instanceof Promise) connection = await connection;

    if (connection.prototype instanceof Model) {
      // All of arguments are models?
      models.push(connection);
      this.dbdriver = await NodeORM.determine();
    }

    if (models.length) {
      this.dbdriver = await NodeORM.determine(connection);
      // I am used to init other friends...
      for (const model of models) {
        if (!(model.prototype instanceof Model)) {
          continue;
        }
        await model.init(this.dbdriver);
      }
    } else {
      this.dbdriver = connection;
      // Ha? My turn!
      // When:
      // Model.init(...models, Post, ...models);
      // This will call -> Post.init(...args)

      if (this.table == undefined) {
        this.table = this.name.toLowerCase().toPlural();
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
          // We don't want our guarded columns to be shown and accessed.
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

    return this.dbdriver;
  }

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
      return null;
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
