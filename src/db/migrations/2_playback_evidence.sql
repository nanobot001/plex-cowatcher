CREATE TABLE IF NOT EXISTS playback_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tautulli_row_id TEXT,
  rating_key TEXT NOT NULL,
  grandparent_rating_key TEXT,
  parent_rating_key TEXT,
  plex_guid TEXT,
  media_type TEXT NOT NULL,
  library_name TEXT,
  title TEXT NOT NULL,
  show_title TEXT,
  season_number INTEGER,
  episode_number INTEGER,
  watched_at TEXT NOT NULL,
  watched_at_provenance TEXT,
  percent_complete INTEGER,
  percent_complete_provenance TEXT,
  view_offset INTEGER,
  duration INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, rating_key, watched_at),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (2, 'playback_evidence_initial');
