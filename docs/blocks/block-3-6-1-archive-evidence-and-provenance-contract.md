# Block 3-6-1: Archive Evidence And Provenance Contract

> Status: Planned.
> Result: Not implemented.
> Notes: First child of the Historical Watch Archive umbrella; establish the durable source contract before reconciliation or achievements.

## Goal

Define what the archive claims, what it merely observes, and how Tautulli, Plex, and manual evidence coexist without false certainty.

## Scope

- Add a durable source/evidence contract distinguishing playback time, Plex last-view time, ingestion time, confidence, and unknown values.
- Preserve raw source identity and normalized archive identity separately.
- Add migrations/types and compatibility mapping for existing `playback_observations` and `watch_events`.
- Define how duplicate evidence, conflicting source values, partial playback, and Plex-only state appear in read-safe JSON.

## Out Of Scope

- Bulk Plex or Tautulli backfill.
- Achievement calculations or dashboard redesign.
- Fuzzy media matching.

## Acceptance Criteria

- A fixture containing one Tautulli event and one Plex-only last-view record for the same title preserves both provenance paths without inventing a second play.
- A missing date is represented as unknown rather than substituted with ingestion time.
- Existing Tautulli queries remain compatible and expose additive source/provenance fields.
- The contract documents which fields are safe for replay/session and achievement calculations.

## Verification

- `npm run verify:block`
- Focused schema, normalization, conflict, and JSON contract tests.

