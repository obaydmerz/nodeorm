import { Model } from "../index.js";
import {
  conditionOrNothing,
  genPairsFromObj,
  generateValueSep,
} from "./utils.js";

export class DBDriver {
  envType = "";

  static extractFromEnv() {
    return "";
  }

  static verify(dbinstance) {
    return false;
  }

  static determine(dbinstance, ...dbdrivers) {
    for (const driver of dbdrivers) {
      if (driver.prototype instanceof DBDriver && driver.verify(dbinstance))
        return new driver(dbinstance);
    }
    return null;
  }

  static from(options = {}) {
    throw new Error(`Cannot get a dbdriver from this abstract class.`);
  }

  dbinstance = undefined;
  commands = {};

  constructor(dbinstance) {
    if (typeof dbinstance != "object" || dbinstance == null)
      throw new Error("Invalid database instance");

    this.dbinstance = dbinstance;

    this.commands = {
      insertRow: ({ table, data }) => {
        const columns = generateValueSep(Object.keys(data), {
          stringChar: "`",
        });
        const values = generateValueSep(Object.values(data));
        return this.query(
          `INSERT INTO \`${table}\` (${columns}) VALUES (${values})`
        );
      },
      deleteRow: ({ table, where }) => {
        const condition = `WHERE ${genPairsFromObj(where, " AND ")}`;
        const whereClause = conditionOrNothing(condition, where);
        return this.query(`DELETE FROM \`${table}\` ${whereClause}`);
      },
      updateRow: ({ table, data, where }) => {
        const setClause = genPairsFromObj(data);
        const condition = `WHERE ${genPairsFromObj(where, " AND ")}`;
        const whereClause = conditionOrNothing(condition, where);
        return this.query(
          `UPDATE \`${table}\` SET ${setClause} ${whereClause}`
        );
      },
      selectRow: ({
        tables,
        columns = [],
        where,
        limit = 1000,
        orderby = "",
        ordertype = "ASC",
      }) => {
        const selectedColumns = generateValueSep(
          columns,
          { stringChar: "" },
          "*"
        );
        const selectedTables = generateValueSep(
          tables,
          { stringChar: "`" },
          ""
        );
        const condition = `WHERE ${genPairsFromObj(where, " AND ")}`;
        const whereClause = conditionOrNothing(condition, where);
        const orderClause = conditionOrNothing(
          `ORDER BY \`${orderby}\` ${ordertype}`,
          orderby
        );
        const limitClause = conditionOrNothing(`LIMIT ${limit}`, limit);
        return this.query(
          `SELECT ${selectedColumns} FROM ${selectedTables} ${whereClause} ${orderClause} ${limitClause}`
        );
      },
      lastinsert: async (columns, table, primary) => {
        return await that.query(
          `SELECT ${generateValueSep(
            columns,
            {
              stringChar: "`",
            },
            "*"
          )} FROM \`${table}\` WHERE ${primary} = (SELECT LAST_INSERT_ID())`
        );
      },
      describe: async (table) => {
        var res = [];
        for (const row of await that.query(`DESC \`${table}\`)`)) {
          res.push({
            name: row.Field,
            isPrimary: row.Key.includes("PRI"),
          });
        }
        return res;
      },
    };
  }

  init(...models) {
    return Model.init(this, ...models);
  }

  query(query) {
    return new Promise((resolve, reject) => {
      resolve();
    });
  }
}

export class MySQLDBDriver extends DBDriver {
  envType = "mysql";

  static extractFromEnv() {
    return {
      host: process.env["DB_HOST"] || "localhost",
      database: process.env["DB_DATABASE"] || "db",
      user: process.env["DB_USERNAME"] || "root",
      password: process.env["DB_PASSWORD"] || "",
    };
  }

  static verify(dbinstance) {
    return (
      dbinstance &&
      typeof dbinstance === "object" &&
      typeof dbinstance.escape === "function" &&
      typeof dbinstance.query === "function" &&
      typeof dbinstance.execute === "function" &&
      typeof dbinstance.beginTransaction === "function" &&
      typeof dbinstance.commit === "function" &&
      typeof dbinstance.rollback === "function" &&
      typeof dbinstance.end === "function" &&
      typeof dbinstance.destroy === "function"
    );
  }

  static async from({
    database = "db",
    host = "localhost",
    port = 3306,
    user = "root",
    password = "",
  } = {}) {
    let mysqlLibrary;
    try {
      mysqlLibrary = await import("mysql2");
    } catch (error) {
      try {
        mysqlLibrary = await import("mysql");
      } catch (error) {
        throw new Error(
          "MySQL or MySQL2 library not found. Please install either 'mysql' or 'mysql2' package."
        );
      }
    }

    const connection = mysqlLibrary.createConnection({
      database,
      host,
      port,
      user,
      password,
    });
    connection.once("error", (err) => {
      console.error("MySQL connection error:", err);
    });

    await new Promise((resolve, reject) => {
      connection.connect((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return new MySQLDBDriver(connection);
  }

  query(query, params = []) {
    return new Promise((resolve, reject) => {
      console.log(this.dbinstance);
      this.dbinstance.query(query, params, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }
}

export class SQLiteDBDriver extends DBDriver {
  envType = "sqlite";

  static extractFromEnv() {
    return typeof process.env["DB_DATABASE"] == "string" ? process.env["DB_DATABASE"] : ":memory:";
  }

  static verify(dbinstance) {
    if (typeof dbinstance === "object" && dbinstance !== null) {
      return (
        dbinstance.constructor && dbinstance.constructor.name === "Database"
      );
    }
    return false;
  }

  query(query) {
    return new Promise((resolve, reject) => {
      this.dbinstance.all(query, [], (err, result) => {
        if (err) return reject(new Error(err));
        resolve(result);
      });
    });
  }

  static async from(dbPath) {
    const sqliteLibrary = await import("sqlite3");
    if (!sqliteLibrary) {
      throw new Error(
        "SQLite library not found. Please install 'sqlite3' package."
      );
    }

    const SQLiteConnection = new sqliteLibrary.default.Database(dbPath);

    SQLiteConnection.on("error", (err) => {
      console.error("SQLite connection error:", err);
    });

    return await new Promise((resolve) => {
      SQLiteConnection.serialize(() => {
        resolve(new SQLiteDBDriver(SQLiteConnection));
      });
    });
  }

  constructor(dbinstance) {
    super(dbinstance);

    this.commands = {
      ...this.commands,
      lastinsert: async (columns, table, primary) => {
        return await this.query(
          `SELECT ${generateValueSep(
            columns,
            {
              stringChar: "`",
            },
            "*"
          )} FROM \`${table}\` WHERE ${primary} = (SELECT last_insert_rowid())`
        );
      },
      describe: async (table) => {
        var res = [];
        for (const row of await this.query(`pragma table_info ('${table}\')`)) {
          res.push({
            name: row.name,
            isPrimary: row.pk == 1,
          });
        }
        return res;
      },
    };
  }
}

export class RawFunctionDBDriver extends DBDriver {
  static verify(dbinstance) {
    return typeof dbinstance === "function";
  }

  query(query) {
    return new Promise((resolve, reject) => {
      try {
        var raw = this.dbinstance(query);
        if (!(raw instanceof Promise))
          return reject(
            new Error("Should the given driver function returns a Promise?")
          );
        raw.then(resolve).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }
}
