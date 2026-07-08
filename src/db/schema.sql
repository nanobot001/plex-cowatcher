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
  dashboard_alias TEXT,
  dashboard_shown INTEGER NOT NULL DEFAULT 1,
  discord_user_id TEXT,
  is_source_user INTEGER NOT NULL DEFAULT 0,
  is_typical_cowatcher INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_home_user INTEGER NOT NULL DEFAULT 0,
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
  plex_guid TEXT,
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

CREATE TABLE IF NOT EXISTS cowatch_adjudications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL,
  source_user_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  rating_key TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  supporting_observation_ids_json TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('yes', 'no', 'not_sure', 'clear')),
  actor_kind TEXT NOT NULL,
  method TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_user_id) REFERENCES users(id),
  FOREIGN KEY(target_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_cowatch_adjudications_candidate
  ON cowatch_adjudications(candidate_id, id DESC);

CREATE TABLE IF NOT EXISTS cowatch_review_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'resolved', 'failed', 'cancelled')),
  requested_by TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  discord_channel_id TEXT,
  discord_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cowatch_review_prompts_candidate
  ON cowatch_review_prompts(candidate_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cowatch_review_prompts_open
  ON cowatch_review_prompts(candidate_id) WHERE status IN ('pending', 'sent');

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (1, 'plex_cowatch_sync_initial');

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
  parent_series_title TEXT,
  subseries_title TEXT,
  related_work_classification TEXT,
  hierarchy_provenance TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audiobook_books_asin
  ON audiobook_books(asin) WHERE asin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_audiobook_books_google_id
  ON audiobook_books(google_books_id) WHERE google_books_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audiobook_books_series
  ON audiobook_books(series_title) WHERE series_title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audiobook_books_enrichment
  ON audiobook_books(enrichment_status);

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
  refreshed_at TEXT NOT NULL,
  file_path TEXT,
  audiobook_id INTEGER REFERENCES audiobook_books(id)
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (3, 'content_catalog_initial');

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (4, 'app_settings_initial');

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
VALUES ('prompt_for_audiobooks', 'false', datetime('now'));

CREATE INDEX IF NOT EXISTS idx_playback_dashboard_time
  ON playback_observations(watched_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_playback_dashboard_user_time
  ON playback_observations(user_id, watched_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_playback_dashboard_library_time
  ON playback_observations(library_name, watched_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_watch_events_prompt_time
  ON watch_events(prompt_status, watched_at DESC, id DESC);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (8, 'dashboard_query_indexes');

CREATE INDEX IF NOT EXISTS idx_content_catalog_grandparent
  ON content_catalog(grandparent_rating_key);
CREATE INDEX IF NOT EXISTS idx_content_catalog_audiobook
  ON content_catalog(audiobook_id) WHERE audiobook_id IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (12, 'content_catalog_hierarchy_indexes');
