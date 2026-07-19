CREATE TABLE IF NOT EXISTS archive_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'resolved' CHECK (status IN ('resolved', 'unresolved', 'ambiguous', 'removed', 'metadata_incomplete')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS archive_media_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_media_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  alias_type TEXT NOT NULL,
  alias_value TEXT NOT NULL,
  title_snapshot TEXT,
  year_snapshot INTEGER,
  resolution_method TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(source, alias_type, alias_value),
  FOREIGN KEY(archive_media_id) REFERENCES archive_media(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_archive_alias_lookup ON archive_media_aliases(alias_type, alias_value);

CREATE TABLE IF NOT EXISTS archive_watch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_media_id INTEGER,
  user_id INTEGER,
  source TEXT NOT NULL,
  source_record_key TEXT NOT NULL,
  source_account_key TEXT,
  source_guid TEXT,
  source_rating_key TEXT,
  title_snapshot TEXT NOT NULL,
  event_time TEXT,
  event_time_precision TEXT NOT NULL CHECK (event_time_precision IN ('second', 'day', 'unknown')),
  completed INTEGER,
  view_count INTEGER,
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('resolved', 'unresolved', 'ambiguous', 'metadata_incomplete')),
  captured_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(source, source_record_key),
  FOREIGN KEY(archive_media_id) REFERENCES archive_media(id) ON DELETE SET NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_archive_events_media_time ON archive_watch_events(archive_media_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_archive_events_user_time ON archive_watch_events(user_id, event_time DESC);

CREATE TABLE IF NOT EXISTS archive_event_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  left_event_id INTEGER NOT NULL,
  right_event_id INTEGER NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('same_event', 'same_media', 'duplicate')),
  method TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  created_at TEXT NOT NULL,
  UNIQUE(left_event_id, right_event_id, relation),
  FOREIGN KEY(left_event_id) REFERENCES archive_watch_events(id) ON DELETE CASCADE,
  FOREIGN KEY(right_event_id) REFERENCES archive_watch_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS archive_ingest_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (19, 'archive_owned_view_recovery');
