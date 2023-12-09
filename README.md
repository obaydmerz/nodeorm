![NodeORM cover](https://raw.githubusercontent.com/obaydmerz/nodeorm/master/docs/cover.png)

# NodeORM - A laravel-like database management library for nodejs

NodeORM is a lightweight and flexible Object-Relational Mapping (ORM) library for Node.js applications inspired by `Laravel`'s one. It provides a seamless interface between JavaScript objects and relational databases, making it easier for developers to interact with their databases using familiar JavaScript syntax.

It simplifies and streamlines the process of working with relational databases, making database interactions more intuitive and developer-friendly. It empowers developers to focus on building robust applications without worrying about the complexities of database management. Whether you are working with MySQL, SQLite, or custom database solutions, NodeORM offers a seamless and consistent interface for your database needs.

## Installation

It's heavily recommended to install from github to get latest changes.

```bash
npm install obaydmerz/nodeorm
```

However, for most stable builds you could use npm.

```bash
npm install @obayd/nodeorm
```

### Keyfeatures

- **Database Agnostic:** NodeORM supports multiple database drivers, including MySQL, SQLite, and custom raw function drivers, allowing users to work with their preferred databases.

- **Model Definition:** Users can define their database models with properties such as table name, columns, and primary keys. This enables easy mapping of database tables to JavaScript classes.

- **Fluent Query Building:** With a fluent method chaining syntax, NodeORM allows users to construct complex SQL queries in a natural and intuitive way, making it easy to create dynamic queries for database operations.

- **ModelItem Class:** The ModelItem class represents individual items (rows) in the database table with CRUD methods. Users can interact with specific database records using this class.

- **Collection Class:** The Collection class represents a group of ModelItems with grouping and filtering capabilities. It enables users to work with multiple records as a cohesive unit.

- **Error Handling:** NodeORM defines custom error classes for specific error scenarios, such as EmptyDataError and UnmatchingStateError. This helps users handle errors more effectively and gracefully.

- **Dynamic Model Creation:** Users can dynamically create models during runtime, eliminating the need to predefine them. This flexibility allows for more dynamic and adaptive database interactions.

- **Lazy Loading:** NodeORM employs lazy loading optimizations during iteration, improving performance when dealing with large datasets.

- **Dependency-less:** A plug and play library.

- **Fully compatible:** The library automatically plugs with `mysql`, `mysql2` and-or `sqlite3`.

- **Multi connections:** You can connect to multiple databases at the same time seamlessly.

- **Unblocking structure:** This library is based on async-await syntax.

- _And much other stuff..._

## Examples

```javascript
// SQLite example
import { Model } from "@obayd/nodeorm";

class Test extends Model {}

(async () => {
  await Model.init("C:/Users/Hello/Documents/mysqlite.db", Test);

  const my = await Test.last();
  console.log(my.myVal);
})();
```

```javascript
// MySQL example
import { Model, initialize } from "@obayd/nodeorm";

class Test extends Model {}

(async () => {
  await initialize("mysql://root@localhost:3306", Test);

  const my = await Test.last();
  console.log(my.myVal);
})();
```

![NodeORM cover](https://raw.githubusercontent.com/obaydmerz/nodeorm/master/docs/cover.png)
# NodeORM - A laravel-like database management library for nodejs

NodeORM is a lightweight and flexible Object-Relational Mapping (ORM) library for Node.js applications inspired by `Laravel`'s one. It provides a seamless interface between JavaScript objects and relational databases, making it easier for developers to interact with their databases using familiar JavaScript syntax.

It simplifies and streamlines the process of working with relational databases, making database interactions more intuitive and developer-friendly. It empowers developers to focus on building robust applications without worrying about the complexities of database management. Whether you are working with MySQL, SQLite, or custom database solutions, NodeORM offers a seamless and consistent interface for your database needs.

## Installation

It's heavily recommended to install from github to get latest changes.

```bash
npm install obaydmerz/nodeorm
```

However, for most stable builds you could use npm.

```bash
npm install @obayd/nodeorm
```

## Keyfeatures

- **Database Agnostic:** NodeORM supports multiple database drivers, including MySQL, SQLite, and custom raw function drivers, allowing users to work with their preferred databases.

- **Model Definition:** Users can define their database models with properties such as table name, columns, and primary keys. This enables easy mapping of database tables to JavaScript classes.

- **Fluent Query Building:** With a fluent method chaining syntax, NodeORM allows users to construct complex SQL queries in a natural and intuitive way, making it easy to create dynamic queries for database operations.

- **ModelItem Class:** The ModelItem class represents individual items (rows) in the database table with CRUD methods. Users can interact with specific database records using this class.

- **Collection Class:** The Collection class represents a group of ModelItems with grouping and filtering capabilities. It enables users to work with multiple records as a cohesive unit.

- **Error Handling:** NodeORM defines custom error classes for specific error scenarios, such as EmptyDataError and UnmatchingStateError. This helps users handle errors more effectively and gracefully.

- **Dynamic Model Creation:** Users can dynamically create models during runtime, eliminating the need to predefine them. This flexibility allows for more dynamic and adaptive database interactions.

- **Lazy Loading:** NodeORM employs lazy loading optimizations during iteration, improving performance when dealing with large datasets.

- **Dependency-less:** A plug and play library.

- **Fully compatible:** The library automatically plugs with `mysql`, `mysql2` and-or `sqlite3`.

- **Multi connections:** You can connect to multiple databases at the same time seamlessly.

- **Unblocking structure:** This library is based on async-await syntax.

- _And much other stuff..._

## Driver Usage
NodeORM will choose the best library to connect to MySQL server.
Consider this little example.

### MySQL Usage

| Condition                                         | Library Used                   |
|---------------------------------------------------|--------------------------------|
| Both `mysql2` and `mysql` are present             | `mysql2`                       |
| Only `mysql2` is present                          | `mysql2`                       |
| Only `mysql` is present                           | `mysql`                        |
| `MySQLDBDriver.library = "mysql2"`                | `mysql2`                       |
| `MySQLDBDriver.library = "mysql"`                 | `mysql`                        |
| `MySQLDBDriver.library = "xxx"`                   | `xxx`                          |
| Using env and `DB_LIBRARY` is unset               | MySQLDBDriver.library `mysql2` |
| Using env and `DB_LIBRARY` is set to `mysql2`     | `mysql2`                       |
| Using env and `DB_LIBRARY` is set to `mysql`      | `mysql`                        |
| Using env and `DB_LIBRARY` is set to `xxx`        | `xxx`                          |


### SQLite Usage

| Condition                                           | Library Used                     |
|-----------------------------------------------------|----------------------------------|
| `sqlite3` is present                                | `sqlite3`                        |
| `SQLiteDBDriver.library = "sqlite3"`                | `sqlite3`                        |
| `SQLiteDBDriver.library = "xxx"`                    | `xxx`                            |
| Using env and `DB_LIBRARY` is unset                 | SQLiteDBDriver.library `sqlite3` |
| Using env and `DB_LIBRARY` is set to `sqlite3`      | `sqlite3`                        |
| Using env and `DB_LIBRARY` is set to `xxx`          | `xxx`                            |

## Examples

Let's assume that we have the following MySQL structure.

![image](https://github.com/obaydmerz/nodeorm/assets/45913764/4b379c0a-e2ed-43f2-aef1-6b145c49f200)

```javascript
// MySQL example
// Inserting a new row/item into a table named `test`.

import { Model, initialize } from "@obayd/nodeorm";

class Test extends Model {}

(async () => {
  await initialize("mysql://root@localhost:3306/mydb", Test);

  const myNewItem = Test.create();

  myNewItem.string_value = "We have a better tomorrow!";
  myNewItem.integer_value = 2024;

  await myNewItem.save();

  console.log(myNewItem.id); // Output: 1
})();
```

_Changes in database:_

![image](https://github.com/obaydmerz/nodeorm/assets/45913764/739154df-3e13-49c4-b9f1-361dce2bf661)


```javascript
// Reading the row that we just inserted.
// We used here an attribute *getter*

import { Model, initialize } from "../index.js";

class Test extends Model {
  static _ourPhrase() {
    // We used here an attribute *getter*
    // Note we used the following syntax _attributeName
    return this.string_value + " in the year of " + this.integer_value;
  }
}

(async () => {
  await initialize("mysql://root@localhost:3306/mydb", Test);

  const myLastItem = await Test.last();

  // We accessed an additional attribute.
  console.log(myLastItem.ourPhrase); // Output: We have a better tomorrow! in the year of 2024
})();

```

```javascript
// Editing the row that we just inserted.

import { Model, initialize } from "@obayd/nodeorm";

class Test extends Model {}

(async () => {
  await initialize("mysql://root@localhost:3306/mydb", Test);

  const myLastItem = await Test.last();

  myLastItem.integer_value = 2025;

  await myLastItem.save();
})();
```

_Changes in database:_

![image](https://github.com/obaydmerz/nodeorm/assets/45913764/1f14105d-c9cc-47df-96a7-c9bfe4564037)

```javascript
// Deleting the row that we just inserted.
// Demonstrates how to use find() to *find* items

import { Model, initialize } from "@obayd/nodeorm";

class Test extends Model {}

(async () => {
  await initialize("mysql://root@localhost:3306/mydb", Test);

  //const myLastItem = await Test.last();

  // We used find() syntax instead of last() just to demonstrate how it works.
  //const myLastItem = await Test.where("id", 1);
  //const myLastItem = await Test.where("id", "=", 1);
  const myLastItem = await Test.find(1);

  await myLastItem.delete();
})();

```

_Changes in database:_

![image](https://github.com/obaydmerz/nodeorm/assets/45913764/fda459f3-d8a9-4db8-b6f9-8a5ff3476631)

##### [HeidiSQL](https://github.com/HeidiSQL/HeidiSQL) is used to show database changes, consider supporting it.


#### Multi-support
NodeORM features accessing and managing other types of databases like sqlite.


```javascript
// SQLite example
import { Model, initialize } from "@obayd/nodeorm";

class Test extends Model {}

(async () => {
  await initialize("C:/Users/Hello/Documents/mysqlite.db", Test);

  const my = await Test.last();
  console.log(my.string_value);
})();
```

**_Easy, isn't it?_**

### Read more

For more information and advanced usage, check out the [NodeORM Wiki](https://github.com/obaydmerz/nodeorm/wiki)

You can join our [discord server](https://discord.gg/2xZEbG4Mb2).


