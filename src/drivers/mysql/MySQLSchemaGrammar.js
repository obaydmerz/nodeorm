/**
 * @fileoverview MySQL specific Schema grammar compiler.
 */
import { BaseSchemaGrammar } from "../../schema/BaseSchemaGrammar.js";

/**
 * MySQL specific Schema grammar.
 */
export class MySQLSchemaGrammar extends BaseSchemaGrammar {
  /** @inheritdoc */
  compileCreate(tableName, blueprint) {
    const columns = this._getColumns(blueprint).join(",\n    ");
    // Get primary/unique/index constraints defined *inline* with columns
    const inlineConstraints =
      this._getInlineConstraints(blueprint).join(",\n    ");
    // Get constraints defined separately
    const separateConstraints = this._getConstraints(tableName, blueprint).join(
      ",\n    "
    ); // TODO: Filter only those applicable in CREATE

    let sql = `CREATE TABLE ${this.wrapTable(tableName)} (\n    ${columns}`;
    if (inlineConstraints) sql += `,\n    ${inlineConstraints}`;
    // Add separate constraints here if needed (e.g., composite primary key) - needs refinement
    // if (separateConstraints) sql += `,\n    ${separateConstraints}`;
    sql += `\n)`;

    // Add table options (engine, charset, collation)
    sql += this._compileTableOptions(blueprint);

    return [sql]; // MySQL CREATE TABLE is usually a single command
  }

  /** @inheritdoc */
  compileAlter(tableName, blueprint) {
    const commands = [];
    // TODO: Implement logic to generate ALTER TABLE ADD/MODIFY/DROP COLUMN/INDEX etc.
    // This requires comparing the blueprint to the existing schema or processing specific commands.
    // For now, it's a placeholder.
    console.warn(
      "NodeORM Schema: compileAlter is not fully implemented for MySQL."
    );
    // Example structure:
    // blueprint.definitions.forEach(def => {
    //     if (def.type === 'column' && def.change) commands.push(this._compileModifyColumn(tableName, def));
    //     else if (def.type === 'column') commands.push(this._compileAddColumn(tableName, def));
    //     // ... handle dropColumn, addIndex, dropIndex etc.
    // });
    return commands;
  }

  /** @inheritdoc */
  compileRename(from, to) {
    return `RENAME TABLE ${this.wrapTable(from)} TO ${this.wrapTable(to)}`;
  }

  /** @inheritdoc */
  compileEnableForeignKeyConstraints() {
    return "SET FOREIGN_KEY_CHECKS=1;";
  }
  /** @inheritdoc */
  compileDisableForeignKeyConstraints() {
    return "SET FOREIGN_KEY_CHECKS=0;";
  }

  /** @inheritdoc */
  compileColumnListing(tableName) {
    // Extract table name without potential schema prefix for information_schema query
    const plainTableName = tableName.includes(".")
      ? tableName.split(".").pop()
      : tableName;
    // Assuming connection config has database name
    // Note: This relies on the connection's configured database name which might not be robust.
    // A better approach might require passing the database name explicitly.
    return `SELECT COLUMN_NAME as name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${plainTableName}' ORDER BY ORDINAL_POSITION`;
  }

  /** @inheritdoc */
  compileTableExists(tableName) {
    const plainTableName = tableName.includes(".")
      ? tableName.split(".").pop()
      : tableName;
    return `SELECT * FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '${plainTableName}'`;
  }

