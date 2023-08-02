# NodeORM

NodeORM is a lightweight and flexible Object-Relational Mapping (ORM) library for Node.js applications inspired by `Laravel`'s one. It provides a seamless interface between JavaScript objects and relational databases, making it easier for developers to interact with their databases using familiar JavaScript syntax.

It simplifies and streamlines the process of working with relational databases, making database interactions more intuitive and developer-friendly. It empowers developers to focus on building robust applications without worrying about the complexities of database management. Whether you are working with MySQL, SQLite, or custom database solutions, NodeORM offers a seamless and consistent interface for your database needs.

**You should see wiki for another information**

### Keyfeatures
1. Database Agnostic: NodeORM supports multiple database drivers, including MySQL, SQLite, and custom raw function drivers, allowing users to work with their preferred databases.

2. Model Definition: Users can define their database models with properties such as table name, columns, and primary keys. This enables easy mapping of database tables to JavaScript classes.

3. Fluent Query Building: With a fluent method chaining syntax, NodeORM allows users to construct complex SQL queries in a natural and intuitive way, making it easy to create dynamic queries for database operations.

4. ModelItem Class: The ModelItem class represents individual items (rows) in the database table with CRUD methods. Users can interact with specific database records using this class.

5. Collection Class: The Collection class represents a group of ModelItems with grouping and filtering capabilities. It enables users to work with multiple records as a cohesive unit.

6. Error Handling: NodeORM defines custom error classes for specific error scenarios, such as EmptyDataError and UnmatchingStateError. This helps users handle errors more effectively and gracefully.

7. Dynamic Model Creation: Users can dynamically create models during runtime, eliminating the need to predefine them. This flexibility allows for more dynamic and adaptive database interactions.

8. Lazy Loading: NodeORM employs lazy loading optimizations during iteration, improving performance when dealing with large datasets.

9. Dependency-less: A plug and play library.

10. Fully compatible: The library automatically works with `mysql`, `mysql2` and-or `sqlite3`.

11. Multi connections: You can connect to multiple databases at the same time seamlessly.

12. Unblocking structure: This library is based on async-await syntax.

13. And much other stuff...
