# Block 2-1: Rich Playback Evidence Capture

> Status: Implemented on 2026-06-27.
> Result: Implemented.
> Verification: `npm test` - passed.
> Notes: Added playback_observations table, updated Tautulli adapter with provenance fields, and implemented IngestionService with polling and paginated backfill history.

## Goal

Capture enough normalized Tautulli playback evidence for Plex CoWatcher to answer who watched what, when, and how much, without changing the completed-watch Discord workflow or treating derived conclusions as observed facts.

## Scope

- Add a durable playback-observation model for completed and partial plays by every enabled configured Plex user, not only users who trigger Discord prompts.
- Preserve stable user/media identifiers, media type, title hierarchy, library, best-known start/stop timestamps, duration, view offset, completion percentage, and Tautulli source identifiers when available.
- Record timestamp and field provenance so missing source values are distinguishable from capture-time fallbacks.
- Keep Phase 1 `watch_events` and Discord prompting limited to completed watches by configured source users; link or derive them without duplicate prompts.
- Make polling and bounded historical ingestion idempotent, migration-safe, and read-only toward Tautulli.
- Record structured ingestion errors without secrets or unnecessary sensitive values.

## Out Of Scope

- Public history-query routes or CLI commands.
- Genre enrichment, show episode totals, viewing sessions, or co-watching inference.
- Changing Plex watched state or Discord confirmation behavior.

## Likely Files Or Areas

- `src/adapters/tautulliAdapter.ts`
- `src/watcher/`
- `src/db/`
- `src/types/`
- `tests/`
- `docs/data/`

## Acceptance Criteria

- Completed and partial Tautulli rows for any enabled configured user can be stored as normalized playback evidence.
- Evidence retains enough information to calculate per-item progress and a best-known viewing interval when source data permits.
- Re-polling or bounded re-ingestion creates neither duplicate observations nor duplicate Discord prompts.
- Existing completed source-user watches retain Phase 1 behavior.
- Missing timestamps and progress remain explicitly unknown or provenance-labeled.
- Existing SQLite data migrates without loss and no secrets are persisted.

## Verification

- `npm run build`
- `npm test`
- `npm run db:init`
- Manual: ingest completed, partial, and non-source-user fixtures twice and verify idempotent structured records.