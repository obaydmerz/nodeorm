// blueprint.js

/**
 * Represents a database table structure definition, similar to Laravel's Blueprint.
 * Allows defining columns, indices, and constraints using a fluent API.
 */
class Blueprint {
    /**
     * @type {Array<object>} Stores the definitions for columns, indices, etc.
     */
    definitions = [];

    /**
     * @type {object|null} Reference to the last added column/command definition for applying modifiers.
     */
    #currentDefinition = null;

    constructor() {
        this.definitions = [];
        this.#currentDefinition = null;
    }

    /**
     * Adds a command/definition to the blueprint.
     * @param {string} type - The type of definition (e.g., 'column', 'index', 'primary').
     * @param {string|null} name - The name (e.g., column name, index name).
     * @param {object} options - Additional options specific to the command type.
     * @returns {Blueprint} The Blueprint instance for chaining.
     * @private
     */
    _addCommand(type, name = null, options = {}) {
        options.modifiers = options.modifiers || {};

        const definition = { type, name, ...options };
        this.definitions.push(definition);
        // Only column definitions should be modifiable by subsequent chained methods like nullable()
        if (type === 'column') {
            this.#currentDefinition = definition;
        } else {
             // Reset current definition if it's not a column (e.g., index, primary key)
             // Modifiers generally apply to columns.
            this.#currentDefinition = null;
        }
        return this;
    }

    /**
     * Apply a modifier to the last defined column.
     * @param {string} modifierName - The name of the modifier (e.g., 'nullable').
     * @param {*} value - The value for the modifier.
     * @returns {Blueprint} The Blueprint instance for chaining.
     * @private
     */
    _addModifier(modifierName, value = true) {
        if (!this.#currentDefinition || this.#currentDefinition.type !== 'column') {
            throw new Error(`Modifier [${modifierName}] must be applied to a column definition.`);
        }
        this.#currentDefinition.modifiers[modifierName] = value;
        return this;
    }

    //--------------------------------------------------------------------------
    // Column Types
    //--------------------------------------------------------------------------

    /**
     * Create a new big auto-incrementing integer (8-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    bigIncrements(column) {
        return this.bigInteger(column).primary().autoIncrement();
    }

    /**
     * Create a new big integer (8-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    bigInteger(column) {
        return this._addCommand('column', column, { columnType: 'bigInteger' });
    }

    /**
     * Create a new binary column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    binary(column) {
        return this._addCommand('column', column, { columnType: 'binary' });
    }

    /**
     * Create a new boolean column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    boolean(column) {
        return this._addCommand('column', column, { columnType: 'boolean' });
    }

    /**
     * Create a new char column on the table.
     * @param {string} column Name of the column.
     * @param {number} [length=255] Length of the char column.
     * @returns {Blueprint}
     */
    char(column, length = 255) {
        return this._addCommand('column', column, { columnType: 'char', length });
    }

    /**
     * Create a new date column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    date(column) {
        return this._addCommand('column', column, { columnType: 'date' });
    }

    /**
     * Create a new date-time column on the table.
     * @param {string} column Name of the column.
     * @param {number} [precision=0] Precision for the column.
     * @returns {Blueprint}
     */
    dateTime(column, precision = 0) {
        return this._addCommand('column', column, { columnType: 'dateTime', precision });
    }

    /**
     * Create a new date-time column (with timezone) on the table.
     * @param {string} column Name of the column.
     * @param {number} [precision=0] Precision for the column.
     * @returns {Blueprint}
     */
    dateTimeTz(column, precision = 0) {
        return this._addCommand('column', column, { columnType: 'dateTimeTz', precision });
    }

    /**
     * Create a new decimal column on the table.
     * @param {string} column Name of the column.
     * @param {number} [total=8] Total digits.
     * @param {number} [places=2] Decimal places.
     * @returns {Blueprint}
     */
    decimal(column, total = 8, places = 2) {
        return this._addCommand('column', column, { columnType: 'decimal', total, places });
    }

    /**
     * Create a new double column on the table.
     * @param {string} column Name of the column.
     * @param {number|null} [total=null] Total digits (database specific).
     * @param {number|null} [places=null] Decimal places (database specific).
     * @returns {Blueprint}
     */
    double(column, total = null, places = null) {
        return this._addCommand('column', column, { columnType: 'double', total, places });
    }

