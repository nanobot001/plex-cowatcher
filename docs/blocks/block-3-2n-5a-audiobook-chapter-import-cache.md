# Block 3-2n-5a: Audiobook Chapter Import And Cache

> Status: Planned.
> Result: Not implemented.
> Notes: Follow-up to 3-2n-5; imports verified chapter boundaries from an explicit chapter source instead of asking Plex CoWatcher to discover chapters itself.

## Goal

Give Plex CoWatcher a safe local cache for true audiobook chapter boundaries when an external chapter authority is available. The separate `audiobook` project should remain the chapter specialist; this block only defines and consumes a structured read-only import path so dashboard progress can distinguish verified chapters from Plex track/file rows.

## Dependencies And Entry Gate

- Block 3-2n-5 is implemented and verified.
- The `audiobook` project has a tool-friendly JSON chapter inspector block implemented, or a compatible JSON fixture is available for deterministic tests.
- The source-honesty contract from 3-2n-5 is treated as the public dashboard vocabulary.

## Scope

- Add local read-side schema for chapter sources and chapter boundaries, such as `audiobook_chapter_sources` and `audiobook_chapters`.
- Store only safe metadata: `audiobook_id`, source type, source status, confidence, chapter index, title, start/end offsets, and refreshed timestamps.
- Add an explicit CLI/admin import or probe command that accepts structured JSON output from the `audiobook` tool and writes the local chapter cache.
- Preserve dry-run/preview behavior for import commands and require explicit confirmation for writes.
- Record structured errors and audit/domain events for import attempts, successes, skips, and failures.
- Update dashboard services only enough to report that verified chapter boundaries exist; true chapter-progress math belongs to 3-2n-5b.

## Out Of Scope

- Running `ffprobe`, Audnexus, silence detection, Whisper, or media repair directly inside Plex CoWatcher.
- Automatically probing chapters during normal watch ingestion.
- Exposing private local file paths or raw adapter metadata through public/dashboard/tool responses.
- Rendering polished chapter maps or mapping playback offsets to chapter states.
- Changing TV/Movie/People/Timeline behavior.

## Risk And Mitigation Plan

- Risk: importing chapters leaks private media paths.
- Mitigation: accept only sanitized structured fields and never persist or expose raw file paths in public responses.
- Risk: chapter sources drift from the actual media file.
- Mitigation: store source status, confidence, duration, refreshed time, and warnings so the dashboard can show uncertainty.
- Risk: import becomes a hidden write path.
- Mitigation: preserve dry-run behavior, explicit confirmation, structured errors, and audit/domain events.
- Risk: external tool availability makes tests flaky.
- Mitigation: use deterministic JSON fixtures in tests; do not require the external tool for `npm run verify:block`.

## Likely Files Or Areas

- `src/db/schema.sql`
- `src/db/database.ts`
- `src/cli/cli.ts`
- `src/service/audiobookService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`
- `docs/data/README.md`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`
- `docs/permissions.md`
- `docs/event-log-schema.md`

## Acceptance Criteria

- A repeatable migration creates chapter-source and chapter-boundary cache tables.
- A structured import path can preview and apply sanitized chapter JSON for one audiobook.
- Import stores chapter boundaries with source, confidence, and refreshed metadata without storing public-exposed private paths.
- Re-running the same import is idempotent.
- Import failures return structured errors and do not partially corrupt existing chapter data.
- Tool-facing docs and manifests are updated for any new command.
- Existing dashboard behavior remains source-honest when no chapter cache exists.

## Verification

- `npm run verify:block`
- A deterministic dry-run import test using a local fixture JSON.
