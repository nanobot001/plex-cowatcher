ALTER TABLE content_catalog ADD COLUMN artwork_poster_fingerprint TEXT;
ALTER TABLE content_catalog ADD COLUMN artwork_backdrop_fingerprint TEXT;

INSERT INTO schema_migrations (version, name)
VALUES (17, 'content_catalog_artwork_fingerprints');
