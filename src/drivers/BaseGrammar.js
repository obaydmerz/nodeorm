/**
 * @fileoverview Abstract base class for SQL grammar compilers.
 */
import { Expression } from '../query/Expression.js';
import { formatDateForDb } from '../utils/date.js';
import { isObject } from '../utils/helpers.js';

/**
 * @typedef {import('../query/QueryBuilder.js').QueryBuilder} QueryBuilder
 */

/**
 * Abstract base class for compiling QueryBuilder components into SQL strings
 * specific to a database dialect.
 * @abstract
 */
export class BaseGrammar {

    /** @type {string} */
    _identifierWrapper = '"';
    /** @type {string[]} */
    _operators = [
        '=', '<', '>', '<=', '>=', '<>', '!=', '<=>',
        'like', 'like binary', 'not like', 'ilike',
        '&', '|', '^', '<<', '>>', '&~', 'is', 'is not', // Added IS/IS NOT
        'rlike', 'not rlike', 'regexp', 'not regexp',
        '~', '~*', '!~', '!~*', 'similar to',
        'not similar to', 'not ilike', '~~*', '!~~*',
    ];

    compileSelect(query) {
        query._applyScopes?.(); // Apply scopes just before compilation
        const parts = [
            query._distinct ? 'SELECT DISTINCT' : 'SELECT',
            this.compileColumns(query, query._selects),
            this.compileFrom(query, query._from),
            this.compileJoins(query, query._joins),
            this.compileWheres(query), // Pass the whole query
            this.compileGroups(query, query._groups),
            this.compileHavings(query), // Pass the whole query
            this.compileOrders(query, query._orders),
            this.compileLimit(query, query._limit),
            this.compileOffset(query, query._offset),
            this.compileUnions(query)
        ];
        return parts.filter(p => p).join(' ');
    }

    compileColumns(query, columns) {
        if (!columns || columns.length === 0) {
             const fromTable = query._from ? this.wrapTable(query._from) : null;
             return fromTable ? `${fromTable}.*` : '*';
        }
        return columns.map(col => this.wrap(col)).join(', ');
    }

    compileFrom(query, table) {
        return table ? `FROM ${this.wrapTable(table)}` : '';
    }

    compileJoins(query, joins) {
        if (!joins || joins.length === 0) return '';
        return joins.map(join => {
            const table = this.wrapTable(join.table);
             // Create a temporary context for compiling join conditions
             const joinQuery = {
                  _wheres: join.clauses,
                  // Crucially, pass the *main query's* bindings and addBinding method
                  // so parameters are added to the main query correctly.
                   _bindings: query._bindings,
                   addBinding: query.addBinding.bind(query)
             };
            const onClauses = this.compileWheres(joinQuery, true); // isJoin = true
            return `${join.type.toUpperCase()} JOIN ${table} ${onClauses}`;
        }).join(' ');
    }

    compileWheres(query, isJoin = false) {
        if (!query._wheres || query._wheres.length === 0) return '';
        const sql = query._wheres.map((where, index) => {
            const prefix = index === 0 ? (isJoin ? 'ON' : 'WHERE') : where.boolean.toUpperCase();
            // THIS IS THE KEY PART: Construct method name from where.type
            const compilerMethod = `_compileWhere${where.type}`;
            if (typeof this[compilerMethod] !== 'function') {
                // If this error occurs, it means QueryBuilder pushed an invalid 'type'
                throw new Error(`Unknown where type: ${where.type}`);
            }
            // Call the specific compiler (_compileWhereIn, _compileWhereNull, etc.)
            return `${prefix} ${this[compilerMethod](query, where)}`;
        }).join(' ');
        return sql;
    }

     _compileWhereBasic(query, where) {
          const value = this.parameter(where.value, query);
          return `${this.wrap(where.column)} ${where.operator} ${value}`;
     }