    /**
     * Create a new enum column on the table.
     * @param {string} column Name of the column.
     * @param {Array<string>} allowed Allowed enum values.
     * @returns {Blueprint}
     */
    enum(column, allowed) {
        if (!Array.isArray(allowed) || allowed.length === 0) {
            throw new Error('Enum column requires an array of allowed values.');
        }
        return this._addCommand('column', column, { columnType: 'enum', allowed });
    }

    /**
     * Create a new float column on the table.
     * @param {string} column Name of the column.
     * @param {number} [total=8] Total digits.
     * @param {number} [places=2] Decimal places.
     * @returns {Blueprint}
     */
    float(column, total = 8, places = 2) {
        return this._addCommand('column', column, { columnType: 'float', total, places });
    }

    /**
     * Create a new foreign ID column (unsigned big integer) on the table.
     * Use `.constrained()` afterwards to add the foreign key constraint.
     * @param {string} column Name of the column (e.g., 'user_id').
     * @returns {Blueprint}
     */
    foreignId(column) {
        return this.unsignedBigInteger(column);
    }

    /**
     * Add a foreign ID column for the given model.
     * @param {object|string} model The model class or its table name.
     * @param {string} [column=null] Optional custom column name.
     * @returns {Blueprint}
     */
    foreignIdFor(model, column = null) {
        const tableName = typeof model === 'string' ? model : (model.tableName || model.name.toLowerCase() + 's'); // Basic guess
        const columnName = column || `${tableName.replace(/s$/, '')}_id`;
        return this.foreignId(columnName);
    }

    /**
      * Create a new foreign ULID column on the table.
      * Use `.constrained()` afterwards to add the foreign key constraint.
      * @param {string} column Name of the column.
      * @returns {Blueprint}
      */
     foreignUlid(column) {
        return this._addCommand('column', column, { columnType: 'char', length: 26 }); // ULIDs are 26 chars
     }

    /**
      * Create a new foreign UUID column on the table.
      * Use `.constrained()` afterwards to add the foreign key constraint.
      * @param {string} column Name of the column.
      * @returns {Blueprint}
      */
    foreignUuid(column) {
        return this.uuid(column);
    }

    /**
     * Create a new geometry column on the table.
     * @param {string} column Name of the column.
     * @param {string|null} [subtype=null] E.g., 'point', 'polygon'. Varies by DB.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    geometry(column, subtype = null, srid = null) {
        return this._addCommand('column', column, { columnType: 'geometry', subtype, srid });
    }

    /**
     * Create a new geometry collection column on the table.
     * @param {string} column Name of the column.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    geometryCollection(column, srid = null) {
        return this._addCommand('column', column, { columnType: 'geometryCollection', srid });
    }

    /**
     * Create a primary key auto-incrementing big integer (8-byte) column named 'id'.
     * @param {string} [column='id'] Name of the column.
     * @returns {Blueprint}
     */
    id(column = 'id') {
        return this.bigIncrements(column); // .primary() is called within bigIncrements
    }

    /**
     * Create a new auto-incrementing integer (4-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    increments(column) {
        return this._addCommand('column', column, { columnType: 'increments' }).primary();
    }

    /**
     * Create a new integer (4-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    integer(column) {
        return this._addCommand('column', column, { columnType: 'integer' });
    }

    /**
     * Create a new IP address column on the table. (Usually VARCHAR)
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    ipAddress(column) {
        return this._addCommand('column', column, { columnType: 'ipAddress' }); // Often maps to VARCHAR(45)
    }

    /**
     * Create a new JSON column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    json(column) {
        return this._addCommand('column', column, { columnType: 'json' });
    }

    /**
     * Create a new JSONB column on the table. (Binary JSON, PostgreSQL specific)
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    jsonb(column) {
        return this._addCommand('column', column, { columnType: 'jsonb' });
    }

    /**
     * Create a new line string column on the table. (Geometry)
     * @param {string} column Name of the column.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    lineString(column, srid = null) {
        return this._addCommand('column', column, { columnType: 'lineString', srid });
    }

    /**
     * Create a new long text column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    longText(column) {
        return this._addCommand('column', column, { columnType: 'longText' });
    }

    /**
     * Create a new MAC address column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    macAddress(column) {
        return this._addCommand('column', column, { columnType: 'macAddress' }); // Often maps to VARCHAR(17)
    }

    /**
     * Create a new auto-incrementing medium integer (3-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    mediumIncrements(column) {
        return this.mediumInteger(column).primary().autoIncrement();
    }

    /**
     * Create a new medium integer (3-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    mediumInteger(column) {
        return this._addCommand('column', column, { columnType: 'mediumInteger' });
    }

    /**
     * Create a new medium text column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    mediumText(column) {
        return this._addCommand('column', column, { columnType: 'mediumText' });
    }

    /**
     * Adds nullable `*_id` (unsigned big integer) and `*_type` (string) columns.
     * @param {string} name The base name for the morph columns (e.g., 'taggable').
     * @param {string|null} [indexName=null] Optional custom index name.
     * @returns {Blueprint}
     */
    morphs(name, indexName = null) {
        const idColumn = `${name}_id`;
        const typeColumn = `${name}_type`;
        this.unsignedBigInteger(idColumn);
        this.string(typeColumn);
        this.index([idColumn, typeColumn], indexName); // Add index after defining columns
        this.#currentDefinition = null; // Reset currentDefinition after compound operation
        return this;
    }

