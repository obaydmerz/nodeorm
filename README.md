# NodeORM

**NodeORM is a modern, performant, and elegant Object-Relational Mapper (ORM) for Node.js, heavily inspired by Laravel's Eloquent ORM.**

It aims to provide the familiar, expressive, and powerful database interaction experience of Eloquent within the Node.js ecosystem, while prioritizing:

*   **🚀 Blazing Performance:** Built from the ground up with modern JavaScript (ES6+ Modules, Proxies, async/await) for maximum efficiency and minimal overhead.
*   **✨ Eloquent Parity:** Implements the vast majority of Eloquent's features and API, making it instantly familiar to Laravel developers and easy to learn for others.
*   **Simplicity & DX:** Offers an intuitive, fluent API for common database tasks, reducing boilerplate and enhancing developer productivity.
*   **0 Minimal Dependencies:** Zero core dependencies. Relies only on specific database driver packages (`pg`, `mysql2`, `@neondatabase/serverless`, `sqlite3`), keeping your `node_modules` lean.
*   **🔧 Extensibility:** Easily extendable with custom database drivers.
*   **Reliability:** Strong typing hints via JSDoc, robust error handling, and a focus on maintainable code.

**NodeORM strives to be a top-tier ORM choice for Node.js developers seeking performance, elegance, and a familiar API.**

---

## Table of Contents

