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
  identity_status TEXT NOT NULL DEFAULT 'pending',
  identity_provenance TEXT,
  current_media_revision TEXT,
  active_chapter_revision_id INTEGER,
  media_revision_updated_at TEXT,
  enrichment_last_attempt_at TEXT,
  enrichment_next_attempt_at TEXT,
  enrichment_attempt_count INTEGER NOT NULL DEFAULT 0,
  enrichment_last_error_code TEXT,
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
  artwork_poster_fingerprint TEXT,
  artwork_backdrop_fingerprint TEXT,
  file_path TEXT,
  audiobook_id INTEGER REFERENCES audiobook_books(id),
  last_seen_at TEXT,
  last_seen_scan_id INTEGER
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

CREATE TABLE IF NOT EXISTS audiobook_chapter_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_status TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  refreshed_at TEXT NOT NULL,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
  UNIQUE(audiobook_id, source_type)
);

CREATE TABLE IF NOT EXISTS audiobook_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_offset_ms INTEGER NOT NULL,
  end_offset_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
  UNIQUE(audiobook_id, chapter_index)
);

CREATE INDEX IF NOT EXISTS idx_audiobook_chapters_book ON audiobook_chapters(audiobook_id);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (13, 'audiobook_chapters');

CREATE TABLE IF NOT EXISTS audiobook_discovery_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  current_run_id INTEGER,
  next_run_at TEXT
);

INSERT OR IGNORE INTO audiobook_discovery_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS audiobook_discovery_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_reason TEXT NOT NULL,
  status TEXT NOT NULL,
  library_title TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  safe_error_code TEXT,
  counts_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audiobook_discovery_runs_started
  ON audiobook_discovery_runs(started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS audiobook_discovery_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  media_revision TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  manifest_status TEXT NOT NULL DEFAULT 'pending',
  safe_outcome_code TEXT,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id),
  UNIQUE(audiobook_id, media_revision)
);

CREATE INDEX IF NOT EXISTS idx_audiobook_discovery_outbox_pending
  ON audiobook_discovery_outbox(consumed_at, id);
CREATE INDEX IF NOT EXISTS idx_content_catalog_guid
  ON content_catalog(guid) WHERE guid IS NOT NULL;

CREATE TABLE IF NOT EXISTS audiobook_media_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  media_revision TEXT NOT NULL,
  track_count INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  total_duration_ms INTEGER,
  manifest_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
  UNIQUE(audiobook_id, media_revision)
);

CREATE TABLE IF NOT EXISTS audiobook_media_revision_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id INTEGER NOT NULL,
  item_order INTEGER NOT NULL,
  stable_identity TEXT NOT NULL,
  duration_ms INTEGER,
  private_file_path TEXT,
  path_hash TEXT,
  FOREIGN KEY(revision_id) REFERENCES audiobook_media_revisions(id) ON DELETE CASCADE,
  UNIQUE(revision_id, item_order)
);

CREATE TABLE IF NOT EXISTS audiobook_chapter_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  media_revision TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_status TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  chapter_digest TEXT NOT NULL,
  duration_ms INTEGER,
  contract_version INTEGER NOT NULL DEFAULT 1,
  resolver_version TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  activated_at TEXT,
  invalidated_at TEXT,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
  UNIQUE(audiobook_id, media_revision, source_type, chapter_digest)
);

CREATE TABLE IF NOT EXISTS audiobook_chapter_revision_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_revision_id INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_offset_ms INTEGER NOT NULL,
  end_offset_ms INTEGER NOT NULL,
  FOREIGN KEY(chapter_revision_id) REFERENCES audiobook_chapter_revisions(id) ON DELETE CASCADE,
  UNIQUE(chapter_revision_id, chapter_index)
);

CREATE INDEX IF NOT EXISTS idx_audiobook_media_revisions_book
  ON audiobook_media_revisions(audiobook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audiobook_chapter_revisions_book
  ON audiobook_chapter_revisions(audiobook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audiobook_proof_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  current_job_id INTEGER,
  last_completed_at TEXT,
  next_run_at TEXT
);
INSERT OR IGNORE INTO audiobook_proof_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS audiobook_proof_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  media_revision TEXT NOT NULL,
  outbox_id INTEGER,
  state TEXT NOT NULL CHECK (state IN ('pending','running','retry_wait','succeeded','failed_terminal','unsupported_multi_file')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  safe_result_code TEXT,
  diagnostic_source TEXT,
  diagnostic_confidence TEXT,
  diagnostic_chapter_count INTEGER,
  diagnostic_warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
  FOREIGN KEY(outbox_id) REFERENCES audiobook_discovery_outbox(id),
  UNIQUE(audiobook_id, media_revision)
);
CREATE INDEX IF NOT EXISTS idx_audiobook_proof_jobs_eligible
  ON audiobook_proof_jobs(state, next_attempt_at, id);

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

CREATE INDEX IF NOT EXISTS idx_archive_alias_lookup
  ON archive_media_aliases(alias_type, alias_value);

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
  account_resolution_method TEXT NOT NULL DEFAULT 'unknown',
  account_confidence TEXT NOT NULL DEFAULT 'unknown',
  captured_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(source, source_record_key),
  FOREIGN KEY(archive_media_id) REFERENCES archive_media(id) ON DELETE SET NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_archive_events_media_time
  ON archive_watch_events(archive_media_id, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_archive_events_user_time
  ON archive_watch_events(user_id, event_time DESC);

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

CREATE TABLE IF NOT EXISTS archive_observation_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_event_id INTEGER NOT NULL,
  playback_observation_id INTEGER NOT NULL,
  relation TEXT NOT NULL CHECK (relation IN ('same_event', 'same_media', 'duplicate')),
  method TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  created_at TEXT NOT NULL,
  UNIQUE(archive_event_id, playback_observation_id, relation),
  FOREIGN KEY(archive_event_id) REFERENCES archive_watch_events(id) ON DELETE CASCADE,
  FOREIGN KEY(playback_observation_id) REFERENCES playback_observations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_archive_observation_links_observation
  ON archive_observation_links(playback_observation_id);

CREATE TABLE IF NOT EXISTS archive_identity_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_media_id INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('assign', 'unrelated', 'unresolved')),
  target_rating_key TEXT,
  method TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  actor TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(archive_media_id) REFERENCES archive_media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_archive_identity_decisions_media
  ON archive_identity_decisions(archive_media_id, id DESC);

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

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (20, 'archive_external_observation_links');

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (21, 'archive_identity_review');
