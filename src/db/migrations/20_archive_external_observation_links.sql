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

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (20, 'archive_external_observation_links');
