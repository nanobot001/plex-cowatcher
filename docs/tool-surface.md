# Tool Surface

## Baseline Tools

Every tool-friendly project should aim to expose:

- `project.status`
- `project.health`
- `project.recent_events`
- `project.recent_errors`
- `project.tail_logs`
- `project.tool_manifest`

`project.tail_logs` may accept an optional logical `source` name for monitored logs. Treat this as a named source, not as an arbitrary local path supplied by a caller.

## Existing Interface Mapping

Here is how the project's implemented commands and API routes map to the standardized tool surface:

| Tool Name | CLI Command / Option | HTTP Endpoint | Risk Level | Description |
| :--- | :--- | :--- | :--- | :--- |
| `project.health` | `node dist/cli/cli.js health` | `GET /api/health` | `public_read` | Returns database, Discord, watcher, and adapter readiness. |
| `project.recent_events` | `node dist/cli/cli.js audit` | `GET /api/audit` | `public_read` | Retrieves recent audit records from SQLite. |
| `project.watch_history` | `node dist/cli/cli.js watch-history` | `GET /api/watch-history` | `public_read` | Queries normalized playback observations with time and filter support. |
| `project.watch_summary` | `node dist/cli/cli.js watch-summary` | `GET /api/watch-summary` | `public_read` | Computes watch progress and playback totals. |
| `project.viewing_sessions` | `node dist/cli/cli.js viewing-sessions` | `GET /api/viewing-sessions` | `public_read` | Groups plays into contiguous household viewing sessions. |
| `project.cowatching` | `node dist/cli/cli.js cowatching` | `GET /api/cowatching` | `public_read` | Infers co-watching from overlapping evidence plus confirmations. |
| `project.audiobook_backfill` | `node dist/cli/cli.js audiobook-backfill` | *(none)* | `write_action` | Dry-run by default; optionally links audiobook tracks, enriches canonical book rows, writes resumable cursors, and creates a verified SQLite backup before apply. |
| `project.tautulli_backfill` | `node dist/cli/cli.js tautulli-backfill` | *(none)* | `write_action` | Dry-run by default; optionally resumes per-user Tautulli history pages with explicit apply confirmation and reports source-versus-local reconciliation. |
| `project.plex_historical_backfill` | `node dist/cli/cli.js plex-historical-backfill` | *(none)* | `write_action` | Dry-run by default; reads per-user Plex movie visibility and last-view metadata, then applies at most one exact-GUID historical observation per movie before the cutoff. CLI-only; no Plex mutation. |
| `project.archive_plex_view_recovery` | `node dist/cli/cli.js archive-plex-import` | *(none)* | `write_action` | Dry-run by default; reads Plex's local movie view rows and imports only external Plex events/identity aliases into CoWatcher's existing SQLite database, linking exact matches to existing observations without copying them. CLI-only; no source mutation. |
| `project.audiobook_scan` | `node dist/cli/cli.js scan-audiobooks` | `POST /webhooks/plex` | `write_action` | Runs the shared restart-safe discovery coordinator. Full scans reconcile metadata and publish revision-deduplicated outbox events; webhooks perform fast item awareness. |
| `project.audiobook_import_chapters` | `node dist/cli/cli.js import-audiobook-chapters` | *(none)* | `write_action` | Dry-run by default; imports verified audiobook chapter boundaries from a JSON file. |
| `project.audiobook_proof` | `node dist/cli/cli.js audiobook-proof --action status\|canary\|requeue` | *(none)* | `write_action` | Reports bounded queue status, runs one confirmed canary, or idempotently requeues one existing job. |

## Contract Notes

- All implemented tool outputs should remain structured JSON.
- `project.audiobook_backfill` must not expose private local file paths in CLI output, audit summaries, API responses, or tool-facing logs.
- `project.audiobook_backfill` is intentionally CLI-only. It is not exposed as a public HTTP mutation route.
- `project.plex_historical_backfill` is intentionally CLI-only. Dry-run does not write SQLite; apply requires both `--apply` and `--confirm`, preserves raw snapshots and derived observations separately, and labels derived observations with `plex_historical_last_view`.
- `project.archive_plex_view_recovery` is intentionally CLI-only. Dry-run writes no archive data rows (startup may apply idempotent schema migrations); apply requires both `--apply` and `--confirm`, never mutates Plex or Tautulli, does not copy `playback_observations` or `plex_historical_movie_snapshots`, and does not expose the Plex database path. Resolved archive-only movie events are read additively by the shared dashboard activity, Overview, People, and movie-detail projections; exact linked overlaps are not shown twice.
- Write-capable tools must preserve dry-run behavior unless the caller explicitly opts into apply mode and any required confirmations.
- `project.audiobook_scan` preserves legacy `scanned`, `added`, `enriched`, and `errors` fields while adding track/book/pending/conflict/outbox counts. Outputs never include private paths or raw provider errors.
- `project.audiobook_proof` is CLI-only. Canary and requeue are dry-run by default and require both `--apply` and `--confirm`; outputs contain only job IDs, counts, states, timing, and allowlisted codes.

