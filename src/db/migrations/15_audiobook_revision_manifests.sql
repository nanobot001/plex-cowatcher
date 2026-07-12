ALTER TABLE audiobook_books ADD COLUMN active_chapter_revision_id INTEGER;
ALTER TABLE audiobook_discovery_outbox ADD COLUMN manifest_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE audiobook_discovery_outbox ADD COLUMN safe_outcome_code TEXT;

CREATE TABLE audiobook_media_revisions (
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

CREATE TABLE audiobook_media_revision_items (
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

CREATE TABLE audiobook_chapter_revisions (
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

CREATE TABLE audiobook_chapter_revision_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_revision_id INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_offset_ms INTEGER NOT NULL,
  end_offset_ms INTEGER NOT NULL,
  FOREIGN KEY(chapter_revision_id) REFERENCES audiobook_chapter_revisions(id) ON DELETE CASCADE,
  UNIQUE(chapter_revision_id, chapter_index)
);

CREATE INDEX idx_audiobook_media_revisions_book
  ON audiobook_media_revisions(audiobook_id, created_at DESC);
CREATE INDEX idx_audiobook_chapter_revisions_book
  ON audiobook_chapter_revisions(audiobook_id, created_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (15, 'audiobook_revision_manifests');
