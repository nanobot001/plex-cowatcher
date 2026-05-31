# Node SQLite State Initializer

This project requested a Node-oriented SQLite initializer scaffold.

The global `seed` skill does not add npm dependencies or generate code that imports undeclared packages. To initialize `state/project.sqlite` from Node, first choose and install an SQLite package for this project, then wire a project-local script that:

1. Reads `state/schema.sql`.
2. Creates `state/` if needed.
3. Opens `state/project.sqlite`.
4. Executes the schema.
5. Exits non-zero on failure.

Keep this initializer dependency-explicit in `package.json`, and do not commit generated `.sqlite` files.
