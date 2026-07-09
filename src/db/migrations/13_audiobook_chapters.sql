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
