# Block 3-2n-5b: True Audiobook Chapter Progress

> Status: Implemented on 2026-07-09.
> Result: Implemented.
> Verification: `npm run verify:block` - passed.
> Notes: Progress now maps cached verified audiobook chapter boundaries from the local cache while preserving source-honest Plex track/file fallback behavior.

## Goal

Use verified chapter boundaries, when available, to calculate honest audiobook chapter progress. For books without verified chapter boundaries, preserve the 3-2n-5 fallback contract: show book-level, track/file-level, or unknown progress without claiming chapter truth.

## Dependencies And Entry Gate

- Block 3-2n-5 is implemented and verified.
- Block 3-2n-5a is implemented and verified with a local chapter cache.
- Deterministic fixtures include at least one cached single-file audiobook chapter source and one unverified track/file audiobook.

## Scope

- Extend Progress summary and expansion services to consume cached chapter boundaries.
- Map Tautulli/Plex `view_offset`, `percent_complete`, `duration`, and `completed` evidence onto chapter states when the source is verified.
- Represent completed, partial, repeated, unknown, and source-uncertain chapter states distinctly.
- Keep chapter progress source-qualified so the UI can explain whether state came from verified chapter boundaries, book completion, or track/file evidence.
- Preserve fallback behavior for audiobooks without chapter cache.
- Add deterministic service and dashboard tests for verified chapters and fallback evidence.

## Out Of Scope

- Importing or discovering chapter boundaries; Block 3-2n-5a owns the cache.
- Running media-file analysis, Audnexus, silence detection, Whisper, or Prologue automation.
- Final dot-map visual polish; Block 3-2n-6 owns compact accessible evidence maps.
- Mutating Plex watched state, repairing media files, or editing audiobook metadata.

## Risk And Mitigation Plan

- Risk: view offsets are missing or measured differently across sources.
- Mitigation: fall back to book-level or track/file evidence when offsets are missing, out of range, or inconsistent with cached duration.
- Risk: completed book evidence overstates exact chapter reads.
- Mitigation: mark source/provenance explicitly when all chapters are inferred complete from book-level completion rather than observed offsets.
- Risk: repeated listens inflate completion.
- Mitigation: completion counts distinct verified chapter ranges while repeats remain separate evidence.
- Risk: chapter cache becomes stale.
- Mitigation: include source status and refreshed metadata in responses and do not silently upgrade uncertain data to verified.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `tests/run-tests.mjs`
- `tests/e2e/fixture-server.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Audiobooks with verified chapter cache expose chapter totals and per-chapter states from cached boundaries.
- Partial single-file playback maps to completed chapters before the current offset and a partial current chapter when enough offset data exists.
- Completed book-level playback can mark all verified chapters complete with explicit provenance.
- Audiobooks without verified chapter cache continue to display track/file or book-level evidence without chapter claims.
- Repeats, partials, unknown offsets, and stale/uncertain sources are represented distinctly.
- Dashboard tests cover verified chapter progress and unverified fallback copy.
- Existing non-audiobook Progress behavior remains unchanged.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