    /**
     * Adds nullable `*_id` (unsigned big integer) and `*_type` (string) columns.
     * Alias for `morphs()` followed by `nullable()` on both columns (implicitly).
     * @param {string} name The base name for the morph columns (e.g., 'taggable').
     * @param {string|null} [indexName=null] Optional custom index name.
     * @returns {Blueprint}
     */
    nullableMorphs(name, indexName = null) {
        const idColumn = `${name}_id`;
        const typeColumn = `${name}_type`;
        this.unsignedBigInteger(idColumn).nullable();
        this.string(typeColumn).nullable();
        this.index([idColumn, typeColumn], indexName);
        this.#currentDefinition = null;
        return this;
    }

    /**
     * Adds nullable `*_id` (ULID) and `*_type` (string) columns.
     * @param {string} name The base name for the morph columns.
     * @param {string|null} [indexName=null] Optional custom index name.
     * @returns {Blueprint}
     */
    ulidMorphs(name, indexName = null) {
        const idColumn = `${name}_id`;
        const typeColumn = `${name}_type`;
        this.ulid(idColumn);
        this.string(typeColumn);
        this.index([idColumn, typeColumn], indexName);
        this.#currentDefinition = null;
        return this;
    }

    /**
    * Adds nullable `*_id` (ULID) and `*_type` (string) columns.
    * @param {string} name The base name for the morph columns.
    * @param {string|null} [indexName=null] Optional custom index name.
    * @returns {Blueprint}
    */
    nullableUlidMorphs(name, indexName = null) {
        const idColumn = `${name}_id`;
        const typeColumn = `${name}_type`;
        this.ulid(idColumn).nullable();
        this.string(typeColumn).nullable();
        this.index([idColumn, typeColumn], indexName);
        this.#currentDefinition = null;
        return this;
    }

    /**
     * Adds nullable `*_id` (UUID) and `*_type` (string) columns.
     * @param {string} name The base name for the morph columns.
     * @param {string|null} [indexName=null] Optional custom index name.
     * @returns {Blueprint}
     */
    uuidMorphs(name, indexName = null) {
        const idColumn = `${name}_id`;
        const typeColumn = `${name}_type`;
        this.uuid(idColumn);
        this.string(typeColumn);
        this.index([idColumn, typeColumn], indexName);
        this.#currentDefinition = null;
        return this;
    }

   /**
    * Adds nullable `*_id` (UUID) and `*_type` (string) columns.
    * @param {string} name The base name for the morph columns.
    * @param {string|null} [indexName=null] Optional custom index name.
    * @returns {Blueprint}
    */
   nullableUuidMorphs(name, indexName = null) {
        const idColumn = `${name}_id`;
        const typeColumn = `${name}_type`;
        this.uuid(idColumn).nullable();
        this.string(typeColumn).nullable();
        this.index([idColumn, typeColumn], indexName);
        this.#currentDefinition = null;
        return this;
   }

