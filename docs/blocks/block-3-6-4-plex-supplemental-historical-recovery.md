# Block 3-6-4: Plex Supplemental Historical Recovery

> Status: Planned.
> Result: Not implemented.
> Notes: Broaden the existing 3-2n-6E-3C movie backfill into an archive-aware, best-effort recovery path for movies and episodes.

## Goal

Recover Plex-only historical evidence without pretending Plex can reconstruct the detailed history that Tautulli provides.

## Scope

- Incorporate the existing 3-2n-6E-3C movie slice rather than creating a second backfill path.
- Add episode-level catalog hydration and per-user Plex watched-state reconciliation.
- Use configurable cutoff policy, exact GUID identity, explicit Plex provenance, and coverage outcomes.
- Preserve Tautulli evidence as richer when both sources disagree or differ in completeness.
- Surface `unknown`, `Plex-only`, `Tautulli-backed`, and `reconciled` states to archive queries.

## Out Of Scope

- Claiming complete play-by-play history from `viewCount` and `lastViewedAt`.
- Backfilling media that neither source can identify safely.
- Automatically marking Plex items watched or changing Tautulli.

## Acceptance Criteria

- The Civil War fixture recovers a Plex-only pre-cutoff record while preserving later Tautulli observations.
- The Sentenced-to-Be-a-Hero fixture hydrates all 12 episodes and can recover Plex-only episodes 11–12 without marking unrecoverable episodes unwatched.
- Users unavailable through Plex and media without defensible dates receive structured non-salvageable outcomes.
- Repeated runs are idempotent and produce coverage reports by user, media type, source, and outcome.

## Verification

- `npm run verify:block`
- Deterministic movie/episode source-reconciliation fixtures.
- Read-only live canaries for one movie and one episode family after deployment.

