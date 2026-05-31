PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plex_user_id TEXT,
  plex_username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  discord_user_id TEXT,
  is_source_user INTEGER NOT NULL DEFAULT 0,
  is_typical_cowatcher INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plex_username)
);

CREATE TABLE IF NOT EXISTS watch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_user_id INTEGER NOT NULL,
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
  prompt_status TEXT NOT NULL DEFAULT 'pending',
  discord_prompt_channel_id TEXT,
  discord_prompt_message_id TEXT,
  discord_prompt_sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_user_id, rating_key, watched_at),
  FOREIGN KEY(source_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cowatch_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_event_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  confirmed_by_discord_user_id TEXT,
  confirmation_method TEXT NOT NULL,
  status TEXT NOT NULL,
  plex_sync_status TEXT,
  plex_sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(watch_event_id, target_user_id),
  FOREIGN KEY(watch_event_id) REFERENCES watch_events(id),
  FOREIGN KEY(target_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS copy_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_user_id INTEGER NOT NULL,
  target_user_ids_json TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  status TEXT NOT NULL,
  preview_count INTEGER NOT NULL DEFAULT 0,
  copied_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(source_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS copy_job_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_job_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  rating_key TEXT NOT NULL,
  media_type TEXT NOT NULL,
  title TEXT NOT NULL,
  show_title TEXT,
  season_number INTEGER,
  episode_number INTEGER,
  watched_at TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(copy_job_id, target_user_id, rating_key),
  FOREIGN KEY(copy_job_id) REFERENCES copy_jobs(id),
  FOREIGN KEY(target_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor TEXT,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  watch_event_id INTEGER,
  copy_job_item_id INTEGER,
  target_user_id INTEGER,
  rating_key TEXT,
  error TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (1, 'plex_cowatch_sync_initial');
