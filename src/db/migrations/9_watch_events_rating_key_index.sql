CREATE INDEX IF NOT EXISTS idx_watch_events_rating_key_time
  ON watch_events(rating_key, watched_at);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (9, 'watch_events_rating_key_index');
