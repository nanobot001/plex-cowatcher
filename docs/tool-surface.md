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
| `project.audiobook_scan` | `node dist/cli/cli.js scan-audiobooks` | `POST /webhooks/plex` | `write_action` | Proactively scans the Plex Audiobooks library or processes real-time webhook triggers to import and enrich new audiobooks. |

## Contract Notes

- All implemented tool outputs should remain structured JSON.
- `project.audiobook_backfill` must not expose private local file paths in CLI output, audit summaries, API responses, or tool-facing logs.
- `project.audiobook_backfill` is intentionally CLI-only. It is not exposed as a public HTTP mutation route.
- Write-capable tools must preserve dry-run behavior unless the caller explicitly opts into apply mode and any required confirmations.

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