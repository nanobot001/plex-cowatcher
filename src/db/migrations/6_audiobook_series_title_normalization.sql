-- Version 6 migration reference.
-- Normalizes audiobook series labels so equivalent names collapse to one canonical value.
-- Existing databases are updated transactionally by normalizeAudiobookSeriesTitles() in src/db/database.ts.
UPDATE audiobook_books
SET series_title = 'Wheel of Time'
WHERE lower(trim(COALESCE(series_title, ''))) IN ('wheel of time', 'the wheel of time');

UPDATE content_catalog
SET grandparent_title = 'Wheel of Time'
WHERE audiobook_id IN (
  SELECT id
  FROM audiobook_books
  WHERE lower(trim(COALESCE(series_title, ''))) = 'wheel of time'
);
