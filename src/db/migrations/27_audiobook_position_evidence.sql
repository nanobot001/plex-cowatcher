CREATE TABLE IF NOT EXISTS audiobook_position_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('tautulli_stop')),
  source_event_key TEXT NOT NULL,
  source_user_key TEXT NOT NULL,
  source_session_key TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  audiobook_id INTEGER NOT NULL,
  rating_key TEXT NOT NULL,
  plex_guid TEXT,
  observed_at TEXT NOT NULL,
  session_started_at TEXT,
  session_stopped_at TEXT NOT NULL,
  view_offset_ms INTEGER NOT NULL CHECK (view_offset_ms >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  capture_reason TEXT NOT NULL CHECK (capture_reason IN ('playback_stop')),
  media_revision TEXT,
  payload_digest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
  UNIQUE(source_type, source_event_key)
);

CREATE INDEX IF NOT EXISTS idx_audiobook_position_evidence_timeline
  ON audiobook_position_evidence(audiobook_id, user_id, observed_at, id);
CREATE INDEX IF NOT EXISTS idx_audiobook_position_evidence_session
  ON audiobook_position_evidence(source_type, source_session_key);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (27, 'audiobook_position_evidence');