*   [Why Choose NodeORM?](#why-choose-nodeorm)
*   [Features](#features)
*   [Installation](#installation)
*   [Quick Start](#quick-start)
*   [Core Concepts](#core-concepts)
    *   [Configuration & Connections](#configuration--connections)
    *   [Defining Models](#defining-models)
    *   [Conventions](#conventions)
*   [Basic Usage](#basic-usage)
    *   [Retrieving Models](#retrieving-models)
    *   [Aggregates](#aggregates)
    *   [Inserting & Updating Models](#inserting--updating-models)
    *   [Deleting Models](#deleting-models)
    *   [Soft Deleting](#soft-deleting)
*   [Query Builder](#query-builder)
*   [Relationships](#relationships)
    *   [Defining Relationships](#defining-relationships)
    *   [Querying Relations](#querying-relations)
    *   [Eager Loading](#eager-loading)
*   [Attributes](#attributes)
    *   [Accessors & Mutators](#accessors--mutators)
    *   [Attribute Casting](#attribute-casting)
    *   [Date Casting](#date-casting)
    *   [JSON Casting](#json-casting)
*   [Serialization](#serialization)
    *   [Hiding Attributes](#hiding-attributes)
    *   [Appending Values](#appending-values)
*   [Events & Hooks](#events--hooks)
*   [Scopes](#scopes)
    *   [Global Scopes](#global-scopes)
    *   [Local Scopes](#local-scopes)
*   [Transactions](#transactions)
*   [Raw Queries](#raw-queries)
*   [Schema Builder](#schema-builder)
*   [Migrations (Basic Runner)](#migrations-basic-runner)
*   [Performance Considerations](#performance-considerations)
*   [Extensibility (Custom Drivers)](#extensibility-custom-drivers)
*   [Contributing](#contributing)
*   [License](#license)

---

## Why Choose NodeORM?

While the Node.js ecosystem has several mature ORMs (TypeORM, Sequelize, Prisma), NodeORM aims to carve its niche by offering:

1.  **The Eloquent Experience:** If you love Laravel's database layer, NodeORM provides the most extensive and faithful implementation of its API and features in Node.js. This significantly reduces the learning curve for Laravel developers transitioning to Node.js or using it for APIs.
2.  **Performance Focus:** Built with modern ES6+ features and minimal core abstractions. Avoiding heavy layers of compatibility code or complex type transformations aims for lower overhead compared to some traditional ORMs. Proxies are used intelligently for dynamic features without sacrificing core path speed. *Note: Rigorous independent benchmarking is ongoing and encouraged.*
3.  **Simplicity & Modern JavaScript:** Leverages native Promises, `async`/`await`, and ES Modules. No need for separate CLI tools for basic operations (though migrations have a basic runner). The API focuses on clarity and conciseness.
4.  **Zero Core Dependencies:** Reduces potential conflicts, security vulnerabilities, and bundle size. You only install the database driver(s) you need.
5.  **Extensibility:** Designed with driver extension in mind from the start.

NodeORM is ideal for developers who value the productivity and elegance of Eloquent and seek a performant, modern ORM for their Node.js projects.

---

## Features

*   **Eloquent-like API:** Models, Query Builder, Relationships, Scopes, Events, etc.
*   **Supported Databases:** PostgreSQL (via `pg` or `@neondatabase/serverless`), MySQL/MariaDB (via `mysql2`), SQLite (via `sqlite3`).
*   **Model Conventions:** Automatic table/primary key naming (overridable).
*   **CRUD Operations:** `find`, `findOrFail`, `first`, `create`, `update`, `save`, `delete`, `destroy`, `firstOrCreate`, `updateOrCreate`, etc.
*   **Fluent Query Builder:** Chainable methods for complex SQL generation (`where`, `orWhere`, `whereIn`, `join`, `groupBy`, `orderBy`, aggregates, etc.).
*   **Relationships:** `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` (with pivot table customization).
*   **Eager Loading:** Prevent N+1 query problems using `with()` (simple, nested, constrained).
*   **Lazy Loading:** Relationships loaded on demand.
*   **Accessors & Mutators:** Transform attribute values on get/set (via Proxies).
*   **Attribute Casting:** Automatic type casting (int, float, bool, date, datetime, json, array, object).
*   **Serialization:** `toJSON`/`toArray` methods with `hidden`, `visible`, and `appends` support.
*   **Events/Hooks:** Lifecycle hooks (`creating`, `created`, `updating`, `updated`, `saving`, `saved`, `deleting`, `deleted`, `restoring`, `restored`).
*   **Scopes:** Reusable query constraints (global and local).
*   **Soft Deletes:** `deleted_at` timestamp support with relevant query scopes.
*   **Transactions:** Simple promise-based transaction management.
*   **Raw Queries:** Execute raw SQL when needed.
*   **Schema Builder:** Fluent API (`Blueprint`) for creating and modifying tables.
*   **Basic Migration Runner:** Programmatic runner for managing database schema changes.
*   **Modern JS:** ES Modules, `async`/`await`, Proxies.
*   **Minimal Dependencies:** Only requires database drivers.

---

## Installation

```bash
npm install nodeorm mysql2 # Example for MySQL
```

Install the appropriate driver for your database:

*   **PostgreSQL:** `npm install pg` or `npm install @neondatabase/serverless` (Neon preferred)
*   **MySQL / MariaDB:** `npm install mysql2`
*   **SQLite:** `npm install sqlite3`

---

## Quick Start

```javascript
import { Model, Connection } from 'nodeorm';
// Import a driver (NodeORM attempts to auto-detect and load)
// import { MySQLDriver } from 'nodeorm/drivers'; // Optional direct import

// 1. Define Models
class User extends Model {
    // Optional: Override table name (defaults to 'users')
    // static table = 'my_users';

    // Optional: Define fillable attributes for mass assignment
    static fillable = ['name', 'email', 'login_count'];

    // Optional: Define relationships
    get posts() {
        return this.hasMany(Post, 'author_id');
    }
}

class Post extends Model {
    static fillable = ['author_id', 'title', 'content'];

    get author() {
        return this.belongsTo(User, 'author_id');
    }
}

// 2. Establish Connection (using environment variables or connection string/object)
let connection;
try {
    // Option A: Auto-detect from environment (DATABASE_URL, DB_HOST etc.)
    // connection = await Connection.make();

    // Option B: Connection String
    connection = await Connection.make('mysql://root:@localhost:3306/my_database');
    // connection = await Connection.make('postgresql://user:pass@host:port/db');
    // connection = await Connection.make('sqlite:/path/to/database.sqlite');

    // Option C: Config Object
    // connection = await Connection.make({
    //     driver: 'mysql',
    //     host: 'localhost',
    //     port: 3306,
    //     user: 'root',
    //     password: '',
    //     database: 'my_database'
    // });

    // 3. Initialize Models with Connection (fetches schema, associates connection)
    await connection.init(User, Post);

    console.log('Connection successful!');

} catch (error) {
    console.error('Connection failed:', error);
    process.exit(1);
}


// 4. Use Models!
async function main() {
    try {
        // Create
        const newUser = await User.create({
            name: 'John Doe',
            email: 'john.doe@example.com',
            login_count: 1
        });
        console.log('Created User:', newUser.id, newUser.name);

        // Find
        const foundUser = await User.find(newUser.id);
        if (foundUser) {
            console.log('Found User:', foundUser.name);

            // Update via instance save()
            foundUser.login_count = foundUser.login_count + 1;
            await foundUser.save();
            console.log('Updated login count (save):', foundUser.login_count);

            // Update via instance update()
            await foundUser.update({ name: 'Johnathan Doe' });
            console.log('Updated name (update):', foundUser.name);
        }

        // Query Builder
        const activeUsers = await User.where('login_count', '>', 0)
                                      .orderBy('name', 'asc')
                                      .limit(10)
                                      .get();
        console.log('Active users:', activeUsers.map(u => u.name));

        // Create related model
        if(foundUser) {
            const newPost = await foundUser.posts().create({
                title: 'My First Post',
                content: 'This is NodeORM!'
            });
            console.log('Created Post:', newPost.id, newPost.title);

            // Query relationship
            const userWithPosts = await User.with('posts').find(foundUser.id);
            console.log(`Posts for ${userWithPosts.name}:`, userWithPosts.posts.map(p => p.title));
        }


        // Delete
        if (foundUser) {
            await foundUser.delete();
            console.log('User deleted.');
        }

    } catch (error) {
        console.error("An error occurred:", error);
    } finally {
        // Close the connection pool when done
        await connection.drop();
    }
}

main();
```

---

## Core Concepts

### Configuration & Connections

NodeORM uses a `Connection` class to manage database interactions. Connections can be configured via:

1.  **Environment Variables:** Mimicking Laravel, it checks for `DATABASE_URL`/`DB_URL` first, then falls back to `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
2.  **Connection String:** Standard URL format (`driver://user:pass@host:port/database?options`).
3.  **Configuration Object:** `{ driver: 'mysql', host: '...', ... }`.
4.  **Driver Instance:** Pass a pre-configured driver instance (less common).

```javascript
import { Connection } from 'nodeorm';

// From Environment (implicitly uses process.env)
const defaultConn = await Connection.make();

// From Connection String
const pgConn = await Connection.make('postgresql://user:pass@host:5432/db?sslmode=require');
const sqliteConn = await Connection.make('/path/to/db.sqlite'); // Or 'sqlite::memory:'

// From Config Object
const mysqlConn = await Connection.make({
  driver: 'mysql', // or 'mysql2'
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'test_db',
  charset: 'utf8mb4'
}, 'mysql_test'); // Optional connection name

// Manage Connections (usually handled automatically by 'default')
import { ConnectionManager } from 'nodeorm';
const mainDb = ConnectionManager.getConnection(); // Gets 'default'
const specificDb = ConnectionManager.getConnection('mysql_test');
```

### Defining Models

Models extend the `NodeORM.Model` class and represent a single database table.

```javascript
import { Model } from 'nodeorm';

class Product extends Model {
  // Table name (defaults to 'products')
  static table = 'store_products';

  // Primary key (defaults to 'id')
  static primaryKey = 'product_sku';

  // Key type (defaults to 'integer')
  static keyType = 'string';

  // Disable auto-incrementing if PK is not AI
  static incrementing = false;

  // Disable timestamps (defaults to true)
  static timestamps = false;

  // Enable soft deletes (defaults to false)
  static softDeletes = true;

  // Mass assignable attributes
  static fillable = ['name', 'sku', 'price', 'description'];

  // Or guarded attributes (takes precedence)
  // static guarded = ['id', 'internal_ref']; // Defaults to ['*']

  // Attribute casting
  static casts = {
    price: 'float',
    is_active: 'boolean',
    options: 'json', // Converts DB JSON string to/from JS object/array
    launched_at: 'date' // Converts DB date/datetime to JS Date object
  };

  // Hidden from serialization
  static hidden = ['internal_ref'];

  // Appended accessors for serialization
  static appends = ['nameWithSku'];

  // Accessor (Getter)
  get nameWithSku() {
    return `${this.name} (${this.sku})`; // Access attributes directly
  }

  // Mutator (Setter)
  set name(value) {
    // Directly modify internal attributes
    this._attributes.name = value.trim();
  }

  // Relationships (defined as getters returning Relation instances)
  get category() {
    return this.belongsTo(Category); // Assumes Category model exists
  }

  get reviews() {
      return this.hasMany(Review); // Assumes Review model exists
  }
}
```

### Conventions

NodeORM follows conventions similar to Eloquent, but allows overrides:

*   **Table Name:** Plural, snake_case version of the class name (e.g., `User` -> `users`, `ProductReview` -> `product_reviews`). Override with `static table`.
*   **Primary Key:** `id`. Override with `static primaryKey`. Assumed to be auto-incrementing integer unless `static incrementing = false` or `static keyType = 'string'`.
*   **Timestamps:** `created_at` and `updated_at`. Assumed `DATETIME` or `TIMESTAMP`. Disable with `static timestamps = false`. Customize names with `static createdAtColumn` / `static updatedAtColumn`.
*   **Soft Deletes:** `deleted_at`. Disable with `static softDeletes = false`. Customize name with `static deletedAtColumn`.
*   **Foreign Keys:** `{singular_table_name}_{primaryKey}` (e.g., `user_id`, `post_id`). Inferred automatically in relationship definitions but can be overridden.

---

## Basic Usage

### Retrieving Models

```javascript
// Find by primary key
const user = await User.find(1);

// Find or fail
try {
  const userOrFail = await User.findOrFail(999);
} catch (e) {
  if (e instanceof errors.ModelNotFoundError) {
    console.log(e.message); // "No User found for ID: 999"
  }
}

// Find multiple by primary keys
const users = await User.findMany([1, 2, 5]);

// Get the first record matching constraints
const admin = await User.where('is_admin', true).first();

// Get the first record or throw
const firstUser = await User.oldest().firstOrFail();

// Retrieve all records (use with caution on large tables!)
const allUsers = await User.all(); // Equivalent to User.query().get()

// Chunking results for large tables
await User.query().orderBy('id').chunk(100, (usersChunk) => {
  console.log(`Processing chunk of ${usersChunk.length} users...`);
  // Process the chunk
});

// Find using attribute values
const specificUser = await User.where('email', 'jane.doe@example.com').first();

// Find or create
const userOrCreate = await User.firstOrCreate(
  { email: 'new@example.com' }, // Attributes to find by
  { name: 'New User', login_count: 0 } // Attributes to use if creating
);

// Find or create new instance (not saved)
const userOrNew = await User.firstOrNew(
  { email: 'maybe@example.com' },
  { name: 'Maybe New' }
);
if (!userOrNew.exists()) {
  // userOrNew.login_count = 1; // Set additional attributes
  // await userOrNew.save();
}
```

### Aggregates

```javascript
const totalUsers = await User.count();
const maxLogins = await User.max('login_count');
const averageLogins = await User.where('is_active', true).avg('login_count'); // Aggregates respect constraints
const totalRevenue = await Order.sum('amount');

// Check existence
const hasAdmins = await User.where('is_admin', true).exists();
const noPending = await Order.where('status', 'pending').doesntExist();
```

### Inserting & Updating Models

```javascript
// --- Create (Mass Assignment) ---
const user = await User.create({
  name: 'New User',
  email: 'create@example.com',
  // 'password' might be guarded by default, needs to be in fillable
});

// --- Create (New Instance + Save) ---
const product = new Product(); // Uses model constructor & proxy
product.name = 'Awesome Gadget';
product.sku = 'GADGET-001';
product.price = 99.99;
product.is_active = true;
await product.save(); // Performs INSERT

// --- Update (Instance save()) ---
const userToUpdate = await User.find(1);
if (userToUpdate) {
  userToUpdate.login_count += 1;
  await userToUpdate.save(); // Performs UPDATE
}

// --- Update (Instance update()) ---
const productToUpdate = await Product.find('GADGET-001');
if (productToUpdate) {
  await productToUpdate.update({ price: 89.99, is_active: false }); // Performs UPDATE
}

// --- Mass Update ---
const affectedRows = await User.where('login_count', 0).update({ is_active: false });

// --- Upsert (Insert or Update) ---
// Atomicity depends on database support (MySQL, Postgres, SQLite recent versions)
await User.upsert(
  [
    { email: 'upsert1@example.com', name: 'Upsert 1', login_count: 1 },
    { email: 'upsert2@example.com', name: 'Upsert 2', login_count: 5 }
  ],
  ['email'], // Unique key(s) to check for conflict
  ['name', 'login_count'] // Columns to update on conflict
);

// --- Update or Create ---
// Finds by first arg, updates or creates with merged args
const updatedOrCreated = await User.updateOrCreate(
  { email: 'unique@example.com' }, // Find by email
  { name: 'Updated Or Created', login_count: 10 } // Set these values
);

// --- Increment / Decrement ---
await User.where('id', 1).increment('login_count'); // Increment by 1
await User.where('id', 1).increment('login_count', 5); // Increment by 5
await User.where('id', 1).decrement('balance', 10.50, { last_activity: new Date() }); // Decrement with extra updates
```

### Deleting Models

```javascript
// Delete by instance
const user = await User.find(1);
if (user) {
  await user.delete();
}

// Delete by primary key
const affected = await User.destroy(1);

// Delete multiple by primary key
const affectedMultiple = await User.destroy([1, 2, 3]);

// Delete by query constraints
const affectedQuery = await User.where('login_count', '<', 5).delete();

// Truncate table (Deletes ALL rows - Use with extreme caution!)
// await User.truncate();
```

### Soft Deleting

Enable by setting `static softDeletes = true;` on your model.

```javascript
// Enable in model:
// class Post extends Model {
//   static softDeletes = true;
// }

// Soft delete an instance
const post = await Post.find(1);
await post.delete(); // Sets 'deleted_at' timestamp

// Querying (Excludes soft-deleted by default)
const activePosts = await Post.all(); // Only returns posts where deleted_at IS NULL

// Include soft-deleted results
const allPostsIncludingTrashed = await Post.withTrashed().get();

// Query ONLY soft-deleted results
const trashedPosts = await Post.onlyTrashed().get();

// Restore a soft-deleted model
const trashedPost = await Post.onlyTrashed().find(1);
if (trashedPost) {
  await trashedPost.restore(); // Sets deleted_at to NULL
}

// Check if an instance is trashed
if (post.isTrashed()) { /* ... */ }

// Permanently delete (even if soft deletes are enabled)
await post.forceDelete();
// Or via query
await Post.where('author_id', 5).forceDelete();
```

---

## Query Builder

NodeORM provides a powerful and fluent query builder. Start a query using `Model.query()` or the static forwarder methods.

```javascript
// Basic Where
const users = await User.where('login_count', '>', 10).get();
const user = await User.where('email', 'test@example.com').first();
const admins = await User.where({ is_admin: true, status: 'active' }).get(); // Object syntax

// Or Where
const results = await Product.where('price', '<', 10).orWhere('on_sale', true).get();

// Where In / Not In / Between / Null
const usersByIds = await User.whereIn('id', [1, 5, 10]).get();
const productsNotInCategory = await Product.whereNotIn('category_id', [3, 4]).get();
const recentOrders = await Order.whereBetween('created_at', [startDate, endDate]).get();
const incompleteProfiles = await User.whereNull('profile_bio').get();

// Ordering, Limit, Offset
const latestUsers = await User.orderBy('created_at', 'desc').limit(5).get();
const secondPage = await User.offset(10).limit(10).get();
const usersPaged = await User.forPage(3, 15).get(); // Page 3, 15 items per page

// Joins
const userOrders = await User.select('users.name', 'orders.amount')
                             .join('orders', 'users.id', '=', 'orders.user_id')
                             .where('orders.status', 'completed')
                             .get();

const postsWithAuthors = await Post.leftJoin('users', 'posts.author_id', '=', 'users.id')
                                   .select('posts.*', 'users.name as author_name')
                                   .get();

// Grouping & Having
const categoryCounts = await Product.select('category_id', raw('COUNT(*) as count'))
                                  .groupBy('category_id')
                                  .having('count', '>', 5)
                                  .get();

// Raw Expressions
const activeCount = await User.where('status', 'active')
                              .whereRaw('MONTH(created_at) = ?', [5]) // Use driver placeholder
                              .count();
const users = await User.select('name', raw('IF(login_count > 100, ?, ?) as frequent_flyer', ['Yes', 'No'])).get();

// Pluck & Value
const userEmails = await User.pluck('email'); // ['a@b.com', 'c@d.com', ...]
const namesById = await User.pluck('name', 'id'); // { 1: 'John', 2: 'Jane', ... }
const adminEmail = await User.where('is_admin', true).value('email'); // 'admin@example.com' or null
```

---

## Relationships

Define relationships as getter methods on your models.

### Defining Relationships

```javascript
class User extends Model {
  // One-to-One: User has one Profile
  get profile() { return this.hasOne(Profile); } // Assumes Profile model, foreign key 'user_id' on profiles table
  // One-to-Many: User has many Posts
  get posts() { return this.hasMany(Post); } // Assumes Post model, foreign key 'user_id' on posts table
}

class Profile extends Model {
  // Inverse One-to-One: Profile belongs to User
  get user() { return this.belongsTo(User); } // Assumes foreign key 'user_id' on this (profiles) table
}

class Post extends Model {
  // Inverse One-to-Many: Post belongs to User (Author)
  get author() { return this.belongsTo(User, 'author_id'); } // Specify custom foreign key
  // Many-to-Many: Post belongs to many Tags
  get tags() { return this.belongsToMany(Tag); } // Assumes Tag model, pivot table 'post_tag', keys 'post_id', 'tag_id'
}

class Tag extends Model {
  // Many-to-Many: Tag belongs to many Posts
  get posts() { return this.belongsToMany(Post); }
}
```

### Querying Relations

```javascript
// Lazy Loading (Loads relation when first accessed)
const user = await User.find(1);
const userProfile = await user.profile; // Query executed here
const userPosts = await user.posts;     // Query executed here

// Querying Relationship Existence (has / doesntHave)
const usersWithPosts = await User.has('posts').get();
const usersWithAtLeastThreePosts = await User.has('posts', '>=', 3).get();
const usersWithoutProfile = await User.doesntHave('profile').get();

// Querying Based on Relationship Content (whereHas / orWhereHas)
const usersWithPublishedPosts = await User.whereHas('posts', (query) => {
  query.where('is_published', true);
}).get();

// Accessing the Relationship Query Builder
const user = await User.find(1);
const publishedPostsCount = await user.posts().where('is_published', true).count();
```

### Eager Loading

Solve the N+1 query problem by loading relationships upfront.

```javascript
// Eager load 'posts' relation for multiple users
const users = await User.with('posts').limit(10).get();
// Only 2 queries executed: one for users, one for posts

users.forEach(user => {
  // Accessing user.posts here does NOT trigger a new query
  console.log(user.name, user.posts.length);
});

// Eager load nested relations
const usersWithPostsAndComments = await User.with('posts.comments').get();

// Eager load multiple relations
const posts = await Post.with(['author', 'tags']).get();

// Eager load with constraints
const usersWithRecentPosts = await User.with({
  posts: (query) => query.where('created_at', '>', someDate).orderBy('created_at', 'desc')
}).get();
```

---

## Attributes

### Accessors & Mutators

Transform attribute values when getting or setting them. NodeORM uses Proxies to intercept property access, automatically calling conventional getter/setter methods.

```javascript
class User extends Model {
  // Accessor: Get value derived from attributes
  get fullName() { // Accessed via user.fullName
    return `${this.first_name} ${this.last_name}`;
  }
  // Or using conventional name (preferred for clarity)
  // getFullNameAttribute() {
  //   return `${this.first_name} ${this.last_name}`;
  // }

  // Mutator: Modify value before setting it in attributes
  set password(value) { // Called when user.password = '...' is set
    this._attributes.password = await bcrypt.hash(value, 10); // Example hashing
  }
  // Or using conventional name
  // setPasswordAttribute(value) {
  //   this._attributes.password = await bcrypt.hash(value, 10);
  // }
}

const user = await User.find(1);
console.log(user.fullName); // Accessor called

user.password = 'new-secret'; // Mutator called
await user.save();
```

### Attribute Casting

Automatically cast database values to common JavaScript types and back.

```javascript
class Settings extends Model {
  static casts = {
    is_enabled: 'boolean',      // DB 1/0 -> JS true/false
    threshold: 'float',         // DB string/numeric -> JS number
    retry_count: 'integer',     // DB string/numeric -> JS integer
    options: 'json',            // DB JSON string -> JS object/array
    run_schedule: 'array',      // Alias for json
    config: 'object',           // Alias for json
    last_run_at: 'datetime',    // DB datetime/timestamp -> JS Date
    start_date: 'date',         // DB date -> JS Date (time part ignored)
    expires_at: 'timestamp'     // Alias for datetime
  };
}

const settings = await Settings.find(1);
console.log(typeof settings.is_enabled); // 'boolean'
console.log(typeof settings.threshold);  // 'number'
console.log(Array.isArray(settings.run_schedule)); // true
console.log(settings.last_run_at instanceof Date); // true

settings.options = { timeout: 5000, retries: 3 }; // Set as object
settings.is_enabled = false;
await settings.save(); // Automatically converts back for DB storage
```

### Date Casting

Attributes defined in `casts` as `date`, `datetime`, or `timestamp`, as well as the default timestamp columns (`created_at`, `updated_at`, `deleted_at`), are automatically cast to JavaScript `Date` objects. NodeORM attempts to parse common database date/time string formats.

### JSON Casting

Attributes cast to `json`, `array`, or `object` will be automatically `JSON.parse`d when retrieved from the database and `JSON.stringify`d when saved.

---

## Serialization

Control how models are converted to plain objects or JSON strings.

```javascript
const user = await User.find(1);

// Convert to plain object
const userArray = user.toArray();

// Convert to JSON string
const userJson = user.toJSON(); // Equivalent to JSON.stringify(user.toArray())
console.log(userJson);
```

### Hiding Attributes

Exclude sensitive attributes like passwords from serialization.

```javascript
class User extends Model {
  static hidden = ['password', 'remember_token'];
}

const user = await User.find(1);
const output = user.toArray();
// output.password and output.remember_token will be undefined
```

### Visible Attributes

Explicitly define *only* the attributes that should be serialized. Overrides `hidden`.

```javascript
class User extends Model {
  static visible = ['id', 'name', 'email'];
}

const user = await User.find(1);
const output = user.toArray();
// Only id, name, email will be present
```

*Note: You can dynamically modify visibility per-instance using `user.makeVisible(['password'])` or `user.makeHidden(['email'])`.*

### Appending Values

Include the results of accessors in the serialized output.

```javascript
class User extends Model {
  static appends = ['fullName']; // Include result of getFullNameAttribute()

  get fullName() {
    return `${this.first_name} ${this.last_name}`;
  }
}

const user = await User.find(1);
const output = user.toArray();
// output.fullName will contain the computed value
```

---

## Events & Hooks

Hook into the model lifecycle (creating, created, updating, updated, saving, saved, deleting, deleted, restoring, restored).

```javascript
class User extends Model {
  static boot() {
    super.boot(); // Call parent boot

    // --- Register listeners using static methods ---

    // Before creating
    User.creating(async (user) => {
      if (!user.uuid) {
        user.uuid = generateUuid(); // Example: Set default value
      }
      console.log('Creating user:', user.email);
    });

    // After created
    User.created((user) => {
      sendWelcomeEmail(user); // Example: Trigger side effect
    });

    // Before saving (create or update)
    User.saving((user) => {
      console.log('Saving user:', user.name);
      // Return false to halt the save operation
      if (user.name === 'INVALID') {
        console.log('Save halted!');
        return false;
      }
    });

    // After deleting
    User.deleted((user, options) => {
        console.log(`User ${user.id} deleted.`);
        if(options.softDelete) console.log(' (Soft Deleted)');
        else console.log(' (Hard Deleted)');
        // Cleanup related data?
    });
  }
}

// Alternative registration (outside model class)
// User.updating(async (user) => { /* ... */ });
// User.saved((user) => { /* ... */ });
```

---

## Scopes

Define reusable query constraints.

### Global Scopes

Applied automatically to all queries for a model.

```javascript
class Post extends Model {
  static boot() {
    super.boot();
    // Example: Only include 'published' posts by default
    // Post.addGlobalScope('published', (query) => {
    //   query.where('is_published', true);
    // });

    // Soft deleting is implemented as a global scope automatically
    // if static softDeletes = true;
  }
}

// Queries automatically exclude non-published posts (if scope above is active)
const posts = await Post.all();

// Temporarily remove global scope(s)
const allPostsIncludingDrafts = await Post.query().withoutGlobalScope('published').get();
const allPostsAnyStatus = await Post.query().withoutGlobalScopes().get(); // Remove all

// Soft delete scopes are removed via specific methods:
const postsWithTrashed = await Post.withTrashed().get();
const onlyTrashedPosts = await Post.onlyTrashed().get();
```

### Local Scopes

Applied explicitly when needed. Define as static `scope<Name>` methods.

```javascript
class Post extends Model {
  // Local scope: scopePublished
  static scopePublished(query) {
    query.where('is_published', true);
  }

  // Local scope with parameters: scopeOfType
  static scopeOfType(query, type) {
    query.where('post_type', type);
  }
}

// Apply local scope
const publishedPosts = await Post.query().scope('published').get();
// Or using dynamic proxy method
const publishedPostsDynamic = await Post.published().get();

// Apply scope with parameters
const articles = await Post.query().scope('ofType', 'article').get();
// Or dynamic
const articlesDynamic = await Post.ofType('article').get();
```

---

## Transactions

Execute database operations within a transaction for atomicity.

```javascript
import { ConnectionManager } from 'nodeorm';

const connection = ConnectionManager.getConnection(); // Get default connection

try {
  const result = await connection.transaction(async (trxConnection) => {
    // All operations within this callback run in a transaction.
    // Use the passed trxConnection or models normally (if context propagation is set up).
    // For safety, explicitly use trxConnection with query builder:
    const user1 = await trxConnection.query(User).find(1);
    await user1.update({ login_count: user1.login_count + 1 }); // Uses instance method

    // If using static methods, ensure they pick up the transaction context
    // (Requires advanced setup or explicit passing)
    // For safety:
    await trxConnection.query(AuditLog).create({ userId: user1.id, action: 'login incremented' });

    // If any awaited operation throws an error, the transaction is automatically rolled back.

    // Explicit rollback (optional)
    // if (someCondition) {
    //   await trxConnection.rollback();
    //   return 'Manually rolled back'; // Callback still completes
    // }

    return 'Transaction successful'; // Return value is passed through
  });

  console.log(result); // 'Transaction successful' (unless rolled back)

} catch (error) {
  // Catches errors from inside the transaction callback *or* commit/rollback failures
  console.error('Transaction failed:', error);
}
```

---

## Raw Queries

Execute raw SQL when the query builder isn't sufficient. **Use with caution to prevent SQL injection vulnerabilities.** Always prefer parameterized queries.

```javascript
// Use connection.run() with parameter bindings (Safer)
const users = await connection.run(
  'SELECT * FROM users WHERE login_count > ? AND is_admin = ?',
  [10, true] // Bindings array
);

// Use connection.raw tagged template literal (Bindings handled automatically)
const namePattern = 'J%';
const limit = 5;
const activeUsers = await connection.raw`
  SELECT id, name FROM users
  WHERE name LIKE ${namePattern} AND status = ${'active'}
  ORDER BY created_at DESC
  LIMIT ${limit}
`;

// Raw expressions within Query Builder
import { raw } from 'nodeorm';
const counts = await User.select(
                    'status',
                    raw('COUNT(*) as user_count') // Use raw for aggregate function
                  )
                  .groupBy('status')
                  .get();
```

---

## Schema Builder

Define and modify database tables using a fluent, database-agnostic API.

```javascript
import { Schema, Blueprint } from 'nodeorm'; // Import Schema facade and Blueprint

// Create a new table
await Schema.create('flights', (table) => {
  table.id(); // Auto-incrementing BigInt primary key 'id'
  table.string('name');
  table.string('airline_code', 5).index(); // Add index
  table.integer('capacity').unsigned();
  table.decimal('price', 8, 2);
  table.boolean('is_domestic').default(true);
  table.timestamp('departed_at').nullable();
  table.timestamps(); // Adds nullable created_at and updated_at
});

// Modify an existing table
await Schema.table('users', (table) => { // or Schema.change(...)
  // Add a new column
  table.string('avatar_url').nullable().after('email'); // MySQL specific placement

  // Add an index
  table.index(['state', 'city']);

  // Note: Modifying/dropping columns requires more advanced SchemaGrammar features.
  // table.renameColumn('from', 'to'); // Not yet implemented in base grammar
  // table.dropColumn('obsolete_column'); // Not yet implemented in base grammar
});

// Drop a table
await Schema.dropIfExists('old_logs');
```

See `src/schema/Blueprint.js` for all available column types and modifiers.

---

## Migrations (Basic Runner)

NodeORM includes a basic *programmatic* migration runner. It does **not** include a CLI tool like `artisan migrate`.

1.  **Create Migration Files:** Place JavaScript files in a designated `migrations` folder (e.g., `project-root/migrations`). Use timestamp-based naming for ordering (e.g., `2023_11_01_100000_create_posts_table.js`). Each file must export `async up(schema, connection)` and optionally `async down(schema, connection)`.

    ```javascript
    // migrations/YYYY_MM_DD_HHMMSS_create_some_table.js
    /** @typedef {import('nodeorm/schema').Schema} Schema */
    /** @typedef {import('nodeorm/schema').Blueprint} Blueprint */

    export async function up(schema) {
      await schema.create('some_table', (table) => {
        table.id();
        table.string('title').unique();
        table.timestamps();
      });
    }

    export async function down(schema) {
      await schema.dropIfExists('some_table');
    }
    ```

2.  **Create a Runner Script:** (e.g., `scripts/migrate.js`)

    ```javascript
    // scripts/migrate.js
    import path from 'node:path';
    import { fileURLToPath } from 'node:url';
    import { Connection, ConnectionManager } from '../src/index.js'; // Adjust path
    import { Migrator } from '../src/migrations/Migrator.js'; // Adjust path

    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    async function run() {
      let connection;
      try {
        connection = await Connection.make(); // Use your connection setup
        const migrationsPath = path.resolve(__dirname, '../migrations');
        const migrator = new Migrator(connection, migrationsPath);
        const command = process.argv[2] || 'latest';

        if (command === 'rollback') await migrator.rollback();
        else await migrator.latest();

      } catch (error) { /* ... */ }
      finally { await ConnectionManager.disconnectAll(); }
    }
    run();
    ```

3.  **Add NPM Scripts:**

    ```json
    // package.json
    "scripts": {
      "migrate": "node scripts/migrate.js latest",
      "migrate:rollback": "node scripts/migrate.js rollback"
    }
    ```

4.  **Run:**
    *   `npm run migrate` / `yarn migrate`
    *   `npm run migrate:rollback` / `yarn migrate:rollback`

---

## Performance Considerations

NodeORM is designed with performance as a key goal. We aim to achieve this through:

*   **Minimal Core:** Very few dependencies outside of the database drivers themselves.
*   **Modern JavaScript:** Leveraging native features like Promises, async/await, and Proxies efficiently.
*   **Direct Driver Interaction:** The core query execution path aims to be thin, translating the fluent API calls into SQL and passing them to the driver with minimal intermediate layers compared to some older ORMs.
*   **Lazy Loading:** Relationships are only loaded when explicitly accessed or eager-loaded.

However, "blazing fast" is a bold claim that requires context and evidence. Performance depends heavily on your specific queries, database schema, hardware, and driver choice.

**We encourage the community to perform independent benchmarks** comparing NodeORM against other popular ORMs under various workloads. We are committed to optimizing performance based on feedback and real-world data.

---

## Extensibility (Custom Drivers)

NodeORM is designed to be extensible. You can create your own database drivers (e.g., for NoSQL databases or less common SQL dialects) by implementing the `BaseDriver` and potentially `BaseGrammar` / `BaseSchemaGrammar` interfaces.

1.  **Create Driver Class:** Extend `BaseDriver` (from `nodeorm/drivers`).
2.  **Implement Methods:** Implement `connect`, `disconnect`, `run`, `beginTransaction`, `commit`, `rollback`, `getTableSchema`, `describeTable`, `_createGrammar`, `_createSchemaGrammar`.
3.  **Create Grammar Classes (Optional but recommended):** Extend `BaseGrammar` and `BaseSchemaGrammar` to handle SQL dialect specifics.
4.  **Register/Use:** Configure NodeORM to use your custom driver, typically by passing an instance or using a custom `driver` name in the configuration object if you modify the `Connection.make` logic.

```javascript
import { BaseDriver, BaseGrammar, BaseSchemaGrammar } from 'nodeorm/drivers';

class MyCustomGrammar extends BaseGrammar { /* ... */ }
class MyCustomSchemaGrammar extends BaseSchemaGrammar { /* ... */ }

class MyCustomDriver extends BaseDriver {
  _createGrammar() { return new MyCustomGrammar(); }
  _createSchemaGrammar(queryGrammar) { return new MyCustomSchemaGrammar(queryGrammar); }
  async connect() { /* ... */ }
  async disconnect() { /* ... */ }
  async run(sql, bindings) { /* ... */ }
  // ... implement other abstract methods ...
}

// Usage:
// const myDriver = new MyCustomDriver({ /* config */ });
// const connection = await Connection.make(myDriver);
// or
// const connection = await Connection.make({ driver: 'custom', instance: myDriver });
```

---

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) file (you'll need to create this) for details on bug reports, feature requests, and pull requests.

---

## License

NodeORM is open-source software licensed under the [MIT license](LICENSE).
