ALTER TABLE content_catalog ADD COLUMN last_seen_at TEXT;
ALTER TABLE content_catalog ADD COLUMN last_seen_scan_id INTEGER;
ALTER TABLE audiobook_books ADD COLUMN identity_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE audiobook_books ADD COLUMN identity_provenance TEXT;
ALTER TABLE audiobook_books ADD COLUMN current_media_revision TEXT;
ALTER TABLE audiobook_books ADD COLUMN media_revision_updated_at TEXT;
ALTER TABLE audiobook_books ADD COLUMN enrichment_last_attempt_at TEXT;
ALTER TABLE audiobook_books ADD COLUMN enrichment_next_attempt_at TEXT;
ALTER TABLE audiobook_books ADD COLUMN enrichment_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audiobook_books ADD COLUMN enrichment_last_error_code TEXT;

CREATE TABLE audiobook_discovery_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  current_run_id INTEGER,
  next_run_at TEXT
);
INSERT INTO audiobook_discovery_state (id) VALUES (1);

CREATE TABLE audiobook_discovery_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_reason TEXT NOT NULL,
  status TEXT NOT NULL,
  library_title TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  safe_error_code TEXT,
  counts_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE audiobook_discovery_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audiobook_id INTEGER NOT NULL,
  media_revision TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id),
  UNIQUE(audiobook_id, media_revision)
);

CREATE INDEX idx_audiobook_discovery_runs_started
  ON audiobook_discovery_runs(started_at DESC, id DESC);
CREATE INDEX idx_audiobook_discovery_outbox_pending
  ON audiobook_discovery_outbox(consumed_at, id);
CREATE INDEX idx_content_catalog_guid
  ON content_catalog(guid) WHERE guid IS NOT NULL;

INSERT INTO schema_migrations (version, name)
VALUES (14, 'audiobook_discovery_automation');
