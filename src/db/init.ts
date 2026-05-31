import { openMigratedDatabase } from "./database.js";

const db = openMigratedDatabase();
const migrations = db.prepare("SELECT version, name, applied_at FROM schema_migrations ORDER BY version").all();
console.log(JSON.stringify({ ok: true, migrations }, null, 2));
db.close();
