/**
 * @fileoverview SQLite specific SQL grammar compiler.
 */
import { debugWarn } from "../../utils/helpers.js";
import { BaseGrammar } from "../BaseGrammar.js";

/**
 * SQLite specific SQL grammar.
 */
export class SQLiteGrammar extends BaseGrammar {
  /** @inheritdoc */
  _identifierWrapper = '"'; // SQLite prefers double quotes, accepts backticks

  /** @inheritdoc */
  _operators = [
    // SQLite supported operators
    "=",
    "<",
    ">",
    "<=",
    ">=",
    "<>",
    "!=",
    "like",
    "not like",
    "glob",
    "not glob", // Added glob
    "is",
    "is not", // Added IS / IS NOT for NULL checks primarily
    "in",
    "not in",
    "between",
    "not between",
    // Bitwise might need specific functions in SQLite
  ];

  /**
   * Compile the columns for the query. SQLite doesn't use table prefixes in SELECT *.
   * @inheritdoc
   */
  compileColumns(query, columns) {
    if (!columns || columns.length === 0) {
      return "*";
    }
    return super.compileColumns(query, columns);
  }

  /**
   * Compile the LIMIT clause.
   * @inheritdoc
   */
  compileLimit(query, limit) {
    // SQLite requires LIMIT even if OFFSET is present
    return limit > 0 ? `LIMIT ${parseInt(limit, 10)}` : "";
  }

  /**
   * Compile the OFFSET clause.
   * @inheritdoc
   */
  compileOffset(query, offset) {
    // OFFSET requires LIMIT in SQLite
    return offset > 0 ? `OFFSET ${parseInt(offset, 10)}` : "";
  }

  /**
   * Compile an UPDATE statement. SQLite doesn't support JOINs or LIMIT/ORDER BY in standard UPDATE.
   * @inheritdoc
   */
  compileUpdate(query, values) {
    if (query._joins && query._joins.length > 0) {
      debugWarn(
        "NodeORM Warning: SQLite does not support JOIN clauses in UPDATE statements directly. Consider rewriting your query."
      );
      // Or potentially throw an error?
    }
    if (query._limit > 0) {
      debugWarn(
        "NodeORM Warning: SQLite does not support LIMIT clauses in standard UPDATE statements."
      );
    }

    const table = this.wrapTable(query._from);
    const columns = Object.keys(values)
      .map((key) => {
        return `${this.wrap(key)} = ${this.parameter(values[key], query)}`;
      })
      .join(", ");

    const wheres = this.compileWheres(query);

    return `UPDATE ${table} SET ${columns} ${wheres}`.trim();
  }

  /**
   * Compile a DELETE statement. SQLite doesn't support JOINs or LIMIT/ORDER BY in standard DELETE.
   * @inheritdoc
   */
  compileDelete(query) {
    if (query._joins && query._joins.length > 0) {
      debugWarn(
        "NodeORM Warning: SQLite does not support JOIN clauses in DELETE statements directly. Consider rewriting your query."
      );
    }
    if (query._limit > 0) {
      debugWarn(
        "NodeORM Warning: SQLite does not support LIMIT clauses in standard DELETE statements."
      );
    }

    const table = this.wrapTable(query._from);
    const wheres = this.compileWheres(query);

    if (!wheres && query.strictMode !== false) {
      throw new Error(
        "Attempting to delete without a WHERE clause. Use .allowFullTableDelete() to bypass this safety check."
      );
    }

    return `DELETE FROM ${table} ${wheres}`.trim();
  }

  /**
   * Compile a TRUNCATE statement. SQLite uses DELETE without WHERE.
   * This is functionally equivalent but less performant than true TRUNCATE and doesn't reset AUTOINCREMENT unless sqlite_sequence is cleared.
   * @inheritdoc
   */
  compileTruncate(query) {
    // Simulate TRUNCATE using DELETE
    const table = this.wrapTable(query._from);
    // Optionally, reset autoincrement counter: DELETE FROM sqlite_sequence WHERE name='...'
    // For simplicity, just do the delete for now.
    return `DELETE FROM ${table}`;
    // return `DELETE FROM ${table}; DELETE FROM sqlite_sequence WHERE name = '${query._from}';`; // More complete simulation
  }

