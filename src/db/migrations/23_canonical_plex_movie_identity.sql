CREATE TABLE IF NOT EXISTS movie_canonical_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plex_guid TEXT NOT NULL UNIQUE,
  canonical_rating_key TEXT NOT NULL,
  title_snapshot TEXT,
  status TEXT NOT NULL CHECK (status IN ('resolved', 'ambiguous', 'unresolved')),
  resolution_method TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movie_identity_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_movie_id INTEGER NOT NULL,
  rating_key TEXT NOT NULL UNIQUE,
  alias_role TEXT NOT NULL CHECK (alias_role IN ('canonical', 'stale', 'observed')),
  title_snapshot TEXT,
  resolution_method TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(canonical_movie_id) REFERENCES movie_canonical_identities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_movie_identity_aliases_canonical
  ON movie_identity_aliases(canonical_movie_id, alias_role, rating_key);
CREATE INDEX IF NOT EXISTS idx_movie_identity_aliases_rating_key
  ON movie_identity_aliases(rating_key);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (23, 'canonical_plex_movie_identity');
