# Dashboard CSV Export Contract

GET /api/dashboard/export.csv streams the active filtered dashboard history. The service does not retain an export file.

Stable columns, in order: watched_at, person, category, media_type, library, title, show_title, rating_key, percent_complete, completed, duration_seconds, evidence.

Category is one of movie, tv, classic_tv, anime, audiobook, or other. Evidence is JSON describing observed, confirmed, prompt, synchronization, and provenance states.

The export must never contain Plex tokens, authenticated URLs, local file paths, Discord IDs, adapter credentials, or private audiobook folder hints. Fields are RFC 4180-style quoted and double quotes are escaped.