  /**
   * Compile an "upsert" statement using SQLite's ON CONFLICT (...) DO UPDATE SET syntax.
   * @param {import('../../query/QueryBuilder').QueryBuilder} query
   * @param {object[]} values Values to insert/update.
   * @param {string[]} conflictTarget Columns listed in the unique constraint.
   * @param {string[]} update Columns to update on conflict. If empty, DO NOTHING.
   * @returns {string}
   */
  compileUpsert(query, values, conflictTarget, update) {
    // SQLite requires the conflict target columns directly
    if (!Array.isArray(conflictTarget) || conflictTarget.length === 0) {
      throw new Error(
        "SQLite UPSERT requires specifying the conflict target column(s)."
      );
    }
    const insertSql = this.compileInsert(query, values);
    const targetColumns = this.columnize(conflictTarget);

    if (update.length === 0) {
      // ON CONFLICT DO NOTHING
      return `${insertSql} ON CONFLICT (${targetColumns}) DO NOTHING`;
    } else {
      // ON CONFLICT DO UPDATE
      // Note: SQLite update syntax within UPSERT doesn't use EXCLUDED like Postgres.
      // It refers directly to the columns being set. The values come from the INSERT part.
      const updateAssignments = update
        .map((col) => {
          const wrappedCol = this.wrap(col);
          // Need the value from the attempted insert for this column.
          // This requires knowing the structure of 'values'. Assume 'values[0]' holds the data.
          // A better approach might be needed if multiple rows are upserted at once.
          const valueToUpdate = values[0]?.[col]; // Get value from the first row's data
          if (valueToUpdate === undefined) {
            debugWarn(
              `NodeORM Warning: Column '${col}' specified in SQLite upsert update list, but not present in the insert data.`
            );
            return null; // Skip update for this column if data is missing
          }
          // We use bindings, so parameterize the value again for the UPDATE part
          return `${wrappedCol} = ${this.parameter(valueToUpdate, query)}`;
        })
        .filter(Boolean)
        .join(", "); // Filter out nulls if any columns were skipped

      if (!updateAssignments) {
        // If all update columns were skipped, fallback to DO NOTHING
        return `${insertSql} ON CONFLICT (${targetColumns}) DO NOTHING`;
      }

      return `${insertSql} ON CONFLICT (${targetColumns}) DO UPDATE SET ${updateAssignments}`;
    }
  }

  /**
   * Prepare bindings for an update statement.
   * @param {object} bindings
   * @param {object} values
   * @returns {any[]}
   */
  prepareBindingsForUpdate(bindings, values) {
    // SQLite bindings are typically in order: SET values first, then WHERE values.
    const sortedBindings = [];
    Object.values(values).forEach((value) =>
      sortedBindings.push(this.formatBinding(value))
    );
    bindings.where?.forEach((binding) =>
      sortedBindings.push(this.formatBinding(binding))
    );
    // SQLite doesn't support JOIN updates in the same way, so join bindings aren't usually relevant here.
    return sortedBindings;
  }

  /**
   * Prepare bindings for insert.
   * @param {any[]} bindings Raw bindings array.
   * @returns {any[]} Formatted bindings.
   */
  prepareBindingsForInsert(bindings) {
    // Flatten if necessary (if insert values were nested) and format
    return bindings.flat().map((binding) => this.formatBinding(binding));
  }

  /**
   * Format boolean for SQLite (0 or 1).
   * @inheritdoc
   */
  formatBinding(value) {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    // SQLite stores dates typically as TEXT (ISO8601), INTEGER (Unix timestamp), or REAL (Julian day)
    // Sticking to TEXT ISO8601 format for simplicity via BaseGrammar's formatDateForDb
    return super.formatBinding(value);
  }
}
