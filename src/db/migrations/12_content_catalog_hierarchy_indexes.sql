CREATE INDEX IF NOT EXISTS idx_content_catalog_grandparent
  ON content_catalog(grandparent_rating_key);
CREATE INDEX IF NOT EXISTS idx_content_catalog_audiobook
  ON content_catalog(audiobook_id) WHERE audiobook_id IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (12, 'content_catalog_hierarchy_indexes');
