CREATE TABLE IF NOT EXISTS tautulli_ingestion_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'tautulli',
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'incomplete', 'failed')),
  requested_user_id INTEGER,
  page_size INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT,
  FOREIGN KEY(requested_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tautulli_ingestion_users (
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  plex_username TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'incomplete')),
  page_count INTEGER NOT NULL DEFAULT 0,
  source_row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (run_id, user_id),
  FOREIGN KEY(run_id) REFERENCES tautulli_ingestion_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tautulli_ingestion_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  page_length INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  source_row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  page_fingerprint TEXT,
  error_code TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_id, user_id, start_offset),
  FOREIGN KEY(run_id) REFERENCES tautulli_ingestion_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tautulli_ingestion_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  source_row_key TEXT NOT NULL,
  source_row_id TEXT,
  rating_key TEXT NOT NULL,
  plex_guid TEXT,
  identity_key TEXT NOT NULL,
  media_type TEXT NOT NULL,
  watched_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('stored', 'already_present', 'failed')),
  observation_id INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, user_id, source_row_key),
  FOREIGN KEY(page_id) REFERENCES tautulli_ingestion_pages(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES tautulli_ingestion_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(observation_id) REFERENCES playback_observations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_runs_status
  ON tautulli_ingestion_runs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_users_status
  ON tautulli_ingestion_users(run_id, status);
CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_pages_user_start
  ON tautulli_ingestion_pages(run_id, user_id, start_offset);
CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_rows_identity
  ON tautulli_ingestion_rows(run_id, user_id, identity_key);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (22, 'tautulli_ingestion_reconciliation');
