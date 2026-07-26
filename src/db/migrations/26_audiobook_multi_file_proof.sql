ALTER TABLE audiobook_media_revision_items ADD COLUMN rating_key TEXT;
ALTER TABLE audiobook_media_revision_items ADD COLUMN guid TEXT;

UPDATE audiobook_media_revision_items
SET guid = substr(stable_identity, 6)
WHERE guid IS NULL AND stable_identity LIKE 'guid:%';
UPDATE audiobook_media_revision_items
SET rating_key = (
  SELECT catalog.rating_key FROM content_catalog catalog
  WHERE catalog.guid = audiobook_media_revision_items.guid
  ORDER BY catalog.rating_key LIMIT 1
)
WHERE rating_key IS NULL AND guid IS NOT NULL;

CREATE TABLE audiobook_proof_file_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  media_revision TEXT NOT NULL,
  revision_item_id INTEGER NOT NULL,
  item_order INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','running','retry_wait','succeeded','failed_terminal')),
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
  source_type TEXT,
  confidence REAL,
  chapters_json TEXT,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
  FOREIGN KEY(revision_item_id) REFERENCES audiobook_media_revision_items(id) ON DELETE CASCADE,
  UNIQUE(audiobook_id, media_revision, revision_item_id)
);

CREATE INDEX idx_audiobook_proof_file_jobs_eligible
  ON audiobook_proof_file_jobs(state, next_attempt_at, id);

INSERT INTO schema_migrations (version, name)
VALUES (26, 'audiobook_multi_file_proof');
