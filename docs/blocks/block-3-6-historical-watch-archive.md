# Block 3-6: Historical Watch Archive

> Status: Partially implemented umbrella.
> Result: Core archive identity, ingestion, and recovery foundation implemented; provenance closure and utility/achievement children remain planned.
> Notes: Do not implement this umbrella directly. Verify current behavior from delivered children rather than the original sequence assumptions.

## Goal

Make the household’s durable watch archive more important than the current Plex library. The archive must preserve who saw what and when, retain source and uncertainty, survive media renames/deletions/rating-key changes, reconcile richer Tautulli playback events with incomplete Plex watched-state evidence, and provide a trustworthy foundation for derived achievements.

## Child Sequence

1. `block-3-6-1-archive-evidence-and-provenance-contract.md` - planned narrow provenance closure over the existing archive.
2. `block-3-6-2-canonical-media-identity-and-alias-registry.md` - superseded historical parent; delivered by 3-6-2A/B/C and 3-6-4/4A.
3. `block-3-6-3-tautulli-ingestion-completeness-and-reconciliation.md` - implemented.
4. `block-3-6-4-plex-supplemental-historical-recovery.md` and 3-6-4A - implemented with controlled rollout.
5. `block-3-6-5-archive-query-export-and-backup.md` - split umbrella; implement query, export, and restore children separately.
6. `block-3-6-6-achievements-engine-v1.md` - split umbrella; implement evidence/engine foundations before eligible rule families.

## Cross-Block Rules

- Tautulli playback observations and Plex watched-state evidence remain distinct sources; neither source is silently promoted to complete truth.
- Existing historical rows are append-only or explicitly superseded with provenance; backfills never delete or downgrade richer evidence.
- Missing evidence remains unknown, not negative evidence.
- Exact identity evidence is required for joins across rating-key changes; title matching is not a historical identity strategy.
- Every child must preserve structured JSON output, dry-run behavior for maintenance work, privacy boundaries, and the project’s `npm run verify:block` gate.

## Out Of Scope For The Umbrella

- Automatically inventing dates, play counts, sessions, or co-watch relationships.
- Treating current Plex library membership as the archive’s retention policy.
- Making achievements part of ingestion or allowing an achievement calculation to mutate watch history.

