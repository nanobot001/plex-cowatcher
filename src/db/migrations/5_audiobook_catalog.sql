-- Version 5 migration reference.
-- Existing databases are migrated transactionally by migrateAudiobooks() in src/db/database.ts.
-- Fresh databases receive the same schema from src/db/schema.sql.
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