    /**
     * Create a new multi-line string column on the table. (Geometry)
     * @param {string} column Name of the column.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    multiLineString(column, srid = null) {
        return this._addCommand('column', column, { columnType: 'multiLineString', srid });
    }

    /**
     * Create a new multi-point column on the table. (Geometry)
     * @param {string} column Name of the column.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    multiPoint(column, srid = null) {
        return this._addCommand('column', column, { columnType: 'multiPoint', srid });
    }

    /**
     * Create a new multi-polygon column on the table. (Geometry)
     * @param {string} column Name of the column.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    multiPolygon(column, srid = null) {
        return this._addCommand('column', column, { columnType: 'multiPolygon', srid });
    }

    /**
     * Create a new point column on the table. (Geometry)
     * @param {string} column Name of the column.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    point(column, srid = null) {
        return this._addCommand('column', column, { columnType: 'point', srid });
    }

    /**
     * Create a new polygon column on the table. (Geometry)
     * @param {string} column Name of the column.
     * @param {number|null} [srid=null] Spatial Reference System Identifier.
     * @returns {Blueprint}
     */
    polygon(column, srid = null) {
        return this._addCommand('column', column, { columnType: 'polygon', srid });
    }

    /**
     * Adds the `remember_token` column (VARCHAR(100) nullable) to the table.
     * @returns {Blueprint}
     */
    rememberToken() {
        return this.string('remember_token', 100).nullable();
    }

    /**
     * Create a new set column on the table. (MySQL specific)
     * @param {string} column Name of the column.
     * @param {Array<string>} allowed Allowed set values.
     * @returns {Blueprint}
     */
    set(column, allowed) {
         if (!Array.isArray(allowed) || allowed.length === 0) {
            throw new Error('Set column requires an array of allowed values.');
        }
        return this._addCommand('column', column, { columnType: 'set', allowed });
    }

    /**
     * Create a new auto-incrementing small integer (2-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    smallIncrements(column) {
        return this.smallInteger(column).primary().autoIncrement();
    }

    /**
     * Create a new small integer (2-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    smallInteger(column) {
        return this._addCommand('column', column, { columnType: 'smallInteger' });
    }

    /**
     * Adds a nullable `deleted_at` timestamp column for soft deletes.
     * @param {string} [column='deleted_at'] Name of the column.
     * @param {number} [precision=0] Precision for the timestamp.
     * @returns {Blueprint}
     */
    softDeletes(column = 'deleted_at', precision = 0) {
        return this.timestamp(column, precision).nullable();
    }

    /**
     * Adds a nullable `deleted_at` timestamp (with timezone) column for soft deletes.
     * @param {string} [column='deleted_at'] Name of the column.
     * @param {number} [precision=0] Precision for the timestamp.
     * @returns {Blueprint}
     */
    softDeletesTz(column = 'deleted_at', precision = 0) {
        return this.timestampTz(column, precision).nullable();
    }

    /**
     * Create a new string column (usually VARCHAR) on the table.
     * @param {string} column Name of the column.
     * @param {number} [length=255] Length of the string column.
     * @returns {Blueprint}
     */
    string(column, length = 255) {
        return this._addCommand('column', column, { columnType: 'string', length });
    }

    /**
     * Create a new text column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    text(column) {
        return this._addCommand('column', column, { columnType: 'text' });
    }

    /**
     * Create a new time column on the table.
     * @param {string} column Name of the column.
     * @param {number} [precision=0] Precision for the column.
     * @returns {Blueprint}
     */
    time(column, precision = 0) {
        return this._addCommand('column', column, { columnType: 'time', precision });
    }

    /**
     * Create a new time column (with timezone) on the table.
     * @param {string} column Name of the column.
     * @param {number} [precision=0] Precision for the column.
     * @returns {Blueprint}
     */
    timeTz(column, precision = 0) {
        return this._addCommand('column', column, { columnType: 'timeTz', precision });
    }

    /**
     * Create a new timestamp column on the table.
     * @param {string} column Name of the column.
     * @param {number} [precision=0] Precision for the column.
     * @returns {Blueprint}
     */
    timestamp(column, precision = 0) {
        return this._addCommand('column', column, { columnType: 'timestamp', precision });
    }

    /**
     * Create a new timestamp column (with timezone) on the table.
     * @param {string} column Name of the column.
     * @param {number} [precision=0] Precision for the column.
     * @returns {Blueprint}
     */
    timestampTz(column, precision = 0) {
        return this._addCommand('column', column, { columnType: 'timestampTz', precision });
    }

