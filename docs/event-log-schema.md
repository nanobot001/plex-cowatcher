# Event Log Schema

This project records meaningful domain events in structured SQLite state.

Do not rely on human text logs as the source of truth for bot queries.

Use `app_settings` only for non-secret lightweight state such as cursors, toggles, pause flags, and last-seen IDs. Do not store raw tokens, API keys, session cookies, OAuth credentials, or private secrets in local state.

## Generic Event Shape

Audit records are stored in `audit_log` and should preserve:

```json
{
  "action": "example_event",
  "actor": "cli",
  "status": "ok",
  "metadata": {}
}
```

## Existing Event Sources

- watch-event prompt lifecycle writes
- copy preview/apply writes
- Discord resolution writes
- Plex sync result writes
- audiobook backfill start/completion writes
- dashboard prompt dismiss/re-prompt lifecycle writes

### `dashboard_prompt_dismissed`

Records applied, skipped, or failed operator dismissal without exposing Discord delivery identifiers.

### `dashboard_prompt_reprompted`

Records applied, skipped, or failed operator re-prompt eligibility transitions. An applied event returns the watch event to a clean pending state for the existing sender loop.

### `cowatch_adjudication_decided`

Records applied, reversed, skipped, or failed pair-level review decisions. Metadata contains only the opaque candidate ID, prior/current decision, and method; playback observations and private actor identifiers are not copied into the event.

### Discord review prompt events

- `cowatch_review_prompt_requested` records operator request, duplicate-open skip, or failure.
- `cowatch_review_prompt_delivery` records send success, retry skip, or delivery failure without channel/message identifiers in audit metadata.
- `cowatch_review_prompt_resolved` records the review prompt ID, opaque candidate ID, and decision.
- `cowatch_review_prompt_cancelled` records browser-first resolution, hidden participants, or other candidate ineligibility.

## Project-Specific Events

### `dashboard_detail_refresh`

Records a title-scoped metadata/artwork refresh requested from the shared detail workspace. Metadata contains only the canonical detail key, category, bounded status, and change flags. It must not contain Plex tokens, private URLs, local paths, or raw upstream errors.

### `audiobook_backfill_started`

Recorded when `project.audiobook_backfill` runs in apply mode.

```json
{
  "action": "audiobook_backfill_started",
  "actor": "cli",
  "status": "started",
  "metadata": {
    "mode": "all",
    "batchSize": 100,
    "resume": false
  }
}
```

### `audiobook_backfill_completed`

Recorded when apply mode completes, including partial runs.

```json
{
  "action": "audiobook_backfill_completed",
  "actor": "cli",
  "status": "ok",
  "metadata": {
    "mode": "all",
    "scanned": 12,
    "matched": 10,
    "linked": 10,
    "enriched": 7,
    "pending": 2,
    "errors": 0
  }
}
```

Metadata for these events must not include private local file paths.

### Audiobook discovery events

- `audiobook_discovery_started` records the run ID, configured library selector, and trigger reason.
- `audiobook_discovery_completed` records safe track/book/outbox counts and a status of `succeeded`, `partial`, or `failed`.
- `audiobook_discovery_skipped` records only the bounded reason `cooldown` or `lease_held`.

Discovery events must not contain file paths, authenticated URLs, tokens, raw Plex/provider payloads, or unbounded upstream error text.

### Audiobook proof events

- `audiobook_proof_completed` records job ID, terminal/retry state, attempt count, and an allowlisted result code.
- `audiobook_proof_canary_requested` records a confirmed one-shot request and optional numeric audiobook ID.
- `audiobook_proof_requeued` records the selected existing job ID and whether the confirmed request applied or was skipped.

### `plex_historical_backfill_started` and `plex_historical_backfill_completed`

These events record the bounded historical movie recovery run ID, cutoff, mode, and aggregate outcome counts. They never include Plex tokens, private paths, raw adapter errors, or full media payloads.

Proof events never include manifests, media paths, chapter titles, raw child output, external messages, tags, or credentials.

### `archive_plex_view_recovery_completed`

Records an archive-owned external Plex view import with the run ID, mode, and bounded counts for imported, already-covered, unresolved, ambiguous, unknown-account, failed, archive-event links, and links to existing CoWatcher observations. It must not include the Plex database path, source payloads, credentials, or raw diagnostics.

### `archive_identity_decision_recorded`

Records an explicit, reversible archive-media identity review. Metadata contains only the decision ID, archive media ID, decision, and target rating key; it must not contain Plex paths, source payloads, account secrets, or raw diagnostics. Undo is represented by a later `unresolved` decision.