     _compileWhereNested(query, where) {
          // Pass the main query's bindings context to the nested compilation
          const nestedSql = this.compileWheres(where.query).replace(/^WHERE\s+/i, '');
          return `(${nestedSql})`;
     }

     _compileWhereIn(query, where) {
          const values = where.values.length > 0 ? this.parameterize(where.values, query) : '()';
          const operator = where.not ? 'NOT IN' : 'IN';
          if (where.values.length === 0 && operator === 'IN') return '0 = 1'; // Optimization
          if (where.values.length === 0 && operator === 'NOT IN') return '1 = 1'; // Optimization
          return `${this.wrap(where.column)} ${operator} (${values})`;
     }

     _compileWhereNull(query, where) {
          // Use correct IS NULL / IS NOT NULL syntax
          return `${this.wrap(where.column)} IS ${where.not ? 'NOT NULL' : 'NULL'}`;
     }

     _compileWhereBetween(query, where) {
          const lower = this.parameter(where.values[0], query);
          const upper = this.parameter(where.values[1], query);
          const operator = where.not ? 'NOT BETWEEN' : 'BETWEEN';
          // Use correct BETWEEN syntax
          return `${this.wrap(where.column)} ${operator} ${lower} AND ${upper}`;
     }

     _compileWhereBasicDate(type, query, where) {
         const value = this.parameter(where.value, query);
         const column = this.wrap(where.column);
         // Use correct DATE(), YEAR(), etc. function syntax
         return `${type}(${column}) ${where.operator} ${value}`;
     }
     _compileWhereDate(query, where) { return this._compileWhereBasicDate('DATE', query, where); }
     _compileWhereYear(query, where) { return this._compileWhereBasicDate('YEAR', query, where); }
     _compileWhereMonth(query, where) { return this._compileWhereBasicDate('MONTH', query, where); }
     _compileWhereDay(query, where) { return this._compileWhereBasicDate('DAY', query, where); }
     _compileWhereTime(query, where) { return this._compileWhereBasicDate('TIME', query, where); }

     _compileWhereColumn(query, where) {
         // Wrap both column names
         return `${this.wrap(where.first)} ${where.operator} ${this.wrap(where.second)}`;
     }

     _compileWhereExists(query, where) {
          // Compile the subquery using the main grammar instance
          const selectSql = this.compileSelect(where.query);
          // Use correct EXISTS (...) syntax
          return `${where.not ? 'NOT EXISTS' : 'EXISTS'} (${selectSql})`;
     }

     _compileWhereRaw(query, where) { return where.sql; }

    compileGroups(query, groups) {
        if (!groups || groups.length === 0) return '';
        return `GROUP BY ${groups.map(col => this.wrap(col)).join(', ')}`;
    }

     compileHavings(query) {
          if (!query._havings || query._havings.length === 0) return '';
          const sql = query._havings.map((having, index) => {
              const prefix = index === 0 ? 'HAVING' : having.boolean.toUpperCase();
              if (having.type === 'Raw') return `${prefix} ${having.sql}`;
              else if (having.type === 'Nested') {
                   const nestedSql = this.compileHavings(having.query).replace(/^HAVING\s+/i, '');
                   return `${prefix} (${nestedSql})`;
              } else {
                   const value = this.parameter(having.value, query);
                   return `${prefix} ${this.wrap(having.column)} ${having.operator} ${value}`;
              }
          }).join(' ');
          return sql;
     }

    compileOrders(query, orders) {
        if (!orders || orders.length === 0) return '';
        const clauses = orders.map(order => order.raw ? order.raw : `${this.wrap(order.column)} ${order.direction.toUpperCase()}`);
        return `ORDER BY ${clauses.join(', ')}`;
    }

    compileLimit(query, limit) { return limit > 0 ? `LIMIT ${parseInt(limit, 10)}` : ''; }
    compileOffset(query, offset) { return offset > 0 ? `OFFSET ${parseInt(offset, 10)}` : ''; }
    compileRandomOrder(seed) { return 'RAND()'; } // Default to MySQL's RAND(), SQLite uses RANDOM()