    /**
     * Adds nullable `created_at` and `updated_at` timestamp columns.
     * @param {number} [precision=0] Precision for the timestamps.
     * @returns {Blueprint}
     */
    timestamps(precision = 0) {
        this.timestamp('created_at', precision).nullable();
        this.timestamp('updated_at', precision).nullable();
        this.#currentDefinition = null; // Reset after compound operation
        return this;
    }

   /**
     * Adds nullable `created_at` and `updated_at` timestamp (with timezone) columns.
     * @param {number} [precision=0] Precision for the timestamps.
     * @returns {Blueprint}
     */
    timestampsTz(precision = 0) {
        this.timestampTz('created_at', precision).nullable();
        this.timestampTz('updated_at', precision).nullable();
        this.#currentDefinition = null; // Reset after compound operation
        return this;
    }

   /**
     * Adds nullable `created_at` and `updated_at` timestamp columns.
     * Alias for timestamps().nullable() - though timestamps() already makes them nullable.
     * @param {number} [precision=0] Precision for the timestamps.
     * @returns {Blueprint}
     */
    nullableTimestamps(precision = 0) {
        return this.timestamps(precision);
    }


    /**
     * Create a new auto-incrementing tiny integer (1-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    tinyIncrements(column) {
        return this.tinyInteger(column).primary();
    }

    /**
     * Create a new tiny integer (1-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    tinyInteger(column) {
        return this._addCommand('column', column, { columnType: 'tinyInteger' });
    }

    /**
     * Create a new tiny text column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    tinyText(column) {
        return this._addCommand('column', column, { columnType: 'tinyText' });
    }

    /**
     * Create a new ULID column on the table. Often used as primary key.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    ulid(column) {
        // Typically CHAR(26) or BINARY(16) depending on storage preference/DB
        return this._addCommand('column', column, { columnType: 'ulid' }); // Represent as specific type
    }


    /**
     * Create a new unsigned big integer (8-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    unsignedBigInteger(column) {
        return this._addCommand('column', column, { columnType: 'bigInteger' }).unsigned();
    }

    /**
     * Create a new unsigned decimal column on the table.
     * @param {string} column Name of the column.
     * @param {number} [total=8] Total digits.
     * @param {number} [places=2] Decimal places.
     * @returns {Blueprint}
     */
    unsignedDecimal(column, total = 8, places = 2) {
        return this._addCommand('column', column, { columnType: 'decimal', total, places }).unsigned();
    }

    /**
     * Create a new unsigned integer (4-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    unsignedInteger(column) {
        return this._addCommand('column', column, { columnType: 'integer' }).unsigned();
    }

    /**
     * Create a new unsigned medium integer (3-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    unsignedMediumInteger(column) {
        return this._addCommand('column', column, { columnType: 'mediumInteger' }).unsigned();
    }

    /**
     * Create a new unsigned small integer (2-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    unsignedSmallInteger(column) {
        return this._addCommand('column', column, { columnType: 'smallInteger' }).unsigned();
    }

    /**
     * Create a new unsigned tiny integer (1-byte) column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    unsignedTinyInteger(column) {
        return this._addCommand('column', column, { columnType: 'tinyInteger' }).unsigned();
    }

    /**
     * Create a new UUID column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    uuid(column) {
        return this._addCommand('column', column, { columnType: 'uuid' });
    }

    /**
     * Create a new year column on the table.
     * @param {string} column Name of the column.
     * @returns {Blueprint}
     */
    year(column) {
        return this._addCommand('column', column, { columnType: 'year' });
    }


    //--------------------------------------------------------------------------
    // Column Modifiers
    //--------------------------------------------------------------------------

    /**
     * Place the column "after" another column (MySQL).
     * @param {string} column The column to place this one after.
     * @returns {Blueprint}
     */
    after(column) {
        return this._addModifier('after', column);
    }

    /**
     * Set INTEGER column generation behavior (MySQL). Not typically needed with increments methods.
     * @returns {Blueprint}
     */
    autoIncrement() {
        return this._addModifier('autoIncrement', true);
    }

    /**
     * Specify a character set for the column (MySQL).
     * @param {string} charset Character set name (e.g., 'utf8mb4').
     * @returns {Blueprint}
     */
    charset(charset) {
        return this._addModifier('charset', charset);
    }

