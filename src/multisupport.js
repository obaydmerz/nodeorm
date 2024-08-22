import { Model } from "./model.js";
import { LibraryNotFound } from "./errors.js";
import { prepareObj } from "./utils.js";
import { basename } from "path";

export async function getLibrary(...librarySets) {
  let libraries = [];

  for (const lib of librarySets.flat()) {
    if (lib instanceof Promise) libraries.push(await lib);
    else libraries.push(lib);
  }

  for (const library of libraries) {
    switch (typeof library) {
      case "string":
        try {
          return await import(library);
        } catch (error) {}
        break;

      case "object":
        if (
          typeof this.verifyLibraryObject == "function" &&
          this.verifyLibraryObject(library)
        )
          return library;
    }
  }
}

export class DBDriver {
  static library = [];
  static extractFromEnv(envObject) {
    return undefined;
  }

  static verifyLibraryObject(library) {
    return false;
  }

  static verifyInstanceObject(dbinstance) {
    return false;
  }

  static make(options = {}) {
    return undefined;
  }

  dbinstance = undefined;
  commands = {};

  constructor(dbinstance) {
    if (typeof dbinstance != "object" || dbinstance == null) {
      throw new Error("Invalid database instance");
    }

    this.dbinstance = dbinstance;

    this.commands = {
      insertRow: ({ table, data }) => {
        return this.query(`INSERT INTO \`${table}\`(??) VALUES (?)`, [
          Object.keys(data),
          Object.values(data),
        ]);
      },
      deleteRow: ({ table, where }) => {
        const { str, preps } = prepareObj(where);

        return this.query(
          `DELETE FROM \`${table}\` ${`WHERE ${str}`.cond(where)}`,
          preps
        );
      },
      updateRow: ({ table, data, where }) => {
        const { str, preps } = prepareObj(where);

        return this.query(
          `UPDATE \`${table}\` SET ? ${`WHERE ${str}`.cond(where)}`,
          [data, ...preps]
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
        const { str, preps } = prepareObj(where);

        return this.query(
          `SELECT ?? FROM ?? ${`WHERE ${str}`.cond(
            where
          )} ${`ORDER BY ?? ${ordertype}`.cond(orderby)} ${`LIMIT ?`.cond(
            limit
          )}`,
          [
            columns.length ? columns : dbinstance.raw("*"),
            tables,
            ...preps,
            ...(orderby ? [orderby] : []),
            limit,
          ]
        );
      },
      describe: async (table) => {
        var res = [];
        for (const row of await this.query(`DESC \`${table}\``)) {
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
  static library = ["mysql2", "mysql"];

  static extractFromEnv(envObject) {
    if (envObject["DB_CONNECTION"] != "mysql") return;

    return [
      {
        libraries: (envObject["DB_LIBRARY"] || "").split(","),
        host: envObject["DB_HOST"] || "localhost",
        port: parseInt(envObject["DB_PORT"]) || 3306,
        database: envObject["DB_DATABASE"] || "db",
        user: envObject["DB_USERNAME"] || "root",
        password: envObject["DB_PASSWORD"] || "",
      },
    ];
  }

  static verifyLibraryObject(library) {
    return (
      library &&
      typeof library === "object" &&
      typeof library.createConnection === "function"
    );
  }

  static verifyInstanceObject(dbinstance) {
    return (
      dbinstance &&
      typeof dbinstance === "object" &&
      typeof dbinstance.escape === "function" &&
      typeof dbinstance.query === "function" &&
      typeof dbinstance.beginTransaction === "function" &&
      typeof dbinstance.commit === "function" &&
      typeof dbinstance.rollback === "function" &&
      typeof dbinstance.end === "function" &&
      typeof dbinstance.destroy === "function"
    );
  }

  static async make(dbinstance) {
    if (typeof dbinstance == "string") {
      const url = new URL(
        !dbinstance.includes("://") ? "mysql://" + dbinstance : dbinstance
      );
      if (!["mysql:", "sql:"].includes(url.protocol)) return;

      return new this(
        await this.createConnection({
          host: url.hostname,
          libraries: String(url).split(","),
          port: parseInt(url.port || "3306"),
          username: url.username || "root",
          password: url.password,
          database: url.pathname.substring(1) || "database",
        })
      );
    }

    if (this.verifyInstanceObject(dbinstance)) return new this(dbinstance);

    if (dbinstance && typeof dbinstance === "object") {
      return new this(await this.createConnection(dbinstance));
    }

    return;
  }

  /** Private, will create a connection from a given configuration object */
  static async createConnection({
    database = "db",
    host = "localhost",
    port = 3306,
    user = "root",
    password = "",
    libraries = undefined,
  } = {}) {
    let mysqlLibrary = await getLibrary.call(
      {
        verifyLibraryObject: this.verifyLibraryObject,
      },
      libraries,
      this.library
    );

    if (mysqlLibrary === undefined) {
      throw new LibraryNotFound(
        "MySQL library not found. Please install 'mysql2' or 'mysql' package. or include a valid package via MySQLDBDriver.library or DB_LIBRARY environment variable when working with environment."
      );
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

    return connection;
  }

  query(query, prepared = []) {
    return new Promise((resolve, reject) => {
      const qu = this.dbinstance.format(query, prepared);

      // Function to support promises and/or traditional callbacks
      function done(err, result) {
        if (err) {
          console.log("\nSQL:", qu.split(",").join(",\n"));

          return reject(err);
        }

        resolve(result);
      }

      const funcreturn = this.dbinstance.query(qu, [], done);
      if (funcreturn instanceof Promise) {
        funcreturn
          .then((res) => done(null, res[0]))
          .catch((err) => done(err, null));
      }
    });
  }
}

export class SQLiteDBDriver extends DBDriver {
  static library = ["sqlite3"];
  static extractFromEnv(envObject) {
    if (envObject["DB_CONNECTION"] != "sqlite") return;
    return [
      typeof envObject["DB_DATABASE"] == "string"
        ? envObject["DB_DATABASE"]
        : ":memory:",
      envObject["DB_LIBRARY"],
    ];
  }

  static verifyLibraryObject(library) {
    return (
      library &&
      typeof library == "object" &&
      library.default &&
      typeof library.default == "object" &&
      library.defaut.Database
    );
  }

  static verifyInstanceObject(dbinstance) {
    return (
      dbinstance &&
      typeof dbinstance === "object" &&
      dbinstance.constructor &&
      dbinstance.constructor.name === "Database"
    );
  }

  static async make(dbinstance, library) {
    if (
      typeof dbinstance == "string" &&
      ((dbinstance === basename(dbinstance) && dbinstance.endsWith(".db")) ||
        dbinstance == ":memory:")
    ) {
      return new this(await this.createConnection(dbinstance, library));
    }

    if (this.verifyInstanceObject(dbinstance)) return new this(dbinstance);
  }

  /** Private, will create a connection from a given path */
  static async createConnection(dbPath, library) {
    const sqliteLibrary = await getLibrary.call(
      {
        verifyLibraryObject: this.verifyLibraryObject,
      },
      library,
      this.library
    );

    if (!sqliteLibrary) {
      throw new LibraryNotFound(
        "SQLite library not found. Please install 'sqlite3' package. or include a valid package via SQLiteDBDriver.library or DB_LIBRARY environment variable when working with environment."
      );
    }

    const SQLiteConnection = new sqliteLibrary.default.Database(dbPath);

    SQLiteConnection.on("error", (err) => {
      console.error("SQLite connection error:", err);
    });

    return await new Promise((resolve) => {
      SQLiteConnection.serialize(() => {
        resolve(SQLiteConnection);
      });
    });
  }

  query(query, prepared = []) {
    return new Promise((resolve, reject) => {
      this.dbinstance.all(query, prepared, (err, result) => {
        if (err) return reject(new Error(err));
        result.insertId = this.lastID;
        resolve(result);
      });
    });
  }

  constructor(dbinstance) {
    super(dbinstance);

    this.commands = {
      ...this.commands,
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
  static from(dbinstance) {
    if (typeof dbinstance === "function") return new this(dbinstance);
  }

  query(query, prepared) {
    return new Promise((resolve, reject) => {
      try {
        var raw = this.dbinstance(query, prepared);
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
