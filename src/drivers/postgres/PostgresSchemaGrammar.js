/**
 * @fileoverview PostgreSQL specific Schema grammar compiler.
 */
import { BaseSchemaGrammar } from '../../schema/BaseSchemaGrammar.js';
import { QueryError } from '../../errors.js';

/**
 * PostgreSQL specific Schema grammar.
 */
export class PostgresSchemaGrammar extends BaseSchemaGrammar {

    /** @inheritdoc */
    compileCreate(tableName, blueprint) {
        let sql = `CREATE TABLE ${this.wrapTable(tableName)} (\n    `;
        const columns = this._getColumns(blueprint);
        // Find separate primary/unique constraints defined via blueprint methods
        const constraints = this._getConstraintsSql(tableName, blueprint, ['primary', 'unique']);

        sql += [...columns, ...constraints].join(',\n    ');
        sql += `\n)`;

        const commands = [sql];

        // Add separate index commands (CREATE INDEX)
        commands.push(...this._getCreateIndexCommands(tableName, blueprint));

        // Add column comments if any
        commands.push(...this._getCommentCommands(tableName, blueprint));

        return commands;
    }

    /** @inheritdoc */
    compileAlter(tableName, blueprint) {
        const commands = [];
        blueprint.definitions.forEach(def => {
             switch (def.type) {
                  case 'column':
                       // Basic ADD COLUMN support
                       commands.push(this._compileAddColumn(tableName, def));
                       break;
                  case 'index':
                       commands.push(this._compileCreateIndex(tableName, def));
                       break;
                   case 'unique':
                         commands.push(this._compileConstraintUnique(tableName, def));
                         break;
                    case 'primary':
                          // Add primary key constraint (often done separately in ALTER)
                          commands.push(this._compileConstraintPrimary(tableName, def));
                          break;
                    case 'foreign':
                         commands.push(this._compileConstraintForeign(tableName, def));
                         break;
                     // TODO: Add support for renameColumn, dropColumn, dropIndex etc.
                     // These require more specific Blueprint commands.
                     default:
                          console.warn(`NodeORM Schema (Postgres): Alter operation type '${def.type}' not fully supported yet.`);
             }
        });
        return commands;
    }

     /** Compile ADD COLUMN statement */
     _compileAddColumn(tableName, column) {
         const columnSql = `${this.wrap(column.name)} ${this._getType(column)} ${this._getModifiers(column)}`.trim();
         return `ALTER TABLE ${this.wrapTable(tableName)} ADD COLUMN ${columnSql}`;
     }

    /** @inheritdoc */
    compileRename(from, to) {
         return `ALTER TABLE ${this.wrapTable(from)} RENAME TO ${this.wrapTable(to)}`;
    }

    // Note: Postgres doesn't typically need session variables for FK checks during DDL like MySQL
    /** @inheritdoc */
    compileEnableForeignKeyConstraints() { return null; /* Not typically needed */ }
    /** @inheritdoc */
    compileDisableForeignKeyConstraints() { return null; /* Not typically needed */ }

    /** @inheritdoc */
    compileColumnListing(tableName) {
        const parts = tableName.split('.');
        const table = this.wrap(parts.pop());
        const schema = this.wrap(parts.pop() || 'public');
        return `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = ${table} ORDER BY ordinal_position`;
    }

    /** @inheritdoc */
    compileTableExists(tableName) {
         const parts = tableName.split('.');
         const table = this.wrap(parts.pop());
         const schema = this.wrap(parts.pop() || 'public');
         return `SELECT * FROM information_schema.tables WHERE table_schema = ${schema} AND table_name = ${table}`;
    }

