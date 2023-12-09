![NodeORM cover](https://raw.githubusercontent.com/obaydmerz/nodeorm/master/docs/cover.png)

# NodeORM - A laravel-like database management library for nodejs

NodeORM is a lightweight and flexible Object-Relational Mapping (ORM) library for Node.js applications inspired by `Laravel`'s one. It provides a seamless interface between JavaScript objects and relational databases, making it easier for developers to interact with their databases using familiar JavaScript syntax.

It simplifies and streamlines the process of working with relational databases, making database interactions more intuitive and developer-friendly. It empowers developers to focus on building robust applications without worrying about the complexities of database management. Whether you are working with MySQL, SQLite, or custom database solutions, NodeORM offers a seamless and consistent interface for your database needs.

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

- **Fully compatible:** The library automatically works with `mysql`, `mysql2` and-or `sqlite3`.

- **Multi connections:** You can connect to multiple databases at the same time seamlessly.

- **Unblocking structure:** This library is based on async-await syntax.

- _And much other stuff..._

## Installation

Currently you can install it directly from github

```bash
npm install obaydmerz/nodeorm
```

## Examples

```javascript
import { Model } from "@obayd/nodeorm";

class Test extends Model {}

(async () => {
  await Model.init("C:/Users/Hello/Documents/mysqlite.db", Test);

  const my = await Test.last();
  console.log(my.myVal);
})();
```

**_Easy, isn't it?_**

### Read more

For more information and advanced usage, check out the [NodeORM Wiki](https://github.com/obaydmerz/nodeorm/wiki)

You can join our [discord server](https://discord.gg/2xZEbG4Mb2).
