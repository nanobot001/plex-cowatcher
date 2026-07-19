# Block 3-6-3: Tautulli Ingestion Completeness And Reconciliation

> Status: Implemented on 2026-07-19.
> Result: Implemented.
> Verification: `npm run verify:block` - passed with 122 service tests, 59 dashboard tests, one intentional narrow-viewport skip, JavaScript syntax, and tool-contract verification.
> Notes: Added dry-run/apply Tautulli backfill with durable per-user checkpoints, bounded page retries, source-row outcomes, and exact-identity reconciliation; no automatic PM2 backfill or Tautulli writes. Live apply run `2c831401-24ec-4fc7-82f8-7ce1ead0d144` completed with 7,020 rows scanned, 364 imported, 6,656 already present, and zero failures after resumable recovery from a transient SQLite error.

## Goal

Ensure Tautulli history is paged, checkpointed, retryable, and auditable so the archive can distinguish source absence from CoWatcher ingestion failure.

## Scope

- Add persistent backfill-run state, per-user cursors/checkpoints, bounded retries, and structured failure summaries.
- Remove silent reliance on the recent-history page cap for historical maintenance runs.
- Record source row counts, imported/skipped counts, page failures, and completion status.
- Add a read-only reconciliation report comparing Tautulli source results with local observations by user and canonical media identity.

## Out Of Scope

- Treating Tautulli absence as proof that a watch never happened.
- Plex recovery implementation.
- Changes to Tautulli’s database or settings.

## Acceptance Criteria

- An interrupted user backfill resumes from a durable checkpoint without duplicating rows.
- A page failure is visible and does not falsely report a complete run.
- The report distinguishes “not returned by Tautulli” from “returned but not stored.”
- Existing polling remains bounded and does not become an unbounded startup backfill.

## Verification

- `npm run verify:block`
- Fixture tests for pagination, interruption, retry, duplicate safety, and incomplete-run reporting.