    // --- Type Compilation ---
    _type_bigIncrements(col) { return 'BIGSERIAL PRIMARY KEY'; }
    _type_bigInteger(col) { return 'BIGINT'; }
    _type_binary(col) { return 'BYTEA'; }
    _type_boolean(col) { return 'BOOLEAN'; }
    _type_char(col) { return `CHAR(${col.length})`; }
    _type_date(col) { return 'DATE'; }
    _type_dateTime(col) { return `TIMESTAMP(${col.precision})`; }
    _type_dateTimeTz(col) { return `TIMESTAMPTZ(${col.precision})`; }
    _type_decimal(col) { return `DECIMAL(${col.total}, ${col.places})`; }
    _type_double(col) { return 'DOUBLE PRECISION'; }
    _type_enum(col) {
        // Note: Requires creating the TYPE beforehand or using CHECK constraint
        // This just returns the type name assuming it exists.
        return `"${col.name}_enum"`; // Assuming type named after column
        // Or return `VARCHAR(255) CHECK (${this.wrap(col.name)} IN (${col.allowed.map(v => this._queryGrammar.formatBinding(v)).join(',')}))`;
    }
    _type_float(col) { return 'REAL'; } // Or DECIMAL depending on precision needs
    _type_geometry(col) { return `GEOMETRY(${col.subtype || 'Geometry'}, ${col.srid || 0})`; }
    _type_geometryCollection(col) { return `GEOMETRY(GeometryCollection, ${col.srid || 0})`; }
    _type_id(col) { return 'BIGSERIAL PRIMARY KEY'; }
    _type_increments(col) { return 'SERIAL PRIMARY KEY'; }
    _type_integer(col) { return 'INTEGER'; }
    _type_ipAddress(col) { return 'INET'; }
    _type_json(col) { return 'JSON'; }
    _type_jsonb(col) { return 'JSONB'; }
    _type_lineString(col) { return `GEOMETRY(LineString, ${col.srid || 0})`; }
    _type_longText(col) { return 'TEXT'; }
    _type_macAddress(col) { return 'MACADDR'; }
    _type_mediumIncrements(col) { return 'SERIAL PRIMARY KEY'; } // No direct mediumint serial
    _type_mediumInteger(col) { return 'INTEGER'; } // No direct mediumint
    _type_mediumText(col) { return 'TEXT'; }
    _type_multiLineString(col) { return `GEOMETRY(MultiLineString, ${col.srid || 0})`; }
    _type_multiPoint(col) { return `GEOMETRY(MultiPoint, ${col.srid || 0})`; }
    _type_multiPolygon(col) { return `GEOMETRY(MultiPolygon, ${col.srid || 0})`; }
    _type_point(col) { return `GEOMETRY(Point, ${col.srid || 0})`; }
    _type_polygon(col) { return `GEOMETRY(Polygon, ${col.srid || 0})`; }
    _type_set(col) { throw new QueryError('SET data type is not supported by PostgreSQL.'); }
    _type_smallIncrements(col) { return 'SMALLSERIAL PRIMARY KEY'; }
    _type_smallInteger(col) { return 'SMALLINT'; }
    _type_softDeletes(col) { return `TIMESTAMP(${col.precision ?? 0})`; }
    _type_softDeletesTz(col) { return `TIMESTAMPTZ(${col.precision ?? 0})`; }
    _type_string(col) { return `VARCHAR(${col.length})`; }
    _type_text(col) { return 'TEXT'; }
    _type_time(col) { return `TIME(${col.precision})`; }
    _type_timeTz(col) { return `TIMETZ(${col.precision})`; }
    _type_timestamp(col) { return `TIMESTAMP(${col.precision})`; }
    _type_timestampTz(col) { return `TIMESTAMPTZ(${col.precision})`; }
    _type_tinyIncrements(col) { return 'SMALLSERIAL PRIMARY KEY'; } // No direct tinyint serial
    _type_tinyInteger(col) { return 'SMALLINT'; } // No direct tinyint
    _type_tinyText(col) { return 'TEXT'; }
    _type_ulid(col) { return 'CHAR(26)'; } // Or UUID if preferred
    _type_uuid(col) { return 'UUID'; }
    _type_year(col) { return 'INTEGER'; } // Store year as integer

    // --- Modifier Compilation ---
    _modifyUnsigned() { return ''; } // Not applicable directly in PG type
    _modifyCharset(col) { return ''; } // Defined at DB/Table level
    _modifyCollation(col) { return `COLLATE "${col.modifiers.collation}"`; }
    _modifyNullable() { return 'NULL'; }
    _modifyNotNullable() { return 'NOT NULL'; }
    _modifyDefault(col) { return `DEFAULT ${this._formatDefaultValue(col.modifiers.default)}`; }
    _modifyAutoIncrement() { return ''; } // Handled by SERIAL types
    _modifyComment(col) { /* Handled via separate command */ return ''; }
    _modifyStoredAs(col) { return `GENERATED ALWAYS AS (${col.modifiers.storedAs}) STORED`; }
    _modifyVirtualAs(col) { return `GENERATED ALWAYS AS (${col.modifiers.virtualAs}) STORED`; } // PG requires STORED for generated
    _modifyPrimary() { return 'PRIMARY KEY'; } // Inline
    _modifyUnique() { return 'UNIQUE'; } // Inline
    _modifyFirst() { return ''; } // Not supported
    _modifyAfter(col) { return ''; } // Not supported

