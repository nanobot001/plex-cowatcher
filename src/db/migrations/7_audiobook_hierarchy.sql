-- Version 7 migration reference.
-- Adds hierarchical audiobook series modeling columns to audiobook_books.
-- These include parent series, subseries, related work classification, and hierarchy provenance.
ALTER TABLE audiobook_books ADD COLUMN parent_series_title TEXT;
ALTER TABLE audiobook_books ADD COLUMN subseries_title TEXT;
ALTER TABLE audiobook_books ADD COLUMN related_work_classification TEXT;
ALTER TABLE audiobook_books ADD COLUMN hierarchy_provenance TEXT;

CREATE INDEX IF NOT EXISTS idx_audiobook_books_parent_series 
  ON audiobook_books(parent_series_title) WHERE parent_series_title IS NOT NULL;
