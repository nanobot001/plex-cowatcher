ALTER TABLE playback_observations ADD COLUMN session_start_at TEXT;
ALTER TABLE playback_observations ADD COLUMN session_end_at TEXT;
ALTER TABLE tautulli_ingestion_rows ADD COLUMN session_start_at TEXT;
ALTER TABLE tautulli_ingestion_rows ADD COLUMN session_end_at TEXT;

CREATE TABLE IF NOT EXISTS plex_history_ingestion_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'incomplete', 'failed')),
  requested_user_id INTEGER,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'episode', 'all')),
  page_size INTEGER NOT NULL,
  date_from TEXT,
  date_to TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT,
  FOREIGN KEY(requested_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS plex_history_ingestion_users (
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  plex_username TEXT NOT NULL,
  local_account_id TEXT,
  cursor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'incomplete')),
  first_page_fingerprint TEXT,
  source_total INTEGER,
  page_count INTEGER NOT NULL DEFAULT 0,
  returned_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  already_present_count INTEGER NOT NULL DEFAULT 0,
  linked_count INTEGER NOT NULL DEFAULT 0,
  unresolved_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (run_id, user_id),
  FOREIGN KEY(run_id) REFERENCES plex_history_ingestion_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plex_history_ingestion_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  page_length INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  page_fingerprint TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, user_id, start_offset),
  FOREIGN KEY(run_id) REFERENCES plex_history_ingestion_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plex_history_ingestion_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  source_record_key TEXT NOT NULL,
  archive_event_id INTEGER,
  media_type TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('imported', 'already_present', 'unresolved', 'failed')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, user_id, source_record_key),
  FOREIGN KEY(page_id) REFERENCES plex_history_ingestion_pages(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES plex_history_ingestion_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(archive_event_id) REFERENCES archive_watch_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plex_history_runs_status ON plex_history_ingestion_runs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_plex_history_users_status ON plex_history_ingestion_users(run_id, status);
CREATE INDEX IF NOT EXISTS idx_plex_history_pages_cursor ON plex_history_ingestion_pages(run_id, user_id, start_offset);
CREATE INDEX IF NOT EXISTS idx_plex_history_rows_event ON plex_history_ingestion_rows(archive_event_id);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (25, 'plex_play_history_recovery');