    // --- Constraint Compilation ---
    _compileConstraintPrimary(tableName, definition) {
        const columns = this.columnize(definition.columns);
        const name = this.wrap(definition.name || `${tableName}_pkey`);
        return `ALTER TABLE ${this.wrapTable(tableName)} ADD CONSTRAINT ${name} PRIMARY KEY (${columns})`;
    }
    _compileConstraintUnique(tableName, definition) {
         const columns = this.columnize(definition.columns);
         const name = this.wrap(definition.name || `${tableName}_${definition.columns.join('_')}_unique`);
         return `ALTER TABLE ${this.wrapTable(tableName)} ADD CONSTRAINT ${name} UNIQUE (${columns})`;
    }
    _compileConstraintIndex(tableName, definition) {
        // Compiled separately by _getCreateIndexCommands
        return null;
    }
    _compileConstraintForeign(tableName, definition) {
         const columns = this.columnize(definition.columns);
         const refColumns = this.columnize(definition.references);
         const refTable = this.wrapTable(definition.on);
         const name = this.wrap(definition.name || `${tableName}_${definition.columns.join('_')}_foreign`);
         let sql = `ALTER TABLE ${this.wrapTable(tableName)} ADD CONSTRAINT ${name} FOREIGN KEY (${columns}) REFERENCES ${refTable} (${refColumns})`;
         if (definition.onDelete) sql += ` ON DELETE ${this._formatForeignKeyAction(definition.onDelete)}`;
         if (definition.onUpdate) sql += ` ON UPDATE ${this._formatForeignKeyAction(definition.onUpdate)}`;
         return sql;
    }
    _compileConstraintSpatialIndex(tableName, definition) {
        const columns = this.columnize(definition.columns);
        const name = this.wrap(definition.name || `${tableName}_${definition.columns.join('_')}_spatial_index`);
        return `CREATE INDEX ${name} ON ${this.wrapTable(tableName)} USING GIST (${columns})`;
    }

    // --- Helper Methods ---
    _getConstraintsSql(tableName, blueprint, types) {
         return blueprint.definitions
             .filter(def => types.includes(def.type))
             .map(def => {
                 // Get inline constraint definitions (e.g., for CREATE TABLE)
                 if (def.type === 'primary') return `PRIMARY KEY (${this.columnize(def.columns)})`;
                 if (def.type === 'unique') return `CONSTRAINT ${this.wrap(def.name || `${tableName}_${def.columns.join('_')}_unique`)} UNIQUE (${this.columnize(def.columns)})`;
                 if (def.type === 'foreign') {
                      let sql = `CONSTRAINT ${this.wrap(def.name || `${tableName}_${def.columns.join('_')}_foreign`)} FOREIGN KEY (${this.columnize(def.columns)}) REFERENCES ${this.wrapTable(def.on)} (${this.columnize(def.references)})`;
                       if (def.onDelete) sql += ` ON DELETE ${this._formatForeignKeyAction(def.onDelete)}`;
                       if (def.onUpdate) sql += ` ON UPDATE ${this._formatForeignKeyAction(def.onUpdate)}`;
                       return sql;
                 }
                 return null;
             }).filter(Boolean);
    }

    _getCreateIndexCommands(tableName, blueprint) {
         return blueprint.definitions
             .filter(def => def.type === 'index' || def.type === 'spatialIndex')
             .map(def => {
                  const columns = this.columnize(def.columns);
                  const name = this.wrap(def.name || `${tableName}_${def.columns.join('_')}_index`);
                  const using = def.type === 'spatialIndex' ? ' USING GIST' : '';
                  return `CREATE INDEX ${name} ON ${this.wrapTable(tableName)}${using} (${columns})`;
             });
    }

    _getCommentCommands(tableName, blueprint) {
         return blueprint.definitions
             .filter(def => def.type === 'column' && def.modifiers?.comment)
             .map(def => {
                  const column = this.wrap(def.name);
                  const comment = this._queryGrammar.formatBinding(def.modifiers.comment); // Format as string literal
                  return `COMMENT ON COLUMN ${this.wrapTable(tableName)}.${column} IS ${comment}`;
             });
    }

    _formatForeignKeyAction(action) {
         const upperAction = action.toUpperCase();
         return ['CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION', 'SET DEFAULT'].includes(upperAction)
              ? upperAction : 'NO ACTION'; // Default safety
    }
}