    /**
     * Specify a collation for the column (MySQL/PostgreSQL/SQL Server).
     * @param {string} collation Collation name (e.g., 'utf8mb4_unicode_ci').
     * @returns {Blueprint}
     */
    collation(collation) {
        return this._addModifier('collation', collation);
    }

    /**
     * Add a comment to the column (MySQL/PostgreSQL).
     * @param {string} comment The comment text.
     * @returns {Blueprint}
     */
    comment(comment) {
        return this._addModifier('comment', comment);
    }

    /**
     * Specify a "default" value for the column.
     * @param {*} value Default value.
     * @returns {Blueprint}
     */
    default(value) {
        return this._addModifier('default', value);
    }

    /**
     * Place the column "first" in the table (MySQL).
     * @returns {Blueprint}
     */
    first() {
        return this._addModifier('first', true);
    }

    /**
     * Specify the column as invisible (MySQL).
     * @returns {Blueprint}
     */
     invisible() {
        return this._addModifier('invisible', true);
    }

    /**
     * Allow NULL values to be inserted into the column.
     * @param {boolean} [value=true] Whether the column should be nullable.
     * @returns {Blueprint}
     */
    nullable(value = true) {
        return this._addModifier('nullable', value);
    }

    /**
     * Specify the column is a "stored" generated column (MySQL/PostgreSQL).
     * @param {string} expression The generation expression.
     * @returns {Blueprint}
     */
    storedAs(expression) {
        return this._addModifier('storedAs', expression);
    }

    /**
     * Set the INTEGER column as UNSIGNED (MySQL). Applied automatically by unsigned methods.
     * @returns {Blueprint}
     */
    unsigned() {
        return this._addModifier('unsigned', true);
    }

    /**
     * Set the TIMESTAMP column to use CURRENT_TIMESTAMP as default value.
     * @returns {Blueprint}
     */
    useCurrent() {
        return this._addModifier('useCurrent', true);
    }

    /**
     * Set the TIMESTAMP column to use CURRENT_TIMESTAMP when updating (MySQL).
     * @returns {Blueprint}
     */
    useCurrentOnUpdate() {
        return this._addModifier('useCurrentOnUpdate', true);
    }

    /**
     * Specify the column is a "virtual" generated column (MySQL/PostgreSQL/SQLite).
     * @param {string} expression The generation expression.
     * @returns {Blueprint}
     */
    virtualAs(expression) {
        return this._addModifier('virtualAs', expression);
    }

    /**
     * Marks the column as always generated (PostgreSQL).
     * @param {string} expression The generation expression.
     * @returns {Blueprint}
     */
    always(expression = null) {
         // In Laravel, `always()` can be chained after `storedAs` or `virtualAs`
         // Here we combine it slightly. If expression is given, it implies generated.
         if (expression) {
             // Decide virtual or stored? Laravel defaults to virtual if not specified.
             this._addModifier('virtualAs', expression);
         }
         return this._addModifier('generatedAlways', true);
    }

    //--------------------------------------------------------------------------
    // Index / Constraint Commands (added as separate definitions)
    //--------------------------------------------------------------------------

    /**
     * Specify a primary key for the table. Can be applied to a single column
     * definition directly, or defined separately for composite keys.
     * @param {string|Array<string>|null} [columns=null] Column(s) for the primary key. If null, applies to the current column.
     * @param {string|null} [name=null] Optional name for the constraint.
     * @returns {Blueprint}
     */
    primary(columns = null, name = null) {
        if (columns === null && this.#currentDefinition && this.#currentDefinition.type === 'column') {
            // Apply to current column definition
            this._addModifier('primary', true);
            if (name) this._addModifier('primaryConstraintName', name);
        } else {
             if (columns === null) {
                 throw new Error('Primary key requires column name(s) unless chained directly after a column definition.');
             }
            // Add as a separate command for single or composite keys
            const cols = Array.isArray(columns) ? columns : [columns];
            this._addCommand('primary', name, { columns: cols });
        }
        return this;
    }

    /**
     * Specify a unique index for the table. Can be applied to a single column
     * definition directly, or defined separately for composite indices.
     * @param {string|Array<string>|null} [columns=null] Column(s) for the unique index. If null, applies to the current column.
     * @param {string|null} [name=null] Optional name for the index.
     * @returns {Blueprint}
     */
    unique(columns = null, name = null) {
        if (columns === null && this.#currentDefinition && this.#currentDefinition.type === 'column') {
            this._addModifier('unique', true);
            if (name) this._addModifier('uniqueConstraintName', name);
        } else {
             if (columns === null) {
                 throw new Error('Unique index requires column name(s) unless chained directly after a column definition.');
             }
            const cols = Array.isArray(columns) ? columns : [columns];
            this._addCommand('unique', name, { columns: cols });
        }
        return this;
    }

