# Dashboard Redesign Contract

This document freezes the dashboard read-model vocabulary and the current first-paint performance baseline for Blocks 3-2g through 3-2o.

## Shared Vocabulary

- Supported household-facing categories are `movie`, `tv`, `classic_tv`, `anime`, and `audiobook`.
- `other` is a storage/derivation fallback only. It must not appear in household-facing dashboard collections, summaries, filters, or exports.
- Media identity is hierarchical:
  - movies resolve at the movie identity
  - episodic media resolve at the show identity
  - audiobooks resolve at the canonical book identity
- Dashboard user presentation uses the existing `users` read model:
  - `enabled = 1` means the user is shown in dashboard views
  - `enabled = 0` means the user is hidden from dashboard views and dashboard aggregates
  - `display_name` is the dashboard alias; if no explicit alias exists, the exact Plex username is the fallback
- Hidden users remain part of ingestion, history, Discord, copy, audit, and adapter domains. Only the dashboard read model excludes them.

## Canonical Artwork Rules

| Displayed identity | Preferred artwork source | Fallback |
| --- | --- | --- |
| Movie card | Movie poster tied to the movie identity | The configured category fallback image for the movie identity |
| Episodic card | Show poster tied to the show identity | The configured category fallback image for the show identity |
| Audiobook card | Canonical book cover tied to the book identity | The configured category fallback image for the audiobook identity |

- Audiobook cards must never use author, artist, album, series, chapter, or track artwork when a canonical book cover is available.
- If the canonical identity has no artwork, the fallback remains category-scoped and must not leak raw adapter URLs.

## Endpoint Inventory

### `GET /api/dashboard/overview`
- Consumer: dashboard overview shell
- Default window: bounded sample of recent household activity
- Max page size: summary sample cap
- Ordering: most recent activity first for the base feed; category and title summaries are deterministic
- Response shape: overview totals, bounded activity feed, bounded top-title summaries, users, libraries, continue-watching cards, category stats, heatmaps, and timing metadata

### `GET /api/dashboard/timeline`
- Consumer: timeline view
- Default window: 1 day
- Max window: 7 days
- Max page size: bounded activity rows for the feed, separate bounded chart sessions for the visual timeline
- Ordering: newest activity first in the feed; chart sessions are grouped by day and user
- Response shape: paginated activity rows, chart sessions, window metadata, and timing metadata

### `GET /api/dashboard/media`
- Consumer: library explorer
- Default window: bounded sample of recent activity
- Max page size: bounded grouped cards
- Ordering: title-sort or recent activity depending on the query
- Response shape: grouped consumed-title cards, total group count, page bounds, and timing metadata

### `GET /api/dashboard/people`
- Consumer: people workspace
- Default window: bounded sample of recent activity
- Max page size: bounded by the summary sample cap
- Ordering: dashboard users sorted by presentation name
- Response shape: per-user summaries, recent items, category mix, and timing metadata

### `GET /api/dashboard/progress`
- Consumer: progress workspace
- Default window: bounded sample of recent activity
- Max page size: bounded summary groups
- Ordering: highest play counts first, then title
- Response shape: bounded progress groups, recently completed cards, and timing metadata

### `GET /api/dashboard/continue-watching`
- Consumer: overview and explorer surfaces
- Default window: bounded sample of recent activity
- Max page size: bounded cards
- Ordering: most recent incomplete activity first
- Response shape: grouped in-progress cards

### `GET /api/dashboard/detail/:ratingKey`
- Consumer: detail workspace
- Default window: bounded per-item play history
- Max page size: bounded to a small detail history slice
- Ordering: newest play first
- Response shape: the selected item, bounded plays, participating users, repeat count, catalog row, audiobook row when applicable, and timing metadata

### `GET /api/dashboard/prompts`
- Consumer: dashboard prompt management
- Default window: recent pending/prompted/failed prompts only
- Max page size: 50 rows
- Ordering: newest watch events first
- Response shape: raw prompt rows for localhost-only dashboard use

### `GET /api/dashboard/export.csv`
- Consumer: CSV export link in the dashboard shell
- Default window: the active dashboard filter set
- Max page size: bounded export stream
- Ordering: same as the active dashboard activity query
- Response shape: streamed CSV rows with no secrets, private paths, Discord IDs, or adapter metadata

## Performance Baseline

- Summary endpoints should remain at or below 750 ms on the fixture machine.
- Bounded detail endpoints should remain at or below 1,500 ms on the fixture machine.
- The dashboard code should report timing metadata that tests can assert without exposing private adapter payloads.

## Contract Notes

- Unknown data stays unknown.
- The dashboard read model must not convert unsupported categories into household-facing cards or aggregate buckets.
- Later dashboard blocks may narrow or extend this contract only by updating this document and their own acceptance criteria together.
