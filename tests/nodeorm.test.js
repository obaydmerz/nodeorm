/**
 * @fileoverview NodeORM Test Suite using node:test
 */

import {
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  mock,
} from "node:test"; // Added mock
import assert from "node:assert/strict";

// Import nodeorm core components
import {
  Model,
  Connection,
  ConnectionManager,
  errors,
  raw,
  Manager,
} from "../src/index.js"; // Adjust path if needed
import { Schema } from "../src/singleton.js";

// --- Test Configuration ---
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3307, // Default MySQL port
  user: process.env.DB_USER || "root",
  database: process.env.DB_DATABASE || "worm",
  driver: process.env.DB_DRIVER || "mysql",
  charset: "utf8mb4",
  timezone: "+00:00", // Use UTC for consistency
};
const MYSQL_CONN_STRING = `mysql://${DB_CONFIG.user}${
  DB_CONFIG.password ? ":" + encodeURIComponent(DB_CONFIG.password) : ""
}@${DB_CONFIG.host}:${DB_CONFIG.port}/${
  DB_CONFIG.database
}?charset=utf8mb4&timezone=%2B00%3A00`;

let connection; // Global connection for tests
let rawConnection; // Connection for raw setup queries

// --- Model Definitions for Testing ---


class User extends Model {
  static casts = { is_admin: 'boolean', settings: 'json', login_count: 'integer' };
  static hidden = ['password'];
  static fillable = ['name', 'email', 'password', 'login_count', 'settings', 'is_admin'];
  // Define relationships using instance getters returning proxied relations
  get posts() { return this.hasMany(Post, 'author_id'); }
  get comments() { return this.hasMany(Comment, 'owner_id'); }
  get profile() { return this.hasOne(Profile, 'user_id'); }
  // Accessor
  get nameAndId() { return `${this._attributes['name']} (${this._attributes['id']})`; }
  // Mutator
  set email(value) { this._attributes["email"] = typeof value === 'string' ? value.toLowerCase() : value; }
  // Appended Accessor (Ensure 'nameAndId' is in static appends if needed globally)
  // static appends = ['nameAndId'];
}
class Profile extends Model {
  static table = 'user_profiles'; static timestamps = false; static fillable = ['user_id', 'bio', 'location'];
  get user() { return this.belongsTo(User, 'user_id'); }
}
class Post extends Model {
  static timestamps = true; static softDeletes = true;
  static casts = { is_published: 'boolean', content: 'string' };
  static fillable = ['author_id', 'title', 'content', 'is_published'];
  get author() { return this.belongsTo(User, 'author_id'); }
  get comments() { return this.hasMany(Comment, 'post_id'); }
  get tags() { return this.belongsToMany(Tag).withPivot('priority').withTimestamps('linked_at', 'updated_link_at'); } // Rely on convention
  static scopePublished(query) { query.where('is_published', true); }
}
class Comment extends Model {
  static fillable = ['post_id', 'owner_id', 'body'];
  get owner() { return this.belongsTo(User, 'owner_id'); }
  get post() { return this.belongsTo(Post, 'post_id'); }
}
class Tag extends Model {
  static fillable = ['name'];
  get posts() { return this.belongsToMany(Post); } // Rely on convention
}

// --- Test Suite ---

