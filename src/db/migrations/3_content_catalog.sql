CREATE TABLE IF NOT EXISTS content_catalog (
  rating_key TEXT PRIMARY KEY,
  guid TEXT,
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  duration INTEGER,
  library_id TEXT,
  library_title TEXT,
  genres_json TEXT,
  grandparent_rating_key TEXT,
  grandparent_guid TEXT,
  grandparent_title TEXT,
  parent_rating_key TEXT,
  parent_guid TEXT,
  parent_title TEXT,
  leaf_count INTEGER,
  source_provenance TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (3, 'content_catalog_initial');