  // --- Type Compilation ---
  _type_bigIncrements(col) {
    return "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY";
  } // Combined
  _type_bigInteger(col) {
    return "BIGINT";
  }
  _type_binary(col) {
    return "BLOB";
  }
  _type_boolean(col) {
    return "TINYINT(1)";
  }
  _type_char(col) {
    return `CHAR(${col.length})`;
  }
  _type_date(col) {
    return "DATE";
  }
  _type_dateTime(col) {
    return `DATETIME(${col.precision})`;
  }
  _type_dateTimeTz(col) {
    return `TIMESTAMP(${col.precision})`;
  } // MySQL TIMESTAMP stores UTC
  _type_decimal(col) {
    return `DECIMAL(${col.total}, ${col.places})`;
  }
  _type_double(col) {
    return `DOUBLE${col.total ? `(${col.total}, ${col.places})` : ""}`;
  }
  _type_enum(col) {
    return `ENUM(${col.allowed
      .map((v) => this._queryGrammar.formatBinding(v))
      .join(",")})`;
  }
  _type_float(col) {
    return `FLOAT${col.total ? `(${col.total}, ${col.places})` : ""}`;
  }
  _type_geometry(col) {
    return "GEOMETRY";
  }
  _type_geometryCollection(col) {
    return "GEOMETRYCOLLECTION";
  }
  _type_id(col) {
    return "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY";
  }
  _type_increments(col) {
    return "INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY";
  }
  _type_integer(col) {
    return "INT";
  }
  _type_ipAddress(col) {
    return "VARCHAR(45)";
  }
  _type_json(col) {
    return "JSON";
  }
  _type_jsonb(col) {
    return "JSON";
  } // MySQL uses JSON type
  _type_lineString(col) {
    return "LINESTRING";
  }
  _type_longText(col) {
    return "LONGTEXT";
  }
  _type_macAddress(col) {
    return "VARCHAR(17)";
  }
  _type_mediumIncrements(col) {
    return "MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY";
  }
  _type_mediumInteger(col) {
    return "MEDIUMINT";
  }
  _type_mediumText(col) {
    return "MEDIUMTEXT";
  }
  _type_multiLineString(col) {
    return "MULTILINESTRING";
  }
  _type_multiPoint(col) {
    return "MULTIPOINT";
  }
  _type_multiPolygon(col) {
    return "MULTIPOLYGON";
  }
  _type_point(col) {
    return "POINT";
  }
  _type_polygon(col) {
    return "POLYGON";
  }
  _type_set(col) {
    return `SET(${col.allowed
      .map((v) => this._queryGrammar.formatBinding(v))
      .join(",")})`;
  }
  _type_smallIncrements(col) {
    return "SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY";
  }
  _type_smallInteger(col) {
    return "SMALLINT";
  }
  _type_softDeletes(col) {
    return `DATETIME(${col.precision ?? 0})`;
  } // Underlying type
  _type_softDeletesTz(col) {
    return `TIMESTAMP(${col.precision ?? 0})`;
  } // Underlying type
  _type_string(col) {
    return `VARCHAR(${col.length})`;
  }
  _type_text(col) {
    return "TEXT";
  }
  _type_time(col) {
    return `TIME(${col.precision})`;
  }
  _type_timeTz(col) {
    return `TIME(${col.precision})`;
  } // MySQL TIME doesn't store TZ
  _type_timestamp(col) {
    return `DATETIME(${col.precision})`;
  } // Recommend DATETIME for MySQL
  _type_timestampTz(col) {
    return `TIMESTAMP(${col.precision})`;
  } // MySQL TIMESTAMP stores UTC
  _type_tinyIncrements(col) {
    return "TINYINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY";
  }
  _type_tinyInteger(col) {
    return "TINYINT";
  }
  _type_tinyText(col) {
    return "TINYTEXT";
  }
  _type_ulid(col) {
    return "CHAR(26)";
  }
  _type_uuid(col) {
    return "CHAR(36)";
  } // Or BINARY(16) if preferred
  _type_year(col) {
    return "YEAR";
  }

  // --- Modifier Compilation ---
  _modifyAutoIncrement() {
    return "AUTO_INCREMENT";
  }
  // Override others if MySQL differs significantly

  // --- Helper Methods ---
  _compileTableOptions(blueprint) {
    // TODO: Extract engine, charset, collation from blueprint options if set
    const engine = "ENGINE=InnoDB"; // Default
    const charset = "DEFAULT CHARACTER SET=utf8mb4";
    const collation = "COLLATE=utf8mb4_unicode_ci";
    return ` ${engine} ${charset} ${collation}`;
  }

  _getInlineConstraints(blueprint) {
    // TODO: fix constraints present on both col and end.
    return [];

    // In MySQL, PRIMARY KEY and UNIQUE can often be defined inline with the column
    // This helper extracts those modifiers if present.
    const constraints = [];
    blueprint.definitions
      .filter((def) => def.type === "column")
      .forEach((col) => {
        if (col.modifiers?.primary && !col.columnType.includes("Increments")) {
          // Increments handled separately
          constraints.push(`PRIMARY KEY (${this.wrap(col.name)})`); // Add PK constraint
        }
        if (col.modifiers?.unique) {
          constraints.push(
            `UNIQUE KEY ${this.wrap(
              col.modifiers.uniqueConstraintName || `${col.name}_unique`
            )} (${this.wrap(col.name)})`
          );
        }
        // Inline index modifier? Less common in CREATE TABLE
        // if (col.modifiers?.index) { ... }
      });
    return constraints;
  }