    compileUnions(query) {
        if (!query._unions || query._unions.length === 0) return '';
         return query._unions.map(union => `${union.all ? 'UNION ALL' : 'UNION'} (${this.compileSelect(union.query)})`).join(' ');
    }

    compileInsert(query, values) {
        const table = this.wrapTable(query._from);
        if (!Array.isArray(values) || values.length === 0) return `INSERT INTO ${table} DEFAULT VALUES`;
        const columns = this.columnize(Object.keys(values[0]));
        const parameters = values.map(record => `(${Object.values(record).map(value => this.parameter(value, query)).join(', ')})`).join(', ');
        return `INSERT INTO ${table} (${columns}) VALUES ${parameters}`;
    }

     compileInsertGetId(query, values, sequence) { return this.compileInsert(query, values); }

    compileUpdate(query, values) {
        const table = this.wrapTable(query._from);
        const columns = Object.keys(values).map(key => `${this.wrap(key)} = ${this.parameter(values[key], query)}`).join(', ');
        const wheres = this.compileWheres(query);
        return `UPDATE ${table} SET ${columns} ${wheres}`.trim();
    }

    compileDelete(query) {
        const table = this.wrapTable(query._from);
        const wheres = this.compileWheres(query);
        if (!wheres && query.strictMode !== false && !(query._wheres.length === 1 && query._wheres[0].type === 'In' && query._wheres[0].values.length > 0)) { // Allow delete if only constrained by whereIn (Model.destroy)
             throw new Error('Attempting to delete without a WHERE clause. Use .allowFullTableDelete() to bypass this safety check.');
        }
        return `DELETE FROM ${table} ${wheres}`.trim();
    }

    compileTruncate(query) { return `TRUNCATE TABLE ${this.wrapTable(query._from)}`; }

    wrap(value) {
        if (value instanceof Expression) return value.getValue();
        if (typeof value !== 'string') return String(value);
        if (value.includes('.')) return value.split('.').map(segment => this.wrap(segment)).join('.'); // Handle table.column
        if (value.includes(' as ')) return value.split(/\s+as\s+/i).map(segment => this.wrap(segment)).join(' AS '); // Handle alias
        if (value.includes(' ') || value.trim() === '*') return value; // Avoid wrapping complex expressions or '*'
        return this._wrapSegment(value);
    }

    _wrapSegment(segment) {
         if (segment.startsWith(this._identifierWrapper) && segment.endsWith(this._identifierWrapper)) return segment;
         const wrapper = this._identifierWrapper;
         return wrapper + segment.replace(new RegExp(`\\${wrapper}`, 'g'), wrapper + wrapper) + wrapper; // Escape wrapper for regex
    }

    wrapTable(table) {
         // Handle alias in table name: "users as u"
         if (typeof table === 'string' && table.toLowerCase().includes(' as ')) {
              const parts = table.split(/\s+as\s+/i);
              return `${this.wrap(parts[0])} AS ${this.wrap(parts[1])}`;
         }
         return this.wrap(table);
    }
    getBindingPlaceholder(index) { return '?'; }

    parameter(value, query) {
        if (value instanceof Expression) return value.getValue();
        // Add binding using the query's internal method, ensuring query context is correct
        const index = query.addBinding(value); // No need for type usually
        return this.getBindingPlaceholder(index);
    }

    parameterize(values, query) { return values.map(value => this.parameter(value, query)).join(', '); }
    columnize(columns) { return columns.map(col => this.wrap(col)).join(', '); }

    formatBinding(value) {
        if (value instanceof Date) return formatDateForDb(value);
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (value === null || value === undefined) return null;
        if (Array.isArray(value) || isObject(value)) { try { return JSON.stringify(value); } catch (e) { return null; } }
        return value;
    }
}