## Output Contract

Success shape:

```json
{
  "ok": true,
  "tool": "project.health",
  "timestamp": "2026-06-28T00:00:00-04:00",
  "data": {}
}
```

Error shape:

```json
{
  "ok": false,
  "tool": "project.audiobook_backfill",
  "timestamp": "2026-06-28T00:00:00-04:00",
  "error": {
    "code": "AUDIOBOOK_BACKFILL_CONFIRM_REQUIRED",
    "message": "Audiobook backfill could not run.",
    "retryable": false,
    "severity": "error"
  }
}
```
## Dashboard Browser API

Block 3-2 adds localhost browser endpoints that reuse the shared state and service layer:

- GET /api/dashboard/overview, /activity, /timeline, /media, /continue-consuming, /people, /cowatch-pairings, /cowatch-reviews, /operations, /progress, /cowatching, /prompts, /detail/:ratingKey, /detail-workspace/:detailKey, and /detail-workspace/:detailKey/hierarchy are public_read within the localhost boundary.
- `/api/dashboard/detail-workspace/:detailKey` accepts canonical detail keys plus current raw rating keys and Progress group keys; its hierarchy child route is lazy and category-discriminated. These additive routes do not create a new published `project.*` tool.
- POST `/api/dashboard/detail-workspace/:detailKey/refresh` is a localhost `write_action`. It is dry-run by default, requires `apply=true` and `confirm=true` to refresh one canonical title from Plex, and returns only the refreshed workspace plus bounded status/change metadata.
- POST `/api/dashboard/detail-workspace/:detailKey/archive-identity-review` is a localhost `write_action` for Movie detail only. It accepts `archiveMediaId`, `decision` (`assign`, `unrelated`, or `unresolved`), and an optional target rating key/reason. It is append-only and idempotent for a repeated current decision; it changes archive-backed projections only and never copies records into `playback_observations`.
- GET /api/artwork/:ratingKey is a token-safe Plex image proxy. It never returns an authenticated upstream URL and falls back to the local icon.
- GET /api/dashboard/export.csv is a transient public_read stream. It does not retain files and excludes credentials, private paths, Discord IDs, and adapter metadata.
- POST /api/dashboard/prompts/:id/dismiss and /reprompt are write_action routes. They require an explicit confirm=true body, validate lifecycle eligibility, are safe to retry, and record applied or skipped audit events.
- Dashboard pairings include only visible exact-item confirmed/inferred relationships. Measured overlap and unknown-duration sessions remain separate; synchronized Plex state alone is not relationship evidence.
- Dashboard People, pairings, and review reads share a validated period contract. People attribution is a read-only projection over direct observations, confirmations, and current positive adjudications; it never persists synthetic playback or invokes an adapter.
- Dashboard operations is a bounded privacy-safe projection of unresolved prompts, Discord delivery failures, and Plex sync failures. It does not return raw adapter payloads or Discord identifiers.
- POST /api/dashboard/cowatch-reviews/:candidateId/decision is a `write_action`. It is dry-run by default; apply requires explicit confirmation and a stable request ID. Decisions are append-only overlays and never rewrite playback observations.
- POST /api/dashboard/cowatch-reviews/:candidateId/ask-discord is a `write_action`. It is disabled when Discord review is unavailable, dry-run by default, explicitly operator-triggered, deduplicated per open candidate, and never invokes Plex synchronization.
- Dashboard overview, media, people, progress, timeline, and detail responses include bounded timing metadata for local performance assertions. Timeline responses also separate paginated activity rows from chart sessions.
- Dashboard media and continue-consuming responses expose bounded deterministic pagination over canonical consumed-title groups; the legacy continue-watching route remains an array for existing Overview consumers.

These browser routes do not create new published project.* tool names and therefore do not change the CLI/tool manifest contract.
