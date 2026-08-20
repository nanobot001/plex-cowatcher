# Dashboard CSV Export Contract

GET /api/dashboard/export.csv streams the active filtered dashboard history. The service does not retain an export file.

Stable columns, in order: `watched_at`, `person`, `category`, `library`, `title`, `progress`, `duration_minutes`, `status`.

`progress` remains the original dashboard source percentage and `status` remains the source playback-row completion state. Canonical audiobook current, furthest, session, chapter, and book-completion fields are not substituted into this raw compatibility export. They are available only through the additive JSON API contract in `docs/data/audiobook-progress-projection.md`.

Category is one of movie, tv, classic_tv, anime, or audiobook. `other` is excluded from the dashboard export because it is a storage fallback only.

The export must never contain Plex tokens, authenticated URLs, local file paths, Discord IDs, adapter credentials, or private audiobook folder hints. Fields are RFC 4180-style quoted and double quotes are escaped.
