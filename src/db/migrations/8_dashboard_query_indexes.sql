
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