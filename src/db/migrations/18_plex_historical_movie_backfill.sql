CREATE TABLE IF NOT EXISTS plex_historical_backfill_runs (
  id TEXT PRIMARY KEY,
  cutoff_at TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT
);

CREATE TABLE IF NOT EXISTS plex_historical_backfill_users (
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  plex_user_id TEXT,
  plex_username TEXT NOT NULL,
  visibility_status TEXT NOT NULL,
  status TEXT NOT NULL,
  movie_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, user_id),
  FOREIGN KEY(run_id) REFERENCES plex_historical_backfill_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plex_historical_movie_snapshots (
  snapshot_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  plex_user_id TEXT,
  rating_key TEXT NOT NULL,
  plex_guid TEXT,
  title TEXT NOT NULL,
  library_name TEXT,
  view_count INTEGER,
  last_viewed_at TEXT,
  cutoff_at TEXT NOT NULL,
  queried_at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  error_code TEXT,
  imported_observation_id INTEGER,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(run_id) REFERENCES plex_historical_backfill_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(imported_observation_id) REFERENCES playback_observations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plex_historical_snapshots_user_time
  ON plex_historical_movie_snapshots(user_id, last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_plex_historical_snapshots_guid
  ON plex_historical_movie_snapshots(plex_guid);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (18, 'plex_historical_movie_backfill');
