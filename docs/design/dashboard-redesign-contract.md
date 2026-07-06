# Dashboard Redesign Contract

This document freezes the dashboard read-model vocabulary and the current first-paint performance baseline for Blocks 3-2g through 3-2o.

## Shared Vocabulary

- Supported household-facing categories are `movie`, `tv`, `classic_tv`, `anime`, and `audiobook`.
- `other` is a storage/derivation fallback only. It must not appear in household-facing dashboard collections, summaries, filters, or exports.
- Media identity is hierarchical:
  - movies resolve at the movie identity
  - episodic media resolve at the show identity
  - audiobooks resolve at the canonical book identity
- Dashboard user presentation uses the synced `users` identity rows plus durable dashboard preference fields:
  - `dashboard_shown = 1` means the identity is intentionally included in household dashboard views and aggregates
  - `dashboard_shown = 0` means the user is hidden from dashboard views and dashboard aggregates
  - `dashboard_alias` is the dashboard alias; if no explicit alias exists, the exact Plex username is the fallback
  - `display_name` and `enabled` remain synced identity fields and must not be mutated by dashboard preference edits
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
- Default window: trailing 30 days; People-scoped `7d`, `30d`, `90d`, `all`, and `custom` periods are URL-restorable, and existing explicit date filters imply a custom period
- Custom contract: `period=custom` requires valid `dateFrom` and `dateTo` with the start on or before the end
- Aggregation: inclusive totals are complete for the effective period and are not capped by the summary sample limit; all-time/custom daily heatmaps are bounded to the latest 365 days and disclose their displayed bounds
- Ordering: active users first within the active group and disabled/no-activity users in a secondary group; each group is sorted by presentation name
- Presentation: browser-local People card ordering is split into separate Active and Other buckets, defaults to the server-provided order, preserves saved custom positions across reloads, and resets back to the server order without changing the API payload; ordering uses compact icon affordances and a pointer-anchored ghost preview while mounted cards mutate locally without a People refetch
- Attribution: successful confirmations and current positive adjudications mark confirmed shared sessions; absent participant playback may contribute source duration/completion as explicitly attributed evidence, while matching direct playback always takes precedence
- Response shape: backward-compatible inclusive person totals plus active/secondary groups, observed/attributed breakdowns, confirmed shared-session and unknown-duration counts, contribution-labeled recent items, per-day observed/attributed minutes, effective/heatmap windows, advisory duplicate warnings, and timing metadata
- Heatmap presentation: each daily cell can expose observed minutes, attributed Together minutes, play count, confirmed Together sessions, and a drill-through route that restores the selected day in Timeline

### `GET /api/dashboard/cowatch-pairings`
- Consumer: People relationship panel
- Default window: trailing 30 days; accepts the same People period contract so relationship evidence stays aligned with profile totals
- Ordering: shared session count, then latest relationship evidence
- Response shape: visible person pairs, exact supporting titles, session count, measured shared minutes, unknown-duration count, separate confirmed/inferred provenance, and timing metadata

### `GET /api/dashboard/operations`
- Consumer: People operations panel
- Default window: current bounded unresolved operational state
- Ordering: newest issue first
- Response shape: privacy-safe prompt, Discord delivery, Plex sync, metadata, and classification issue projections with eligible context/actions

### `GET /api/dashboard/cowatch-reviews`
- Consumer: People review queue
- Default window: trailing 30 days with deterministic pagination (20 default, 50 maximum); accepts the same People period contract
- Ordering: newest exact-item candidate first
- Response shape: opaque candidate ID, visible pair aliases, exact title, evidence time, current decision, effective relationship, and timing metadata

### `POST /api/dashboard/cowatch-reviews/:candidateId/decision`
- Consumer: local browser review controls
- Permission: `write_action`, dry-run by default
- Apply contract: requires `apply=true`, `confirm=true`, a stable request ID, and one of `yes`, `no`, `not_sure`, or `clear`
- Persistence: append-only adjudication history; Yes presents as Together, No suppresses only the matched evidence fingerprint, Not sure preserves Likely together, and Clear restores evidence-derived state

### `POST /api/dashboard/cowatch-reviews/:candidateId/ask-discord`
- Consumer: explicit People review action
- Permission: review-only `write_action`, dry-run by default, unavailable when Discord review is disabled
- Apply contract: requires `apply=true`, `confirm=true`, and a stable request ID; at most one pending/sent prompt exists per candidate
- Resolution: Yes/No/Not sure uses the shared adjudication service, closes the review prompt, and never invokes Plex synchronization or changes a normal watch-event prompt
- Cancellation: browser-first definitive decisions, hidden participants, or stale candidates close the open prompt; late interactions report the terminal state

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
- People reads are side-effect free: attributed contributions exist only in the read model and never create playback observations, watch events, adjudications, prompts, or Plex mutations.
- People inclusive totals equal directly observed contributions plus confirmed attributed contributions that have no matching direct observation. Inference, No, Not sure, Clear, failed/stale state, and hidden users do not add personal activity.
- Possible-duplicate identity warnings are presentational only. User IDs remain authoritative and aliases or normalized labels are never join keys.
- The dashboard read model must not convert unsupported categories into household-facing cards or aggregate buckets.
- Later dashboard blocks may narrow or extend this contract only by updating this document and their own acceptance criteria together.
