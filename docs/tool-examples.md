# Tool Examples

## `project.health`

```json
{
  "ok": true,
  "tool": "project.health",
  "timestamp": "2026-06-28T00:00:00-04:00",
  "data": {
    "status": "ready"
  }
}
```

## `project.recent_events`

```json
{
  "ok": true,
  "tool": "project.recent_events",
  "timestamp": "2026-06-28T00:00:00-04:00",
  "data": {
    "events": []
  }
}
```

## `project.audiobook_backfill` Dry Run

Command:

```powershell
node dist/cli/cli.js audiobook-backfill --mode all --batch-size 25 --pretty
```

Response:

```json
{
  "ok": true,
  "tool": "project.audiobook_backfill",
  "timestamp": "2026-06-28T00:00:00-04:00",
  "data": {
    "ok": true,
    "dryRun": true,
    "mode": "all",
    "scanned": 25,
    "matched": 20,
    "linked": 0,
    "enriched": 0,
    "pending": 5,
    "errors": [],
    "provenance": {
      "folder_path": 20
    },
    "backupCreated": false,
    "resumable": true
  }
}
```