ALTER TABLE plex_historical_backfill_users ADD COLUMN episode_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS plex_historical_recovery_items (
  snapshot_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  plex_user_id TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'episode')),
  rating_key TEXT NOT NULL,
  plex_guid TEXT,
  grandparent_rating_key TEXT,
  parent_rating_key TEXT,
  title TEXT NOT NULL,
  show_title TEXT,
  season_number INTEGER,
  episode_number INTEGER,
  library_name TEXT,
  view_count INTEGER,
  last_viewed_at TEXT,
  cutoff_at TEXT NOT NULL,
  queried_at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  source_status TEXT NOT NULL CHECK (source_status IN ('unknown', 'plex_only', 'tautulli_backed', 'reconciled')),
  error_code TEXT,
  imported_observation_id INTEGER,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(run_id) REFERENCES plex_historical_backfill_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(imported_observation_id) REFERENCES playback_observations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plex_historical_recovery_items_user_type
  ON plex_historical_recovery_items(user_id, media_type, last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_plex_historical_recovery_items_guid
  ON plex_historical_recovery_items(plex_guid, media_type);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (24, 'plex_supplemental_historical_recovery');