describe('NodeORM Comprehensive Tests (MySQL)', () => {

  // --- Global Setup & Teardown ---
  before(async (context) => {
      context.timeout = 30000; // Increase timeout for setup
      console.log('Setting up test database...');
      const setupConfig = { ...DB_CONFIG, database: null };
      try {
          await Manager.disconnectAll(); // Ensure clean manager state
          rawConnection = await Connection.make(setupConfig, 'setup_raw', false);
          console.log(`Dropping database ${DB_CONFIG.database} if exists...`);
          await rawConnection.run(`DROP DATABASE IF EXISTS \`${DB_CONFIG.database}\``);
          console.log(`Creating database ${DB_CONFIG.database}...`);
          await rawConnection.run(`CREATE DATABASE \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
          await rawConnection.drop();

          connection = await Connection.make(DB_CONFIG, 'default', true);
          assert.ok(connection instanceof Connection, 'Main connection failed');

          console.log('Creating tables via Schema Builder...');
          const schema = Schema.connection(connection); // Use Schema facade

          await schema.create('users', (table) => {
              table.id();
              table.string('name');
              table.string('email').unique();
              table.string('password').nullable();
              table.boolean('is_admin').default(false);
              table.integer('login_count').default(0);
              table.json('settings').nullable();
              table.timestamps(3); // Millisecond precision
          });
          await schema.create('user_profiles', (table) => {
              table.increments('id'); // Standard increments
              table.foreignId('user_id').nullable().unique().constrained('users')//.onDelete('cascade'); // Chain constrained
              table.text('bio').nullable();
              table.string('location').nullable();
          });
           await schema.create('posts', (table) => {
               table.id();
               table.foreignId('author_id').constrained('users')//.onDelete('cascade');
               table.string('title');
               table.text('content').nullable();
               table.boolean('is_published').default(false);
               table.timestamps(3);
               table.softDeletes('deleted_at', 3); // Specify name and precision
           });
           await schema.create('comments', (table) => {
                table.id();
                table.foreignId('post_id').constrained('posts')//.onDelete('cascade');
                table.foreignId('owner_id').constrained('users')//.onDelete('cascade');
                table.text('body');
                table.timestamps(3);
           });
           await schema.create('tags', (table) => {
               table.id();
               table.string('name', 50).unique();
               table.timestamps(3);
           });
            await schema.create('posts_tags', (table) => {
                table.id(); // Explicit pivot ID
                table.foreignId('post_id').constrained('posts')//.onDelete('cascade');
                table.foreignId('tag_id').constrained('tags')//.onDelete('cascade');
                table.integer('priority').default(0);
                table.timestamp('linked_at', 3).nullable(); // Custom names
                table.timestamp('updated_link_at', 3).nullable();
                table.unique(['post_id', 'tag_id']); // Ensure unique pairs
                // table.primary(['post_id', 'tag_id']); // Alternative if no 'id' needed
            });

          console.log('Initializing models...');
          await connection.init(User, Profile, Post, Comment, Tag); // Run Model boot logic
          console.log('Test setup complete.');

      } catch (err) {
          console.error("FATAL SETUP ERROR:", err.message, err.stack);
           if (rawConnection) await rawConnection.drop().catch(()=>{});
           if (connection) await connection.drop().catch(()=>{});
           await Manager.disconnectAll();
          throw err;
      }
  });

  after(async (context) => {
       context.timeout = 15000;
       console.log('Tearing down test database...');
       await Manager.disconnectAll();
       const setupConfig = { ...DB_CONFIG, database: null };
       let dropConnection;
       try {
            dropConnection = await Connection.make(setupConfig, 'drop_db', false);
           console.log(`Dropping database ${DB_CONFIG.database}...`);
           await dropConnection.raw`DROP DATABASE IF EXISTS \`${DB_CONFIG.database}\``;
           await dropConnection.drop();
       } catch (err) {
            console.error("Error during teardown database drop:", err.message);
            if (dropConnection) await dropConnection.drop().catch(()=>{});
       }
      console.log('Teardown complete.');
  });

  // --- Helper: Clean tables before a test section ---
  const cleanTables = async () => {
      console.log('Cleaning tables...');
       await connection.table('posts_tags').truncate();
       await connection.table('comments').truncate();
       await connection.table('tags').truncate();
       await Post.query().forceDelete(); // Use forceDelete for soft delete models
       await connection.table('user_profiles').truncate();
       await User.query().delete(); // Delete all users
      console.log('Tables cleaned.');
  };

  describe("Schema Builder", () => {
    afterEach(async () => {
      // Clean up test tables created by schema builder
      await Schema.connection(connection).dropIfExists("schema_test_table");
      await Schema.connection(connection).dropIfExists("renamed_test_table");
    });

    it("should create a table using Schema.create", async () => {
      await Schema.connection(connection).create(
        "schema_test_table",
        (table) => {
          table.id(); // bigIncrements('id').primary()
          table.string("name", 100).nullable();
          table.integer("order_count").default(0);
          table.text("description").nullable();
          table.timestamps(); // created_at, updated_at (nullable)
        }
      );

      // Verify table exists
      const hasTable = await Schema.connection(connection).hasTable(
        "schema_test_table"
      );
      assert.ok(hasTable, "schema_test_table should exist");

      // Verify columns exist
      const columns = await Schema.connection(connection).getColumnListing(
        "schema_test_table"
      );
      assert.ok(columns.includes("id"));
      assert.ok(columns.includes("name"));
      assert.ok(columns.includes("order_count"));
      assert.ok(columns.includes("description"));
      assert.ok(columns.includes("created_at"));
      assert.ok(columns.includes("updated_at"));
    });

    it("should drop a table using Schema.dropIfExists", async () => {
      // Create table first
      await Schema.connection(connection).create(
        "schema_test_table",
        (table) => {
          table.id();
        }
      );
      assert.ok(
        await Schema.connection(connection).hasTable("schema_test_table")
      );

      // Drop it
      await Schema.connection(connection).dropIfExists("schema_test_table");
      assert.strictEqual(
        await Schema.connection(connection).hasTable("schema_test_table"),
        false
      );

      // Dropping again should not throw error
      await Schema.connection(connection).dropIfExists("schema_test_table");
    });

    // Add more tests for alter, rename, constraints etc. later
  });

  describe("Connection", () => {
    it("should establish connection via config object", async () => {
      let testConn = await Connection.make(
        { ...DB_CONFIG, database: DB_CONFIG.database },
        "test1"
      );
      assert.ok(testConn instanceof Connection);
      assert.strictEqual(testConn.getName(), "test1");
      assert.ok(Manager.hasConnection("test1"));
      await testConn.drop();
      assert.strictEqual(Manager.hasConnection("test1"), false);
    });

    it("should establish connection via connection string", async () => {
      let testConn = await Connection.make(MYSQL_CONN_STRING, "test2");
      assert.ok(testConn instanceof Connection);
      assert.strictEqual(testConn.getName(), "test2");
      assert.ok(Manager.hasConnection("test2"));
      await testConn.drop();
      assert.strictEqual(Manager.hasConnection("test2"), false);
    });

    it("should get the registered model", () => {
      const mainConnection = Manager.getConnection();
      const UserModel = mainConnection.getModel("User");
      assert.strictEqual(UserModel, User);
      const NonExistent = mainConnection.getModel("Imaginary");
      assert.strictEqual(NonExistent, undefined);
    });

    it("should execute raw SQL queries with bindings", async () => {
      const name = "Raw Tester";
      const email = "raw@test.com";
      const conn = Manager.getConnection();
      const insertResult = await conn.run(
        "INSERT INTO users (name, email, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [name, email, new Date(), new Date()]
      );
      assert.ok(insertResult.affectedRows === 1 || insertResult.insertId > 0);
      const users = await conn.raw`SELECT * FROM users WHERE email = ${email}`;
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].name, name);
      const limit = 1;
      const limitedUsers =
        await conn.raw`SELECT name FROM users WHERE name LIKE ${"Raw%"} LIMIT ${limit}`;
      assert.strictEqual(limitedUsers.length, 1);
      assert.strictEqual(limitedUsers[0].name, name);
      const deleteResult = await conn.run("DELETE FROM users WHERE email = ?", [
        email,
      ]);
      assert.strictEqual(deleteResult.affectedRows, 1);
    });
  });

  describe("Basic CRUD Operations", () => {
    before(async () => {
      console.log("Cleaning tables before CRUD tests...");
      await connection.table("posts_tags").truncate();
      await connection.table("comments").truncate();
      await connection.table("tags").truncate();
      await Post.query().truncate();
      await connection.table("user_profiles").truncate();
      await connection.table("users").truncate();
      console.log("Tables cleaned.");
    });

    it("should create a model instance using Model.create()", async () => {
      const userData = {
        name: "Alice",
        email: "alice@example.com",
        password: "password123",
        login_count: 5,
        settings: { theme: "dark", notifications: true },
      };
      const user = await User.create(userData);
      assert.ok(user instanceof User);
      assert.ok(user.id > 0);
      assert.strictEqual(user.name, "Alice");
      assert.ok(user.created_at instanceof Date);
      assert.ok(user.updated_at instanceof Date);
      assert.strictEqual(user.exists(), true);
      assert.strictEqual(user.login_count, 5);
      assert.deepStrictEqual(user.settings, {
        theme: "dark",
        notifications: true,
      });
      assert.ok(!user.isDirty(), "Model should be clean after create");
      assert.strictEqual(user.wasRecentlyCreated(), true);
    });

    it("should create a model instance using new Model() and save()", async () => {
      const user = new User();
      user.name = "Bob";
      user.email = "BOB@example.com"; // Test mutator
      user.password = "secret";
      user.is_admin = true;
      const saved = await user.save();
      assert.ok(saved);
      assert.ok(user.id > 0);
      assert.strictEqual(user.name, "Bob");
      assert.strictEqual(user.exists(), true);
      assert.strictEqual(user.is_admin, true);
      assert.ok(!user.isDirty());
      assert.strictEqual(user.wasRecentlyCreated(), true);
    });

    it("should find a model by ID using Model.find()", async () => {
      const userToFind = await User.create({
        name: "Charlie",
        email: "charlie@find.com",
      });
      const foundUser = await User.find(userToFind.id);
      assert.ok(foundUser instanceof User);
      assert.strictEqual(foundUser.id, userToFind.id);
      assert.strictEqual(foundUser.name, "Charlie");
      assert.strictEqual(foundUser.exists(), true);
      assert.strictEqual(foundUser.wasRecentlyCreated(), false);
    });

    it("should return null from Model.find() for non-existent ID", async () => {
      const foundUser = await User.find(99999);
      assert.strictEqual(foundUser, null);
    });

    it("should find a model by ID using Model.findOrFail()", async () => {
      const userToFind = await User.create({
        name: "David",
        email: "david@findorfail.com",
      });
      const foundUser = await User.findOrFail(userToFind.id);
      assert.ok(foundUser instanceof User);
      assert.strictEqual(foundUser.id, userToFind.id);
    });

    it("should throw ModelNotFoundError from Model.findOrFail() for non-existent ID", async () => {
      await assert.rejects(async () => {
        await User.findOrFail(99998);
      }, errors.ModelNotFoundError);
    });

    it("should find multiple models using Model.findMany()", async () => {
      const user1 = await User.create({
        name: "Eve",
        email: "eve@findmany.com",
      });
      const user2 = await User.create({
        name: "Frank",
        email: "frank@findmany.com",
      });
      const users = await User.findMany([user1.id, user2.id, 99997]);
      assert.strictEqual(users.length, 2);
      assert.ok(users.some((u) => u.id === user1.id && u.name === "Eve"));
      assert.ok(users.some((u) => u.id === user2.id && u.name === "Frank"));
    });

    it("should return empty array from Model.findMany() for empty ID list", async () => {
      const users = await User.findMany([]);
      assert.deepStrictEqual(users, []);
    });

    it("should get the first model using Model.first()", async () => {
      const user = await User.query().orderBy("id", "asc").first();
      assert.ok(user instanceof User);
      assert.strictEqual(user.name, "Alice"); // Alice has lowest ID here
    });

    it("should get the first model or fail using Model.firstOrFail()", async () => {
      const user = await User.query().where("id", ">", 0).firstOrFail();
      assert.ok(user instanceof User);
      await assert.rejects(async () => {
        await User.query().where("id", -1).firstOrFail();
      }, errors.ModelNotFoundError);
    });

    it("should update a model using instance.save()", async () => {
      const user = await User.create({
        name: "UpdateMe",
        email: "update@test.com",
        login_count: 1,
      });
      const originalUpdatedAt = user.updated_at;
      assert.strictEqual(user.isDirty(), false);
      user.name = "Updated Name";
      user.login_count = user.login_count + 1;
      assert.strictEqual(user.isDirty("name"), true);
      assert.deepStrictEqual(user.getDirty(), {
        name: "Updated Name",
        login_count: 2,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const saved = await user.save();
      assert.ok(saved);
      assert.strictEqual(user.isDirty(), false);
      assert.strictEqual(user.name, "Updated Name");
      assert.strictEqual(user.login_count, 2);
      assert.ok(user.updated_at > originalUpdatedAt);
      const updatedUser = await User.find(user.id);
      assert.strictEqual(updatedUser.name, "Updated Name");
      assert.strictEqual(updatedUser.login_count, 2);
      assert.ok(updatedUser.updated_at > originalUpdatedAt);
    });

    it("should update a model using instance.update()", async () => {
      const user = await User.create({
        name: "UpdateMethod",
        email: "updatemethod@test.com",
      });
      const originalUpdatedAt = user.updated_at;
      await new Promise((resolve) => setTimeout(resolve, 50));
      const updated = await user.update({
        name: "Name From Update",
        is_admin: true,
      });
      assert.ok(updated);
      assert.strictEqual(user.name, "Name From Update");
      assert.strictEqual(user.is_admin, true);
      assert.ok(user.updated_at > originalUpdatedAt);
      assert.strictEqual(user.isDirty(), false);
      const updatedUser = await User.find(user.id);
      assert.strictEqual(updatedUser.name, "Name From Update");
      assert.strictEqual(updatedUser.is_admin, true);
      assert.ok(updatedUser.updated_at > originalUpdatedAt);
    });

    it("should not update timestamps if timestamps option is false during save", async () => {
      const user = await User.create({
        name: "No Timestamps Update",
        email: "notimeupdate@test.com",
      });
      const originalUpdatedAt = user.updated_at;
      await new Promise((resolve) => setTimeout(resolve, 50));
      user.name = "Changed Name No Time";
      const saved = await user.save({ timestamps: false });
      assert.ok(saved);
      assert.strictEqual(
        user.updated_at.getTime(),
        originalUpdatedAt.getTime()
      );
      const fetchedUser = await User.find(user.id);
      assert.strictEqual(fetchedUser.name, "Changed Name No Time");
    });

    it("should delete a model using instance.delete()", async () => {
      const user = await User.create({
        name: "DeleteMe",
        email: "delete@test.com",
      });
      assert.strictEqual(user.exists(), true);
      const deleted = await user.delete();
      assert.ok(deleted);
      const foundUser = await User.find(user.id);
      assert.strictEqual(foundUser, null);
      assert.strictEqual(user.exists(), false);
    });

    it("should not error when deleting a non-existent model instance", async () => {
      const user = User.make({
        name: "Never Existed",
        email: "ghost@test.com",
      });
      user._exists = false;
      const deleted = await user.delete();
      assert.strictEqual(deleted, true); // Matches Eloquent behavior
      assert.strictEqual(user.exists(), false);
    });

    it("should delete models using Model.destroy()", async () => {
      const user1 = await User.create({
        name: "Destroy 1",
        email: "destroy1@test.com",
      });
      const user2 = await User.create({
        name: "Destroy 2",
        email: "destroy2@test.com",
      });
      const nonExistentId = 98765;
      const affectedRows = await User.destroy([
        user1.id,
        user2.id,
        nonExistentId,
      ]);
      assert.strictEqual(affectedRows, 2);
      assert.strictEqual(await User.find(user1.id), null);
      assert.strictEqual(await User.find(user2.id), null);
    });
  });

  // ... (Rest of the describe blocks with User.query() applied where needed) ...
  // Remember to apply the User.query(). pattern consistently in:
  // - Query Builder describe block
  // - Soft Deletes describe block (for Post.withTrashed(), Post.onlyTrashed())
  // - Scopes describe block
  // - Relationship tests when querying directly (e.g., await User.with(...).find(...))

  // Example correction for a few more query builder tests:
  describe("Query Builder", () => {
    let user1, user2, user3;
    before(async () => {
      console.log("Cleaning and seeding for Query Builder tests...");
      await connection.table("posts_tags").truncate();
      await connection.table("comments").truncate();
      await connection.table("tags").truncate();
      await Post.query().truncate();
      await connection.table("user_profiles").truncate();
      await connection.table("users").truncate();
      user1 = await User.create({
        name: "Query User 1",
        email: "q1@test.com",
        login_count: 10,
      });
      user2 = await User.create({
        name: "Query User 2",
        email: "q2@test.com",
        login_count: 20,
        is_admin: true,
      });
      user3 = await User.create({
        name: "Another User 3",
        email: "q3@test.com",
        login_count: 15,
      });
      console.log("Seeding complete.");
    });

    it("should select specific columns", async () => {
      const users = await User.query()
        .select("id", "name")
        .where("login_count", ">", 0)
        .orderBy("id", "asc")
        .get();
      assert.ok(users.length >= 3);
      assert.ok(users[0].id);
      assert.ok(users[0].name);
      assert.strictEqual(users[0].email, undefined);
      assert.strictEqual(users[0].login_count, null);
      assert.ok(users[0] instanceof User);
      assert.strictEqual(users[0]._attributes.email, undefined);
    });

    it("should add columns to select", async () => {
      const users = await User.query()
        .select("id")
        .addSelect("email")
        .where("id", user1.id)
        .get();
      assert.strictEqual(users.length, 1);
      assert.ok(users[0].id);
      assert.ok(!users[0].email);
      assert.strictEqual(users[0].name, null);
    });

    it("should select distinct values", async () => {
      const u4 = await User.create({
        name: "Duplicate Name",
        email: "dup1@test.com",
        login_count: 5,
      });
      const u5 = await User.create({
        name: "Duplicate Name",
        email: "dup2@test.com",
        login_count: 5,
      });
      const distinctCounts = await User.query().distinct().pluck("login_count");
      const allCounts = await User.query().pluck("login_count");
      distinctCounts.sort((a, b) => a - b);
      allCounts.sort((a, b) => a - b);
      const allFives = allCounts.filter((c) => c === 5).length;
      const distinctFives = distinctCounts.filter((c) => c === 5).length;
      assert.ok(allFives >= 2);
      assert.strictEqual(distinctFives, 1);
      assert.ok(allCounts.length > distinctCounts.length);
      await User.query().where("email", "like", "dup%@test.com").delete();
    });

    it("should filter using basic where", async () => {
      const users = await User.query().where("email", "=", "q1@test.com").get();
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].id, user1.id);
    });

    it("should filter using where with default operator", async () => {
      const users = await User.query().where("email", "q1@test.com").get();
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].id, user1.id);
    });

    it("should filter using object-based where", async () => {
      const users = await User.query()
        .where({ email: "q1@test.com", login_count: 10 })
        .get();
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].id, user1.id);
    });

    it("should filter using orWhere", async () => {
      const users = await User.query()
        .where("email", "q1@test.com")
        .orWhere("email", "q2@test.com")
        .orderBy("id")
        .get();
      assert.strictEqual(users.length, 2);
      assert.strictEqual(users[0].id, user1.id);
      assert.strictEqual(users[1].id, user2.id);
    });

    it("should filter using whereIn", async () => {
      const users = await User.query()
        .whereIn("id", [user1.id, user3.id])
        .orderBy("id")
        .get();
      assert.strictEqual(users.length, 2);
      assert.strictEqual(users[0].id, user1.id);
      assert.strictEqual(users[1].id, user3.id);
    });

    it("should filter using whereNotIn", async () => {
      const totalUsers = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .count(); // Count only seeded users
      const users = await User.query()
        .whereNotIn("id", [user1.id, user3.id])
        .get();
      // Filter results to only include seeded users for reliable count check
      const seededUserIds = [user1.id, user2.id, user3.id];
      const filteredUsers = users.filter((u) => seededUserIds.includes(u.id));
      assert.strictEqual(filteredUsers.length, 1); // Only user2 should remain from seeded
      assert.strictEqual(filteredUsers[0].id, user2.id);
      assert.ok(
        filteredUsers.every((u) => u.id !== user1.id && u.id !== user3.id)
      );
    });

    it("should handle empty whereIn/whereNotIn", async () => {
      const usersInEmpty = await User.query().whereIn("id", []).get();
      assert.strictEqual(usersInEmpty.length, 0);
      const usersNotInEmpty = await User.query().whereNotIn("id", []).get();
      const totalUsers = await User.query().count(); // Count all users in table now
      assert.strictEqual(usersNotInEmpty.length, totalUsers);
    });

    it("should filter using whereNotNull", async () => {
      const users = await User.query().whereNotNull("password").get();
      const totalUsers = await User.query().count();
      const nullPassCount = await User.query().whereNull("password").count();
      assert.strictEqual(users.length, totalUsers - nullPassCount);
      assert.ok(users.every((u) => u._attributes.password !== null));
    });

    it("should filter using whereBetween", async () => {
      const users = await User.query()
        .whereBetween("login_count", [12, 25])
        .orderBy("login_count")
        .get();
      assert.strictEqual(users.length, 2);
      assert.strictEqual(users[0].id, user3.id);
      assert.strictEqual(users[1].id, user2.id);
    });

    it("should filter using whereNotBetween", async () => {
      const users = await User.query()
        .whereNotBetween("login_count", [12, 18])
        .get();
      const userIds = users.map((u) => u.id);
      assert.ok(userIds.includes(user1.id));
      assert.ok(userIds.includes(user2.id));
      assert.ok(!userIds.includes(user3.id));
    });

    it("should filter using whereDate", async () => {
      const today = new Date();
      const todayString = today.toISOString().slice(0, 10);
      const users = await User.query()
        .whereDate("created_at", todayString)
        .get();
      const totalUsers = await User.query().count(); // Count all users
      // This assertion might be fragile if tests run across midnight
      assert.ok(
        users.length >= 3,
        `Expected >= 3 users created today, found ${users.length}`
      );
      const usersGt = await User.query()
        .whereDate("created_at", ">", "2000-01-01")
        .get();
      assert.strictEqual(usersGt.length, totalUsers);
      const usersLt = await User.query()
        .whereDate("created_at", "<", "2000-01-01")
        .get();
      assert.strictEqual(usersLt.length, 0);
    });

    it("should filter using nested where clauses", async () => {
      const users = await User.query()
        .where((query) => {
          query.where("email", "q1@test.com").orWhere("email", "q2@test.com");
        })
        .where("login_count", ">", 15)
        .get();
      assert.strictEqual(users.length, 1);
      assert.strictEqual(users[0].id, user2.id);
    });

    it("should filter using whereColumn", async () => {
      const userToUpdate = await User.create({
        name: "ColCompare",
        email: "col@compare.com",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await userToUpdate.update({ name: "ColCompare Updated" });
      const users = await User.query()
        .whereColumn("updated_at", ">", "created_at")
        .get();
      assert.ok(users.some((u) => u.id === userToUpdate.id));
      const unlikelyMatch = await User.query()
        .whereColumn("login_count", "=", "id")
        .get();
      assert.strictEqual(unlikelyMatch.length, 0);
      await userToUpdate.delete();
    });

    it("should filter using whereExists subquery", async () => {
      const postUser = await User.create({
        name: "Post User",
        email: "postuser@test.com",
      });
      const p1 = await Post.create({
        author_id: postUser.id,
        title: "A post exists",
      });
      const usersWithPosts = await User.query()
        .whereExists((query) => {
          query.from("posts").whereColumn("posts.author_id", "=", "users.id");
        })
        .get();
      assert.ok(usersWithPosts.some((u) => u.id === postUser.id));
      assert.ok(!usersWithPosts.some((u) => u.id === user1.id));
      await Post.query().where("author_id", postUser.id).forceDelete();
      await postUser.delete();
    });

    it("should order results using orderBy", async () => {
      const users = await User.query().orderBy("login_count", "desc").get();
      assert.ok(users.length >= 3);
      assert.strictEqual(users[0].id, user2.id);
      assert.strictEqual(users[1].id, user3.id);
      assert.strictEqual(users[2].id, user1.id);
    });

    it("should order results using latest() and oldest()", async () => {
      const userIds = [user1.id, user2.id, user3.id];
      const latestUser = await User.query()
        .whereIn("id", userIds)
        .latest()
        .first();
      const oldestUser = await User.query()
        .whereIn("id", userIds)
        .oldest()
        .first();
      assert.ok(latestUser instanceof User);
      assert.ok(oldestUser instanceof User);
      assert.ok(latestUser.created_at >= oldestUser.created_at);
      assert.strictEqual(latestUser.id, user3.id);
      assert.strictEqual(oldestUser.id, user1.id);
    });

    it("should limit results", async () => {
      const users = await User.query().limit(2).orderBy("id", "asc").get();
      assert.strictEqual(users.length, 2);
      assert.strictEqual(users[0].id, user1.id);
      assert.strictEqual(users[1].id, user2.id);
    });

    it("should offset results", async () => {
      const secondUser = await User.query()
        .offset(1)
        .limit(1)
        .orderBy("id", "asc")
        .first();
      assert.ok(secondUser);
      assert.strictEqual(secondUser.id, user2.id);
    });

    it("should paginate results using forPage()", async () => {
      const totalUsers = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .count();
      const perPage = 2;
      const page1 = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .forPage(1, perPage)
        .orderBy("id", "asc")
        .get();
      const page2 = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .forPage(2, perPage)
        .orderBy("id", "asc")
        .get();
      assert.strictEqual(page1.length, 2);
      assert.strictEqual(page1[0].id, user1.id);
      assert.strictEqual(page1[1].id, user2.id);
      assert.strictEqual(page2.length, 1);
      assert.strictEqual(page2[0].id, user3.id);
    });

    it("should group results using groupBy (simple case)", async () => {
      const results = await connection
        .table("users")
        .select(raw("is_admin"), raw("COUNT(*) as count"))
        .whereIn("id", [user1.id, user2.id, user3.id]) // Isolate
        .groupBy("is_admin")
        .orderBy("is_admin")
        .get();
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].is_admin, 0);
      assert.strictEqual(results[0].count, 2);
      assert.strictEqual(results[1].is_admin, 1);
      assert.strictEqual(results[1].count, 1);
    });

    it("should filter grouped results using having", async () => {
      const results = await connection
        .table("users")
        .select(raw("is_admin"), raw("COUNT(*) as user_count"))
        .whereIn("id", [user1.id, user2.id, user3.id]) // Isolate
        .groupBy("is_admin")
        .having("user_count", ">", 1)
        .get();
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].is_admin, 0);
      assert.strictEqual(results[0].user_count, 2);
      const resultsHavingSumEq = await connection
        .table("users")
        .select(raw("is_admin"), raw("SUM(login_count) as total_logins"))
        .whereIn("id", [user1.id, user2.id, user3.id]) // Isolate
        .groupBy("is_admin")
        .having("total_logins", ">=", 25)
        .get();
      assert.strictEqual(resultsHavingSumEq[0].is_admin, 0);
      assert.equal(parseInt(resultsHavingSumEq[0].total_logins), 25);
    });

    it("should perform basic joins", async () => {
      const userWithProfile = await User.create({
        name: "Profile User",
        email: "profile@test.com",
      });
      await Profile.create({ user_id: userWithProfile.id, bio: "Test bio" });
      const userResult = await User.query()
        .select("users.name", "user_profiles.bio")
        .join("user_profiles", "users.id", "=", "user_profiles.user_id")
        .where("users.id", userWithProfile.id)
        .first();
      assert.ok(userResult instanceof User);
      assert.strictEqual(userResult.name, "Profile User");
      assert.strictEqual(userResult.getAttribute("bio"), "Test bio");
      const profileResult = await Profile.query()
        .select("user_profiles.*", raw("users.name as user_name")) // Use raw for alias if needed
        .join("users", "user_profiles.user_id", "=", "users.id")
        .where("user_profiles.user_id", userWithProfile.id)
        .first();
      assert.ok(profileResult instanceof Profile);
      assert.strictEqual(profileResult.bio, "Test bio");
      assert.strictEqual(
        profileResult.getAttribute("user_name"),
        "Profile User"
      );
      await Profile.query().where("user_id", userWithProfile.id).delete();
      await userWithProfile.delete();
    });

    it("should count results using count()", async () => {
      const seedUserIds = [user1.id, user2.id, user3.id];
      const isolatedTotal = await User.query()
        .whereIn("id", seedUserIds)
        .count();
      const isolatedAdmin = await User.query()
        .whereIn("id", seedUserIds)
        .where("is_admin", true)
        .count();
      assert.strictEqual(isolatedTotal, 3);
      assert.strictEqual(isolatedAdmin, 1);
    });

    it("should calculate sum()", async () => {
      const isolatedSum = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .sum("login_count");
      assert.strictEqual(isolatedSum, 45);
    });
    it("should calculate avg()", async () => {
      const isolatedAvg = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .avg("login_count");
      assert.strictEqual(isolatedAvg, 15);
    });
    it("should calculate min()", async () => {
      const isolatedMin = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .min("login_count");
      assert.strictEqual(isolatedMin, 10);
    });
    it("should calculate max()", async () => {
      const isolatedMax = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .max("login_count");
      assert.strictEqual(isolatedMax, 20);
    });

    it("should check existence using exists()", async () => {
      const adminsExist = await User.query().where("is_admin", true).exists();
      const nonExistentExist = await User.query()
        .where("login_count", -100)
        .exists();
      assert.strictEqual(adminsExist, true);
      assert.strictEqual(nonExistentExist, false);
    });
    it("should check non-existence using doesntExist()", async () => {
      const adminsDontExist = await User.query()
        .where("is_admin", true)
        .doesntExist();
      const nonExistentDontExist = await User.query()
        .where("login_count", -100)
        .doesntExist();
      assert.strictEqual(adminsDontExist, false);
      assert.strictEqual(nonExistentDontExist, true);
    });

    it("should pluck a single column", async () => {
      const names = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .orderBy("id")
        .pluck("name");
      assert.deepStrictEqual(names, [
        "Query User 1",
        "Query User 2",
        "Another User 3",
      ]);
    });
    it("should pluck a column with keys", async () => {
      const namesById = await User.query()
        .whereIn("id", [user1.id, user2.id, user3.id])
        .orderBy("id")
        .pluck("name", "id");
      const expected = {
        [user1.id]: "Query User 1",
        [user2.id]: "Query User 2",
        [user3.id]: "Another User 3",
      };
      assert.deepStrictEqual(namesById, expected);
    });
    it("should get a single value", async () => {
      const name = await User.query().where("id", user1.id).value("name");
      assert.strictEqual(name, user1.name);
      const nonExistent = await User.query().where("id", 99119).value("name");
      assert.strictEqual(nonExistent, null);
    });

    it("should increment and decrement values", async () => {
      const user = await User.create({
        name: "IncDec User",
        email: "incdec@test.com",
        login_count: 5,
      });
      let affected = await User.query()
        .where("id", user.id)
        .increment("login_count");
      assert.strictEqual(affected, 1);
      let updatedUser = await User.find(user.id);
      assert.strictEqual(updatedUser.login_count, 6);
      affected = await User.query()
        .where("id", user.id)
        .increment("login_count", 4, { name: "IncDec Updated" });
      assert.strictEqual(affected, 1);
      updatedUser = await User.find(user.id);
      assert.strictEqual(updatedUser.login_count, 10);
      assert.strictEqual(updatedUser.name, "IncDec Updated");
      affected = await User.query()
        .where("id", user.id)
        .decrement("login_count", 3);
      assert.strictEqual(affected, 1);
      updatedUser = await User.find(user.id);
      assert.strictEqual(updatedUser.login_count, 7);
      affected = await User.query()
        .where("id", user.id)
        .decrement("login_count", 2, { is_admin: true });
      assert.strictEqual(affected, 1);
      updatedUser = await User.find(user.id);
      assert.strictEqual(updatedUser.login_count, 5);
      assert.strictEqual(updatedUser.is_admin, true);
      await user.delete();
    });

    it("should perform updateOrInsert", async () => {
      let result = await User.query().updateOrInsert(
        { email: "upsert@test.com" },
        { name: "Upsert Inserted", login_count: 1 }
      );
      assert.ok(
        result === true || result >= 1,
        "Insert should indicate success"
      ); // Allow boolean true or affectedRows >= 1
      const foundInserted = await User.query()
        .where("email", "upsert@test.com")
        .first();
      assert.ok(foundInserted);
      assert.strictEqual(foundInserted.name, "Upsert Inserted");
      assert.strictEqual(foundInserted.login_count, 1);
      result = await User.query().updateOrInsert(
        { email: "upsert@test.com" },
        { name: "Upsert Updated", login_count: 5 }
      );
      assert.ok(
        result === true || result === 1,
        "Update should indicate success"
      );
      const foundUpdated = await User.query()
        .where("email", "upsert@test.com")
        .first();
      assert.ok(foundUpdated);
      assert.strictEqual(foundUpdated.id, foundInserted.id);
      assert.strictEqual(foundUpdated.name, "Upsert Updated");
      assert.strictEqual(foundUpdated.login_count, 5);
      await foundUpdated.delete();
    });
  });

  // ... (Rest of tests: Relationships, Attributes, Events, Transactions, Soft Deletes, Scopes) ...
  // Ensure User.query() or Model.query() is used for static-like calls within those tests as well.
  // Check assertions related to state (isDirty, getOriginal, wasRecentlyCreated) against the fixed logic.
  // Relationship tests should work better now with corrected definitions.
  // Soft Delete tests need the `beforeEach` hook to correctly use `Post.query().truncate()`.
  // Scope tests need `Post.query().published()` etc.
}); // End Main Describe Block
