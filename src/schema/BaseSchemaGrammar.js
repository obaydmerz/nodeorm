/**
 * @fileoverview Abstract base class for Schema grammar compilers.
 */
import { Blueprint } from './Blueprint.js';
import { QueryError } from '../errors.js';

/**
 * @typedef {import('../drivers/BaseGrammar.js').BaseGrammar} BaseQueryGrammar For identifier wrapping
 */

/**
 * Abstract base class for compiling Blueprint definitions into DDL SQL strings.
 */
export class BaseSchemaGrammar {
    /** @type {BaseQueryGrammar} For accessing identifier wrapping etc. */
    _queryGrammar;

    constructor(queryGrammar) {
        this._queryGrammar = queryGrammar;
    }

    /** Wrap an identifier using the query grammar's wrapper. */
    wrap(value) { return this._queryGrammar.wrap(value); }
    /** Wrap a table name. */
    wrapTable(table) { return this._queryGrammar.wrapTable(table); }

    /**
     * Compile a create table command.
     * @param {string} tableName
     * @param {Blueprint} blueprint
     * @returns {string[]} Array of SQL commands.
     */
    compileCreate(tableName, blueprint) {
        throw new Error("compileCreate method must be implemented by grammar.");
    }

    /**
     * Compile an alter table command.
     * @param {string} tableName
     * @param {Blueprint} blueprint
     * @returns {string[]} Array of SQL commands.
     */
    compileAlter(tableName, blueprint) {
        throw new Error("compileAlter method must be implemented by grammar.");
    }

    /**
     * Compile a drop table command.
     * @param {string} tableName
     * @returns {string} SQL command.
     */
    compileDrop(tableName) {
        return `DROP TABLE ${this.wrapTable(tableName)}`;
    }

    /**
     * Compile a drop table if exists command.
     * @param {string} tableName
     * @returns {string} SQL command.
     */
    compileDropIfExists(tableName) {
        return `DROP TABLE IF EXISTS ${this.wrapTable(tableName)}`;
    }

    /**
     * Compile a rename table command.
     * @param {string} from
     * @param {string} to
     * @returns {string} SQL command.
     */
    compileRename(from, to) {
         return `RENAME TABLE ${this.wrapTable(from)} TO ${this.wrapTable(to)}`; // ANSI standard, check overrides
    }

     /** Compile a command to enable foreign key constraints. */
     compileEnableForeignKeyConstraints() { return null; /* Often session based */ }
     /** Compile a command to disable foreign key constraints. */
     compileDisableForeignKeyConstraints() { return null; /* Often session based */ }
     /** Compile a command to get column listing. */
     compileColumnListing(tableName) { throw new Error("compileColumnListing must be implemented."); }
     /** Compile a command to check if table exists. */
     compileTableExists(tableName) { throw new Error("compileTableExists must be implemented."); }


    // --- Helpers for compiling definitions ---

    /**
     * Compile column definitions into SQL fragments.
     * @param {Blueprint} blueprint
     * @returns {string[]}
     * @protected
     */
    _getColumns(blueprint) {
        return blueprint.definitions
            .filter(def => def.type === 'column')
            .map(column => `${this.wrap(column.name)} ${this._getType(column)} ${this._getModifiers(column)}`.trim());
    }

    /**
     * Get the SQL data type for a column definition.
     * @param {object} column Column definition from Blueprint.
     * @returns {string}
     * @protected
     */
    _getType(column) {
        const typeMethod = `_type_${column.columnType}`;
        if (typeof this[typeMethod] !== 'function') {
            throw new QueryError(`Unsupported column type: ${column.columnType}`);
        }
        return this[typeMethod](column);
    }