    /**
     * Specify an index for the table. Can be applied to a single column
     * definition directly, or defined separately for composite indices.
     * @param {string|Array<string>|null} [columns=null] Column(s) for the index. If null, applies to the current column.
     * @param {string|null} [name=null] Optional name for the index.
     * @returns {Blueprint}
     */
    index(columns = null, name = null) {
        if (columns === null && this.#currentDefinition && this.#currentDefinition.type === 'column') {
            this._addModifier('index', true);
             if (name) this._addModifier('indexName', name);
        } else {
            if (columns === null) {
                 throw new Error('Index requires column name(s) unless chained directly after a column definition.');
             }
            const cols = Array.isArray(columns) ? columns : [columns];
            this._addCommand('index', name, { columns: cols });
        }
        return this;
    }

     /**
     * Specify a spatial index for the table (MySQL/PostgreSQL).
     * @param {string|Array<string>} columns Column(s) for the spatial index.
     * @param {string|null} [name=null] Optional name for the index.
     * @returns {Blueprint}
     */
    spatialIndex(columns, name = null) {
        const cols = Array.isArray(columns) ? columns : [columns];
        return this._addCommand('spatialIndex', name, { columns: cols });
    }

    /**
     * Specify a foreign key constraint. Typically used via foreignId().constrained().
     * This provides the lower-level interface.
     * @param {string|Array<string>} columns The column(s) in this table.
     * @param {string|null} [name=null] Optional name for the constraint.
     * @returns {object} Returns an object with methods references(), on(), onDelete(), onUpdate() for chaining.
     */
    foreign(columns, name = null) {
        const cols = Array.isArray(columns) ? columns : [columns];
        const definition = {
            type: 'foreign',
            name,
            columns: cols,
            references: null,
            on: null,
            onDelete: null,
            onUpdate: null,
        };
        this.definitions.push(definition);
        this.#currentDefinition = null; // Foreign isn't chainable with standard column modifiers

        // Return a chainable object to define the rest of the foreign key
        const foreignChain = {
            references: (refColumns) => {
                definition.references = Array.isArray(refColumns) ? refColumns : [refColumns];
                return foreignChain;
            },
            on: (table) => {
                definition.on = table;
                return foreignChain;
            },
            onDelete: (action) => { // 'cascade', 'restrict', 'set null', 'no action', 'set default'
                definition.onDelete = action;
                return foreignChain;
            },
            onUpdate: (action) => { // 'cascade', 'restrict', 'set null', 'no action', 'set default'
                definition.onUpdate = action;
                return foreignChain;
            },
             // Allow ending the chain and returning the blueprint if needed, although usually not necessary
             // as foreign() returns its own chain object.
            __blueprint: this
        };
        return foreignChain;
    }

     /**
     * Adds a foreign key constraint to the last defined foreignId/foreignUuid/etc. column.
     * @param {string|null} [table=null] The referenced table (e.g., 'users'). Guessed if null.
     * @param {string} [column='id'] The referenced column (e.g., 'id').
     * @returns {Blueprint}
     */
    constrained(table = null, column = 'id') {
        if (!this.#currentDefinition || this.#currentDefinition.type !== 'column') {
            throw new Error('`.constrained()` must be called after a foreign ID column definition (e.g., `foreignId`, `foreignUuid`).');
        }

        const localColumn = this.#currentDefinition.name;
        // Basic guessing for table name: remove '_id' and pluralize (very simplistic)
        const referencedTable = table || localColumn.replace(/_id$/, '') + 's';

        this.foreign(localColumn)
            .references(column)
            .on(referencedTable); // Add default onDelete/onUpdate later if needed

        // Reset currentDefinition as the main action now is the foreign key constraint
        // Note: This prevents further modifiers on the column itself after .constrained()
        // This matches Laravel's behavior where constrained usually terminates the column chain part.
        this.#currentDefinition = null;
        return this;
    }
}

export { Blueprint }