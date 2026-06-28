# Tool Adapter Memory

## Project Role

Plex CoWatcher is a Windows-local household Plex assistant and watch-history intelligence service. It records normalized playback evidence, supports co-watch workflows, and exposes read-safe history/reporting tools plus guarded write actions.

## Classification

Existing local service adapted to be tool-friendly through a shared service layer, structured JSON outputs, SQLite state, and contract-verified CLI and HTTP entry points.

## Runtime Model

Single-process Node.js service with:

- one-shot CLI commands in `src/cli/cli.ts`
- localhost Express routes in `src/server/routes.ts`
- server-rendered browser pages in `src/web/index.ts`
- PM2-managed long-running operation for the main service

## Source Of Truth

SQLite is the durable source of truth for watch events, playback observations, content metadata cache, audiobook book rows, app settings, and audit history. Plex and Tautulli are read adapters; they are not treated as the local state ledger.

## Existing Pieces Reused

- Plex adapter, Tautulli adapter, Discord bot, and shared services
- SQLite schema in `src/db/schema.sql`
- CLI command surface in `src/cli/cli.ts`
- Express API routes and local browser pages
- PM2 runtime model already established for the service

## Adaptation Gaps Filled

- Structured query/report tools over normalized playback evidence
- Tool contract verification in `scripts/verify-tools.js`
- Guarded audiobook differentiation, canonical book registry, and resumable backfill command
- Persistent app settings for audiobook prompt suppression and backfill cursors

## Tool Surface

Implemented or partially implemented tools include:

- `project.health`
- `project.recent_events`
- `project.watch_history`
- `project.watch_summary`
- `project.viewing_sessions`
- `project.cowatching`
- `project.audiobook_backfill`

## Permission Boundaries

- `public_read`: health, audit reads, watch history, summaries, sessions, cowatching
- `write_action`: audiobook backfill apply mode, history-copy apply mode, Discord prompt resolution, Plex watched-state sync when explicitly enabled
- `trusted_read`: internal-only operational details such as logs or structured recent-error surfaces when added

## State/Event Schema

- `watch_events`: prompt lifecycle and source-watch evidence
- `playback_observations`: normalized playback evidence per user and rating key
- `content_catalog`: cached Plex metadata per track, including private `file_path` and `audiobook_id`
- `audiobook_books`: canonical audiobook grouping and enrichment state
- `app_settings`: non-secret toggles and resumable cursors such as `prompt_for_audiobooks` and `audiobook_backfill_cursor_*`
- `audit_log`: structured domain events and write-action evidence

Do not store raw tokens, API keys, session cookies, OAuth credentials, or private secrets in SQLite state.

## Bot Usage Notes

- Prefer CLI or HTTP entry points that already return structured JSON.
- Treat `project.audiobook_backfill` as a privileged local maintenance command. Run dry-run first and only apply after backup and review gates pass.
- Do not parse human text logs when structured audit or SQLite state can answer the question.

## Do Not Break

- Keep published tool names stable.
- Preserve dry-run defaults for write/admin tools.
- Never expose `content_catalog.file_path` or `audiobook_books.folder_path_hint` through public-read surfaces.
- Keep audiobook observation linkage through `content_catalog.audiobook_id`; do not denormalize `audiobook_id` onto `playback_observations`.
- Preserve PM2 as the normal long-running runtime model.

## Known Limitations

- Live audiobook backfill still depends on local Plex credentials and network availability.
- Google Books matching remains intentionally conservative and can leave rows pending.
- No public HTTP mutation route exists for audiobook backfill by design.

## Verification Commands

- `npm run build`
- `npm test`
- `npm run verify:tools`