    /**
     * Compile modifiers for a column definition.
     * @param {object} column Column definition from Blueprint.
     * @returns {string}
     * @protected
     */
    _getModifiers(column) {
        const modifiers = [];
        // Order matters for some DBs
        if (column.modifiers?.unsigned) modifiers.push(this._modifyUnsigned());
        if (column.modifiers?.charset) modifiers.push(this._modifyCharset(column));
        if (column.modifiers?.collation) modifiers.push(this._modifyCollation(column));
        if (column.modifiers?.nullable === false) modifiers.push(this._modifyNotNullable());
        if (column.modifiers?.nullable === true) modifiers.push(this._modifyNullable()); // Explicitly nullable if needed
        if (column.modifiers?.default !== undefined) modifiers.push(this._modifyDefault(column));
        if (column.modifiers?.autoIncrement) modifiers.push(this._modifyAutoIncrement());
        if (column.modifiers?.comment) modifiers.push(this._modifyComment(column));
        if (column.modifiers?.storedAs) modifiers.push(this._modifyStoredAs(column));
        if (column.modifiers?.virtualAs) modifiers.push(this._modifyVirtualAs(column));
        // Primary/Unique might be handled separately or as modifiers depending on grammar
        if (column.modifiers?.primary) modifiers.push(this._modifyPrimary()); // Often handled as constraint
        if (column.modifiers?.unique) modifiers.push(this._modifyUnique()); // Often handled as constraint

        return modifiers.filter(Boolean).join(' ');
    }

    // Default modifier compilations (override in specific grammars)
    _modifyUnsigned() { return 'UNSIGNED'; }
    _modifyCharset(col) { return `CHARACTER SET ${col.modifiers.charset}`; }
    _modifyCollation(col) { return `COLLATE ${col.modifiers.collation}`; }
    _modifyNotNullable() { return 'NOT NULL'; }
    _modifyNullable() { return 'NULL'; }
    _modifyDefault(col) { return `DEFAULT ${this._formatDefaultValue(col.modifiers.default)}`; }
    _modifyAutoIncrement() { return 'AUTO_INCREMENT'; } // MySQL specific
    _modifyComment(col) { return `COMMENT '${col.modifiers.comment.replace(/'/g, "''")}'`; }
    _modifyStoredAs(col) { return `AS (${col.modifiers.storedAs}) STORED`; }
    _modifyVirtualAs(col) { return `AS (${col.modifiers.virtualAs}) VIRTUAL`; }
    _modifyPrimary() { return 'PRIMARY KEY'; } // Simple inline primary key
    _modifyUnique() { return 'UNIQUE'; } // Simple inline unique

    _formatDefaultValue(value) {
         if (typeof value === 'boolean') return value ? '1' : '0';
         if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`; // Escape single quotes
         if (value === null) return 'NULL';
         return String(value); // Numbers, etc.
    }

    /**
     * Compile constraints (primary, unique, foreign, index) into SQL fragments.
     * @param {string} tableName
     * @param {Blueprint} blueprint
     * @returns {string[]}
     * @protected
     */
    _getConstraints(tableName, blueprint) {
         const constraints = [];
         blueprint.definitions.forEach(def => {
              const compileMethod = `_compileConstraint${def.type.charAt(0).toUpperCase() + def.type.slice(1)}`;
              if (typeof this[compileMethod] === 'function') {
                   const sql = this[compileMethod](tableName, def);
                   if (sql) constraints.push(sql);
              }
         });
         return constraints;
    }

    // Default constraint compilations (override needed)
    _compileConstraintPrimary(tableName, definition) {
        const columns = this.columnize(definition.columns);
        const name = this.wrap(definition.name || `${tableName}_primary`);
        return `ALTER TABLE ${this.wrapTable(tableName)} ADD CONSTRAINT ${name} PRIMARY KEY (${columns})`;
        // Or return `PRIMARY KEY (${columns})` for inline definition during CREATE
    }
    _compileConstraintUnique(tableName, definition) { /* ... */ }
    _compileConstraintIndex(tableName, definition) { /* ... */ }
    _compileConstraintForeign(tableName, definition) { /* ... */ }
    _compileConstraintSpatialIndex(tableName, definition) { /* ... */ }

}