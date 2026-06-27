import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { appConfig } from "../utils/config.js";

export type Db = DatabaseSync;

export function openDatabase(sqlitePath = appConfig.SQLITE_PATH): Db {
  const absolutePath = path.resolve(sqlitePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const db = new DatabaseSync(absolutePath);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function migrateDatabase(db: Db): void {
  const sourceSchema = path.resolve("src/db/schema.sql");
  const builtSchema = new URL("./schema.sql", import.meta.url);
  const schema = fs.existsSync(sourceSchema)
    ? fs.readFileSync(sourceSchema, "utf8")
    : fs.readFileSync(builtSchema, "utf8");
  db.exec(schema);
  ensureColumn(db, "watch_events", "discord_prompt_channel_id", "TEXT");
  ensureColumn(db, "watch_events", "discord_prompt_message_id", "TEXT");
  ensureColumn(db, "watch_events", "discord_prompt_sent_at", "TEXT");
  ensureColumn(db, "copy_job_items", "plex_guid", "TEXT");
  ensureColumn(db, "users", "is_home_user", "INTEGER NOT NULL DEFAULT 0");
}

function ensureColumn(db: Db, tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export function openMigratedDatabase(sqlitePath = appConfig.SQLITE_PATH): Db {
  const db = openDatabase(sqlitePath);
  migrateDatabase(db);
  return db;
}
