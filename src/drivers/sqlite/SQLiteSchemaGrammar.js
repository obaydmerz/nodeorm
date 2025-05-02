/**
 * @fileoverview SQLite specific Schema grammar compiler.
 */
import { BaseSchemaGrammar } from '../../schema/BaseSchemaGrammar.js';

/**
 * SQLite specific Schema grammar.
 */
export class SQLiteSchemaGrammar extends BaseSchemaGrammar {
  /** @inheritdoc */
  compileCreate(tableName, blueprint) {
    let sql = `CREATE TABLE ${this.wrapTable(tableName)} (\n    `;
    const columns = this._getColumns(blueprint);
    // Get inline primary key if defined on column, unique too
    const constraints = this._getInlineConstraints(blueprint);

    sql += [...columns, ...constraints].join(",\n    ");
    sql += `\n)`;

    // SQLite often handles constraints within the main CREATE TABLE statement
    return [sql];
  }

  /** @inheritdoc */
  compileAlter(tableName, blueprint) {
    // SQLite has limited ALTER TABLE support.
    // It supports ADD COLUMN and RENAME COLUMN (recent versions).
    // It DOES NOT support MODIFY COLUMN or DROP COLUMN directly.
    // Often requires recreating the table for complex changes.
    const commands = [];
    blueprint.definitions.forEach((def) => {
      switch (def.type) {
        case "column":
          // Basic ADD COLUMN support
          commands.push(this._compileAddColumn(tableName, def));
          break;
        case "index":
          commands.push(this._compileCreateIndex(tableName, def));
          break;
        case "unique":
          // Cannot add unique constraint directly after creation usually
          console.warn(
            "NodeORM Schema (SQLite): Adding UNIQUE constraints via ALTER TABLE is not directly supported. Consider table recreation."
          );
          break;
        case "primary":
          console.warn(
            "NodeORM Schema (SQLite): Changing PRIMARY KEY via ALTER TABLE is not supported. Requires table recreation."
          );
          break;
        case "foreign":
          // Foreign keys must be defined during CREATE TABLE in SQLite unless PRAGMA foreign_keys=OFF
          console.warn(
            "NodeORM Schema (SQLite): Adding FOREIGN KEY constraints via ALTER TABLE is not supported without disabling checks. Define during creation."
          );
          break;
        // TODO: Add support for renameColumn if needed (requires specific Blueprint command)
        default:
          console.warn(
            `NodeORM Schema (SQLite): Alter operation type '${def.type}' may not be fully supported.`
          );
      }
    });
    return commands;
  }

  /** Compile ADD COLUMN statement */
  _compileAddColumn(tableName, column) {
    const columnSql = `${this.wrap(column.name)} ${this._getType(
      column
    )} ${this._getModifiers(column)}`.trim();
    return `ALTER TABLE ${this.wrapTable(tableName)} ADD COLUMN ${columnSql}`;
  }

  /** @inheritdoc */
  compileRename(from, to) {
    return `ALTER TABLE ${this.wrapTable(from)} RENAME TO ${this.wrapTable(
      to
    )}`;
  }

  /** @inheritdoc */
  compileDrop(tableName) {
    return `DROP TABLE ${this.wrapTable(tableName)}`;
  }
  /** @inheritdoc */
  compileDropIfExists(tableName) {
    return `DROP TABLE IF EXISTS ${this.wrapTable(tableName)}`;
  }

  /** @inheritdoc */
  compileEnableForeignKeyConstraints() {
    return "PRAGMA foreign_keys = ON;";
  }
  /** @inheritdoc */
  compileDisableForeignKeyConstraints() {
    return "PRAGMA foreign_keys = OFF;";
  }

  /** @inheritdoc */
  compileColumnListing(tableName) {
    return `SELECT name FROM pragma_table_info(${this.wrapTable(
      tableName
    )}) ORDER BY cid`;
  }

