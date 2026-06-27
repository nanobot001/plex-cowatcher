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

## Domain Tools

Add project-specific tools here.

## Existing Interface Mapping

Here is how the project's commands and API routes map to the standardized tool surface:

| Tool Name | CLI Command / Option | HTTP Endpoint | Risk Level | Description |
| :--- | :--- | :--- | :--- | :--- |
| `project.status` | `node dist/cli/cli.js status` | `GET /api/status` | `public_read` | Returns active readiness flags. |
| `project.health` | `node dist/cli/cli.js health` | `GET /api/health` | `public_read` | Returns read readiness statuses. |
| `project.recent_events` | `node dist/cli/cli.js audit` | `GET /api/audit` | `public_read` | Retrieves recent audit logs. |
| `project.recent_errors` | *(none)* | `GET /api/errors/recent` | `trusted_read` | Retrieves active sync failures. |
| `project.tail_logs` | *(none)* | *(none)* | `trusted_read` | Reads background log entries. |
| `project.watch_history` | `node dist/cli/cli.js watch-history` | `GET /api/watch-history` | `public_read` | Queries normalized playback history. |
| `project.watch_summary` | `node dist/cli/cli.js watch-summary` | `GET /api/watch-summary` | `public_read` | Computes show progress & daily sums. |
| `project.viewing_sessions` | `node dist/cli/cli.js viewing-sessions` | `GET /api/viewing-sessions` | `public_read` | Groups plays into 2h inactivity sessions. |
| `project.cowatching` | `node dist/cli/cli.js cowatching` | `GET /api/cowatching` | `public_read` | Infers co-watching play correlations. |

## Output Contract

All tool outputs should be structured JSON.

Success shape:

```json
{
  "ok": true,
  "tool": "project.status",
  "timestamp": "2026-05-26T00:00:00-04:00",
  "data": {}
}
```

Error shape:

```json
{
  "ok": false,
  "tool": "project.status",
  "timestamp": "2026-05-26T00:00:00-04:00",
  "error": {
    "code": "STATE_DB_UNAVAILABLE",
    "message": "Could not open the local durable state database.",
    "retryable": true,
    "severity": "error"
  }
}
```