  /** @inheritdoc */
  compileAlter(tableName, blueprint) {
    const commands = [];
    blueprint.definitions.forEach((def) => {
      switch (def.type) {
        case "column":
          // Basic ADD COLUMN support
          // TODO: Detect if it's a modification vs add based on blueprint/diffing
          commands.push(this._compileAddColumn(tableName, def));
          break;
        case "index":
          commands.push(this._compileAddIndex(tableName, def));
          break;
        case "unique":
          commands.push(this._compileAddUnique(tableName, def));
          break;
        case "primary":
          commands.push(this._compileAddPrimary(tableName, def));
          break;
        case "foreign":
          commands.push(this._compileAddForeign(tableName, def));
          break;
        case "spatialIndex":
          commands.push(this._compileAddSpatialIndex(tableName, def));
          break;
        // TODO: Add renameColumn, dropColumn, dropIndex etc.
        default:
          console.warn(
            `NodeORM Schema (MySQL): Alter operation type '${def.type}' not fully supported yet.`
          );
      }
    });
    return commands.filter(Boolean); // Filter out null commands
  }

  /** Compile ADD COLUMN statement */
  _compileAddColumn(tableName, column) {
    const columnSql = `${this.wrap(column.name)} ${this._getType(
      column
    )} ${this._getModifiers(column)}`.trim();
    // Handle 'after' and 'first' modifiers for MySQL ADD COLUMN
    let position = "";
    if (column.modifiers?.first) position = " FIRST";
    else if (column.modifiers?.after)
      position = ` AFTER ${this.wrap(column.modifiers.after)}`;
    return `ALTER TABLE ${this.wrapTable(
      tableName
    )} ADD COLUMN ${columnSql}${position}`;
  }

  /** Compile ADD INDEX statement */
  _compileAddIndex(tableName, definition) {
    const columns = this.columnize(definition.columns);
    const name = this.wrap(
      definition.name || `${tableName}_${definition.columns.join("_")}_index`
    );
    return `ALTER TABLE ${this.wrapTable(
      tableName
    )} ADD INDEX ${name} (${columns})`;
  }

  /** Compile ADD UNIQUE statement */
  _compileAddUnique(tableName, definition) {
    const columns = this.columnize(definition.columns);
    const name = this.wrap(
      definition.name || `${tableName}_${definition.columns.join("_")}_unique`
    );
    return `ALTER TABLE ${this.wrapTable(
      tableName
    )} ADD CONSTRAINT ${name} UNIQUE (${columns})`;
  }

  /** Compile ADD PRIMARY statement */
  _compileAddPrimary(tableName, definition) {
    const columns = this.columnize(definition.columns);
    // MySQL typically doesn't allow adding primary key via named constraint easily in ALTER, just ADD PRIMARY KEY
    return `ALTER TABLE ${this.wrapTable(
      tableName
    )} ADD PRIMARY KEY (${columns})`;
  }

  /** Compile ADD FOREIGN statement */
  _compileAddForeign(tableName, definition) {
    const columns = this.columnize(definition.columns);
    const refColumns = this.columnize(definition.references);
    const refTable = this.wrapTable(definition.on);
    const name = this.wrap(
      definition.name || `${tableName}_${definition.columns.join("_")}_foreign`
    );
    let sql = `ALTER TABLE ${this.wrapTable(
      tableName
    )} ADD CONSTRAINT ${name} FOREIGN KEY (${columns}) REFERENCES ${refTable} (${refColumns})`;
    if (definition.onDelete)
      sql += ` ON DELETE ${this._formatForeignKeyAction(definition.onDelete)}`;
    if (definition.onUpdate)
      sql += ` ON UPDATE ${this._formatForeignKeyAction(definition.onUpdate)}`;
    return sql;
  }

  /** Compile ADD SPATIAL INDEX statement */
  _compileAddSpatialIndex(tableName, definition) {
    const columns = this.columnize(definition.columns);
    const name = this.wrap(
      definition.name || `${tableName}_${definition.columns.join("_")}_spatial`
    );
    return `ALTER TABLE ${this.wrapTable(
      tableName
    )} ADD SPATIAL INDEX ${name} (${columns})`;
  }

  _formatForeignKeyAction(action) {
    return BaseSchemaGrammar.prototype._formatForeignKeyAction(action);
  }
}