  /** @inheritdoc */
  compileTableExists(tableName) {
    return `SELECT name FROM sqlite_master WHERE type='table' AND name=${this._queryGrammar.formatBinding(
      tableName
    )}`;
  }

  // --- Type Compilation ---
  // Note: SQLite uses type affinity rather than strict types.
  _type_bigIncrements(col) {
    return "INTEGER PRIMARY KEY AUTOINCREMENT";
  }
  _type_bigInteger(col) {
    return "INTEGER";
  }
  _type_binary(col) {
    return "BLOB";
  }
  _type_boolean(col) {
    return "INTEGER";
  } // Store boolean as 0/1
  _type_char(col) {
    return `CHAR(${col.length})`;
  } // TEXT affinity
  _type_date(col) {
    return "DATE";
  } // TEXT affinity
  _type_dateTime(col) {
    return "DATETIME";
  } // TEXT affinity
  _type_dateTimeTz(col) {
    return "DATETIME";
  } // No timezone storage
  _type_decimal(col) {
    return "NUMERIC";
  }
  _type_double(col) {
    return "REAL";
  }
  _type_enum(col) {
    return `TEXT CHECK( ${this.wrap(col.name)} IN (${col.allowed
      .map((v) => this._queryGrammar.formatBinding(v))
      .join(",")}) )`;
  } // Use CHECK
  _type_float(col) {
    return "REAL";
  }
  _type_geometry(col) {
    return "BLOB";
  } // Requires SpatiaLite extension usually
  _type_geometryCollection(col) {
    return "BLOB";
  }
  _type_id(col) {
    return "INTEGER PRIMARY KEY AUTOINCREMENT";
  }
  _type_increments(col) {
    return "INTEGER PRIMARY KEY AUTOINCREMENT";
  }
  _type_integer(col) {
    return "INTEGER";
  }
  _type_ipAddress(col) {
    return "TEXT";
  }
  _type_json(col) {
    return "TEXT";
  } // Store JSON as text
  _type_jsonb(col) {
    return "TEXT";
  }
  _type_lineString(col) {
    return "BLOB";
  }
  _type_longText(col) {
    return "TEXT";
  }
  _type_macAddress(col) {
    return "TEXT";
  }
  _type_mediumIncrements(col) {
    return "INTEGER PRIMARY KEY AUTOINCREMENT";
  }
  _type_mediumInteger(col) {
    return "INTEGER";
  }
  _type_mediumText(col) {
    return "TEXT";
  }
  _type_multiLineString(col) {
    return "BLOB";
  }
  _type_multiPoint(col) {
    return "BLOB";
  }
  _type_multiPolygon(col) {
    return "BLOB";
  }
  _type_point(col) {
    return "BLOB";
  }
  _type_polygon(col) {
    return "BLOB";
  }
  _type_set(col) {
    return "TEXT";
  } // Store as comma-separated string? Or TEXT + CHECK
  _type_smallIncrements(col) {
    return "INTEGER PRIMARY KEY AUTOINCREMENT";
  }
  _type_smallInteger(col) {
    return "INTEGER";
  }
  _type_softDeletes(col) {
    return "DATETIME";
  }
  _type_softDeletesTz(col) {
    return "DATETIME";
  }
  _type_string(col) {
    return `VARCHAR(${col.length})`;
  } // TEXT affinity
  _type_text(col) {
    return "TEXT";
  }
  _type_time(col) {
    return "TIME";
  } // TEXT affinity
  _type_timeTz(col) {
    return "TIME";
  }
  _type_timestamp(col) {
    return "DATETIME";
  }
  _type_timestampTz(col) {
    return "DATETIME";
  }
  _type_tinyIncrements(col) {
    return "INTEGER PRIMARY KEY AUTOINCREMENT";
  }
  _type_tinyInteger(col) {
    return "INTEGER";
  }
  _type_tinyText(col) {
    return "TEXT";
  }
  _type_ulid(col) {
    return "TEXT";
  } // Store ULID as text
  _type_uuid(col) {
    return "TEXT";
  } // Store UUID as text
  _type_year(col) {
    return "INTEGER";
  }

