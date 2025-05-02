/**
 * @fileoverview Basic programmatic migration runner.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { MigrationStateRepository } from "./MigrationStateRepository.js";
import { Schema } from "../singleton.js";
import { debugLog, debugWarn } from "../utils/helpers.js";

export class Migrator {
  /** @type {import('../connection/Connection.js').Connection} */
  connection;
  /** @type {string} */
  migrationsPath;
  /** @type {MigrationStateRepository} */
  repository;
  /** @type {string} */
  migrationTable = "nodeorm_migrations";

  /**
   * @param {import('../connection/Connection.js').Connection} connection
   * @param {string} migrationsPath Absolute path to the migrations directory.
   */
  constructor(connection, migrationsPath) {
    this.connection = connection;
    this.migrationsPath = migrationsPath;
    this.repository = new MigrationStateRepository(
      this.connection,
      this.migrationTable
    );
  }

  /**
   * Run all pending "up" migrations.
   * @returns {Promise<string[]>} List of migrations that were run.
   */
  async latest() {
    await this.repository.ensureTableExists();
    const ran = await this.repository.getRanMigrations();
    const allFiles = await this._getMigrationFiles();
    const pending = allFiles.filter((file) => !ran.includes(file));

    if (pending.length === 0) {
      debugLog("NodeORM Migrator: No pending migrations to run.");
      return [];
    }

    const nextBatch = (await this.repository.getLastBatchNumber()) + 1;
    const runMigrations = [];

    debugLog(`NodeORM Migrator: Running batch ${nextBatch}...`);
    for (const file of pending) {
      await this._runUp(file, nextBatch);
      runMigrations.push(file);
    }
    debugLog(`NodeORM Migrator: Batch ${nextBatch} completed.`);

    return runMigrations;
  }

  /**
   * Rollback the last batch of migrations.
   * @returns {Promise<string[]>} List of migrations that were rolled back.
   */
  async rollback() {
    await this.repository.ensureTableExists();
    const lastBatchMigrations = await this.repository.getLastBatch();

    if (lastBatchMigrations.length === 0) {
      debugLog(
        "NodeORM Migrator: No migrations in the last batch to rollback."
      );
      return [];
    }

    const rolledBackMigrations = [];
    debugLog(
      `NodeORM Migrator: Rolling back last batch (${lastBatchMigrations[0]?.batch})...`
    );

    // Migrations are already sorted in reverse order by repository.getLastBatch()
    for (const migration of lastBatchMigrations) {
      await this._runDown(migration.migration);
      rolledBackMigrations.push(migration.migration);
    }
    debugLog(`NodeORM Migrator: Rollback completed.`);
    return rolledBackMigrations;
  }

  /**
   * Run the "up" method for a specific migration file.
   * @param {string} file Migration file name.
   * @param {number} batch Batch number.
   * @private
   */
  async _runUp(file, batch) {
    const migration = await this._resolveMigration(file);
    if (!migration || typeof migration.up !== "function") {
      throw new Error(
        `Migration file '${file}' is invalid or does not export an 'up' function.`
      );
    }
    const schema = Schema.connection(this.connection); // Schema facade for this connection
    debugLog(`NodeORM Migrator: Migrating ${file}...`);
    const startTime = Date.now();
    // Run within a transaction? Maybe optional later. For now, run directly.
    await migration.up(schema, this.connection); // Pass schema and connection
    const duration = Date.now() - startTime;
    await this.repository.log(file, batch);
    debugLog(`NodeORM Migrator: Migrated ${file} (${duration}ms)`);
  }

  /**
   * Run the "down" method for a specific migration file.
   * @param {string} file Migration file name.
   * @private
   */
  async _runDown(file) {
    const migration = await this._resolveMigration(file);
    if (!migration || typeof migration.down !== "function") {
      debugWarn(
        `NodeORM Migrator: Migration file '${file}' has no 'down' method. Skipping rollback for this file.`
      );
      // Still remove from repository if desired? Yes, assume rollback means remove record.
      await this.repository.delete(file);
      return;
    }
    const schema = Schema.connection(this.connection);
    debugLog(`NodeORM Migrator: Rolling back ${file}...`);
    const startTime = Date.now();
    await migration.down(schema, this.connection);
    const duration = Date.now() - startTime;
    await this.repository.delete(file);
    debugLog(`NodeORM Migrator: Rolled back ${file} (${duration}ms)`);
  }

  /**
   * Dynamically import a migration file.
   * @param {string} file File name.
   * @returns {Promise<{up: Function, down?: Function}>}
   * @private
   */
  async _resolveMigration(file) {
    const filePath = path.resolve(this.migrationsPath, file);
    try {
      // Use dynamic import()
      const migrationModule = await import(`file://${filePath}`); // Need file:// protocol for absolute paths
      return migrationModule;
    } catch (e) {
      throw e;
    }
  }

  /**
   * Get all migration file names from the migrations path, sorted.
   * @returns {Promise<string[]>}
   * @private
   */
  async _getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      // Filter for .js files and sort alphabetically (timestamps ensure order)
      return files.filter((file) => file.endsWith(".js")).sort();
    } catch (e) {
      if (e.code === "ENOENT") {
        debugWarn(
          `NodeORM Migrator: Migrations directory not found at '${this.migrationsPath}'.`
        );
        return [];
      }
      
      throw e;
    }
  }
}
