# Block 2-5: Viewing Session Reconstruction

> Status: Implemented on 2026-06-27.
> Result: Implemented.
> Verification: `npm test` - passed.
> Notes: Implemented SessionService to group observations by a 2-hour inactivity gap, merging overlapping intervals to calculate true playback duration. Exposed via GET /api/viewing-sessions and viewing-sessions CLI command.

## Goal

Reconstruct viewing sessions so callers can reason about contiguous activity and time overlap without treating each Tautulli row as isolated.

## Scope

- Group one user's nearby observations using best-known intervals, media continuity, and a configurable inactivity gap.
- Preserve membership evidence, interval quality, calculated duration, and uncertainty.
- Handle episode transitions, partial plays, pauses represented as separate rows, and repeats.
- Expose read-only session queries by person, exact content/show, and date range through shared CLI and HTTP logic.
- Keep sessions derived and reproducible from stored evidence.

## Out Of Scope

- Cross-user co-watching claims, sensitive device/IP/location tracking, evidence deletion, and real-time presence.

## Likely Files Or Areas

- `src/service/`
- `src/logic/`
- `src/server/routes.ts`
- `src/cli/cli.ts`
- `src/types/`
- `tests/`
- `docs/logic/`

## Acceptance Criteria

- Identical evidence and configuration produce identical boundaries.
- Sessions identify member observations and label exact, estimated, or incomplete intervals.
- Nearby episodes can join while clearly separated activity remains separate.
- Partial and repeat plays do not inflate duration.
- CLI and HTTP results are structured, bounded, and secret-safe.
- Tests cover continuity, gaps, missing timestamps, partials, and repeats.

## Verification

- `npm run build`
- `npm test`
- `node dist/cli/cli.js viewing-sessions --user <configured-user> --days 7 --pretty`
- Manual: verify a two-episode session and a later unrelated play.