  // --- Modifier Compilation ---
  _modifyUnsigned() {
    return "";
  } // Not applicable
  _modifyCharset(col) {
    return "";
  }
  _modifyCollation(col) {
    return `COLLATE ${col.modifiers.collation}`;
  }
  _modifyNullable() {
    return "NULL";
  }
  _modifyNotNullable() {
    return "NOT NULL";
  }
  _modifyDefault(col) {
    return `DEFAULT ${this._formatDefaultValue(col.modifiers.default)}`;
  }
  _modifyAutoIncrement() {
    return "";
  } // Handled by PRIMARY KEY + INTEGER type
  _modifyComment(col) {
    return "";
  } // Not supported
  _modifyStoredAs(col) {
    return `AS (${col.modifiers.storedAs}) STORED`;
  }
  _modifyVirtualAs(col) {
    return `AS (${col.modifiers.virtualAs}) VIRTUAL`;
  }
  _modifyPrimary() {
    return "PRIMARY KEY";
  } // Inline
  _modifyUnique() {
    return "UNIQUE";
  } // Inline
  _modifyFirst() {
    return "";
  }
  _modifyAfter(col) {
    return "";
  }

  // --- Constraint Compilation ---
  // SQLite requires constraints usually defined within CREATE TABLE
  _getInlineConstraints(blueprint) {
    const constraints = [];
    let primaryCols = [];
    blueprint.definitions.forEach((def) => {
      if (def.type === "primary") primaryCols = def.columns;
      if (def.type === "unique")
        constraints.push(
          `CONSTRAINT ${this.wrap(
            def.name || `${def.columns.join("_")}_unique`
          )} UNIQUE (${this.columnize(def.columns)})`
        );
      if (def.type === "foreign") {
        let sql = `CONSTRAINT ${this.wrap(
          def.name || `${def.columns.join("_")}_foreign`
        )} FOREIGN KEY (${this.columnize(
          def.columns
        )}) REFERENCES ${this.wrapTable(def.on)} (${this.columnize(
          def.references
        )})`;
        if (def.onDelete)
          sql += ` ON DELETE ${this._formatForeignKeyAction(def.onDelete)}`;
        if (def.onUpdate)
          sql += ` ON UPDATE ${this._formatForeignKeyAction(def.onUpdate)}`;
        constraints.push(sql);
      }
      // Inline column constraints (PK/Unique defined via modifier) handled in _getColumns/_getModifiers
    });
    // Add composite primary key if defined separately
    if (primaryCols.length > 0) {
      constraints.unshift(`PRIMARY KEY (${this.columnize(primaryCols)})`);
    }
    return constraints;
  }

  // Separate constraints are generally not added via ALTER in SQLite
  _compileConstraintPrimary(tableName, definition) {
    return null;
  }
  _compileConstraintUnique(tableName, definition) {
    return null;
  }
  _compileConstraintForeign(tableName, definition) {
    return null;
  }

  // Index commands can be run separately
  _compileCreateIndex(tableName, definition) {
    const columns = this.columnize(definition.columns);
    const name = this.wrap(
      definition.name || `${tableName}_${definition.columns.join("_")}_index`
    );
    return `CREATE INDEX ${name} ON ${this.wrapTable(tableName)} (${columns})`;
  }
  _compileConstraintIndex(tableName, definition) {
    return this._compileCreateIndex(tableName, definition);
  } // Alias
  _compileConstraintSpatialIndex(tableName, definition) {
    console.warn(
      "NodeORM Schema (SQLite): Spatial indexes require the SpatiaLite extension."
    );
    return null; // Basic SQLite doesn't support spatial indexes
  }

  _formatForeignKeyAction(action) {
    return BaseSchemaGrammar.prototype._formatForeignKeyAction(action);
  } // Reuse base logic
}
