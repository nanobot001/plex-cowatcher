# Block 3-6: Historical Watch Archive

> Status: Planned umbrella.
> Result: Not implemented.
> Notes: Establish the durable historical-watch product foundation before adding achievements or broad reporting. Do not implement this umbrella directly; implement its children in order.

## Goal

Make the household’s durable watch archive more important than the current Plex library. The archive must preserve who saw what and when, retain source and uncertainty, survive media renames/deletions/rating-key changes, reconcile richer Tautulli playback events with incomplete Plex watched-state evidence, and provide a trustworthy foundation for derived achievements.

## Child Sequence

1. `block-3-6-1-archive-evidence-and-provenance-contract.md` - define durable evidence, source, confidence, and time semantics.
2. `block-3-6-2-canonical-media-identity-and-alias-registry.md` - preserve identity across stale keys, migrations, and removed media.
3. `block-3-6-3-tautulli-ingestion-completeness-and-reconciliation.md` - make detailed source ingestion resumable, observable, and auditable.
4. `block-3-6-4-plex-supplemental-historical-recovery.md` - extend the existing 6E-3C movie slice to episode-level and broader best-effort recovery.
5. `block-3-6-5-archive-query-export-and-backup.md` - make the archive portable, inspectable, and recoverable.
6. `block-3-6-6-achievements-engine-v1.md` - derive versioned achievements without rewriting historical facts.

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

