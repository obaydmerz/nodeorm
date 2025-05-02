import { Schema } from '../singleton.js';
import { debugLog } from '../utils/helpers.js';

/**
 * @fileoverview Manages the migration state stored in the database.
 */

export class MigrationStateRepository {
    /** @type {import('../connection/Connection.js').Connection} */
    connection;
    /** @type {string} */
    tableName;

    /**
     * @param {import('../connection/Connection.js').Connection} connection
     * @param {string} tableName Name of the migrations state table.
     */
    constructor(connection, tableName) {
        this.connection = connection;
        this.tableName = tableName;
    }

    /**
     * Ensure the migrations table exists.
     * @returns {Promise<void>}
     */
    async ensureTableExists() {
        const schema = Schema.connection(this.connection); // Use specific connection
        if (!(await schema.hasTable(this.tableName))) {
            await schema.create(this.tableName, (table) => {
                table.increments('id');
                table.string('migration').unique(); // Store migration file name
                table.integer('batch'); // Batch number for rollbacks
            });
            debugLog(`NodeORM Migrator: Created migrations table '${this.tableName}'.`);
        }
    }

    /**
     * Get the list of migration names that have already run.
     * @returns {Promise<string[]>}
     */
    async getRanMigrations() {
        await this.ensureTableExists();
        const results = await this.connection.table(this.tableName)
                                     .select('migration')
                                     .orderBy('batch', 'asc')
                                     .orderBy('migration', 'asc') // Consistent ordering
                                     .get();
        return results.map(r => r.migration);
    }

    /**
     * Get the last batch number used.
     * @returns {Promise<number>}
     */
    async getLastBatchNumber() {
        await this.ensureTableExists();
        const lastBatch = await this.connection.table(this.tableName).max('batch');
        return Number(lastBatch) || 0;
    }

    /**
     * Log that a migration has run.
     * @param {string} fileName Migration file name.
     * @param {number} batch Batch number.
     * @returns {Promise<void>}
     */
    async log(fileName, batch) {
        await this.ensureTableExists();
        await this.connection.table(this.tableName).insert({
            migration: fileName,
            batch: batch
        });
    }

    /**
     * Delete a migration record (used for rollback).
     * @param {string} fileName Migration file name.
     * @returns {Promise<void>}
     */
    async delete(fileName) {
        await this.ensureTableExists();
        await this.connection.table(this.tableName).where('migration', fileName).delete();
    }

    /**
     * Get migrations for the last batch.
     * @returns {Promise<Array<{id: number, migration: string, batch: number}>>}
     */
    async getLastBatch() {
        await this.ensureTableExists();
        const lastBatchNumber = await this.getLastBatchNumber();
        if (lastBatchNumber === 0) return [];
        return await this.connection.table(this.tableName)
                        .where('batch', lastBatchNumber)
                        .orderBy('migration', 'desc') // Rollback in reverse order
                        .get();
    }
}