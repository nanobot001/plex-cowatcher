import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { appConfig } from "../utils/config.js";
import { canonicalizeAudiobookSeriesTitle } from "../service/audiobookService.js";

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
  ensureColumn(db, "users", "dashboard_alias", "TEXT");
  ensureColumn(db, "users", "dashboard_shown", "INTEGER NOT NULL DEFAULT 1");
  migrateDashboardPreferences(db);
  migrateAudiobooks(db);
  normalizeAudiobookSeriesTitles(db);
  migrateAudiobookHierarchy(db);
}

function migrateDashboardPreferences(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 9").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE users
      SET
        dashboard_alias = CASE
          WHEN trim(coalesce(display_name, '')) = '' THEN NULL
          WHEN trim(display_name) = trim(plex_username) THEN NULL
          ELSE display_name
        END,
        dashboard_shown = enabled,
        updated_at = COALESCE(updated_at, datetime('now'))
    `).run();
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (9, ?)").run("dashboard_preferences");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobooks(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 5").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_key TEXT NOT NULL UNIQUE,
        asin TEXT,
        isbn TEXT,
        google_books_id TEXT,
        title TEXT NOT NULL,
        subtitle TEXT,
        authors_json TEXT NOT NULL DEFAULT '[]',
        narrators_json TEXT NOT NULL DEFAULT '[]',
        series_title TEXT,
        series_index REAL,
        year INTEGER,
        description TEXT,
        cover_url TEXT,
        genres_json TEXT NOT NULL DEFAULT '[]',
        language TEXT,
        total_duration_seconds INTEGER,
        chapter_count INTEGER,
        source_provenance TEXT NOT NULL,
        folder_path_hint TEXT,
        enrichment_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ab_asin
        ON audiobook_books(asin) WHERE asin IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_ab_series
        ON audiobook_books(series_title) WHERE series_title IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_ab_enrichment
        ON audiobook_books(enrichment_status);
    `);
    ensureColumn(db, "content_catalog", "file_path", "TEXT");
    ensureColumn(db, "content_catalog", "audiobook_id", "INTEGER REFERENCES audiobook_books(id)");
    db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_audiobook
      ON content_catalog(audiobook_id) WHERE audiobook_id IS NOT NULL`);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (5, ?)").run("audiobook_catalog_initial");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}


function normalizeAudiobookSeriesTitles(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 6").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    const canonicalSeries = canonicalizeAudiobookSeriesTitle("The Wheel of Time");
    if (canonicalSeries) {
      db.prepare(`
        UPDATE audiobook_books
        SET series_title = ?
        WHERE lower(trim(COALESCE(series_title, ''))) IN ('wheel of time', 'the wheel of time')
      `).run(canonicalSeries);
      db.prepare(`
        UPDATE content_catalog
        SET grandparent_title = ?
        WHERE audiobook_id IN (
          SELECT id FROM audiobook_books
          WHERE lower(trim(COALESCE(series_title, ''))) = lower(trim(?))
        )
      `).run(canonicalSeries, canonicalSeries);
    }
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (6, ?)").run("audiobook_series_title_normalization");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobookHierarchy(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 7").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "audiobook_books", "parent_series_title", "TEXT");
    ensureColumn(db, "audiobook_books", "subseries_title", "TEXT");
    ensureColumn(db, "audiobook_books", "related_work_classification", "TEXT");
    ensureColumn(db, "audiobook_books", "hierarchy_provenance", "TEXT");
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audiobook_books_parent_series
      ON audiobook_books(parent_series_title) WHERE parent_series_title IS NOT NULL`);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (7, ?)").run("audiobook_hierarchy");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
