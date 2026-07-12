CREATE TABLE audiobook_proof_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lease_owner TEXT,
  lease_expires_at TEXT,
  heartbeat_at TEXT,
  current_job_id INTEGER,
  last_completed_at TEXT,
  next_run_at TEXT
);
INSERT INTO audiobook_proof_state (id) VALUES (1);

CREATE TABLE audiobook_proof_jobs (
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
CREATE INDEX idx_audiobook_proof_jobs_eligible
  ON audiobook_proof_jobs(state, next_attempt_at, id);

INSERT INTO schema_migrations (version, name)
VALUES (16, 'audiobook_proof_jobs');
