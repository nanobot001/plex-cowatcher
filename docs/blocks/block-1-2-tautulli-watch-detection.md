# Block 1-2: Tautulli Watch Detection

> Status: Implemented on 2026-05-31.
> Result: Implemented.
> Verification: `npm run build` - passed; `npm test` - passed.
> Notes: Added Tautulli history normalization, source-user polling, completion filtering, exact and nearby duplicate prevention, watch-event persistence, and mocked coverage.

## Goal

Detect completed watches for configured source users through Tautulli history polling and persist deduped watch events without creating duplicate prompts.

## Scope

- Implement recent-history polling through `tautulliAdapter`.
- Normalize Tautulli history rows into internal watch event inputs.
- Apply completion threshold rules for movies and episodes.
- Persist completed source-user watches in `watch_events`.
- Add duplicate prevention for exact keys and nearby repeated timestamps.
- Add mocked tests for completed, incomplete, duplicate, movie, and episode rows.

## Out Of Scope

- Sending Discord prompts.
- Live Plex watched-state mutation.
- Browser history copy.
- PM2 operations work.

## Likely Files Or Areas

- `src/adapters/tautulliAdapter.ts`
- `src/watcher/watcher.ts`
- `src/watcher/dedupe.ts`
- `src/service/userService.ts`
- `src/db/schema.sql`
- `tests/run-tests.mjs`

## Acceptance Criteria

- A completed watch for a configured source user creates one `watch_events` row.
- Re-polling the same watch does not create duplicate rows.
- Incomplete watches do not create watch events.
- Unknown or disabled users are ignored safely.
- `npm run build` and `npm test` pass.

## Verification

- `npm run build`
- `npm test`
- Manual check with mocked or fixture Tautulli rows.
