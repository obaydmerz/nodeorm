import { Collection } from "./collection.js";

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
      Collection.makeJoined(
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
    return (await this.get()).first();
  }

  async firstOrCreate() {
    return (
      (await this.first()) ||
      this.#model.create(this._extra.newCreationTemplate)
    );
  }

  async last() {
    if (!this.#orderBy) this.#orderBy = this.#model.primary;
    if (this.#orderType.toLowerCase() == "desc") this.#orderType = "ASC";
    else this.#orderType = "DESC";
    this.#limit = 1;
    return (await this.get()).first();
  }

  async lastOrCreate() {
    return (await this.last()) || this.#model.create(this._extra.newCreationTemplate);
  }

  async each(cb = async (item, index) => {}) {
    return await (await this.get()).each(cb);
  }

  async delete() {
    return await (await this.get()).delete();
  }
}
