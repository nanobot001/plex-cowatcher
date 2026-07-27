# Block 3-2n-6G: Audiobook Progress Evidence Repair And Retroactive Rebuild

> Status: Implemented and verified on 2026-07-26.
> Result: Audiobook progress now resolves from validated position evidence with explicit quality/source states, preserves raw observations, and projects one source-honest result through Overview, Progress, and shared detail.
> Dependency: The completed 3-2n-6F Overview digest projection should consume the corrected audiobook progress result from this block.
> Notes: This is an audiobook-only corrective block. It repairs derived progress without rewriting raw playback observations or introducing a new proof worker/source system. Tautulli `play_duration` reset rows are handled with a high-water mark: rising records may support approximate position while reset rows remain uncertain and never lower the known position.

## Goal

Make audiobook progress source-honest across Overview, Progress, and detail by validating position evidence, assigning an explicit progress-quality state, and rebuilding derived progress from the best validated evidence available.

The repair must preserve the original observations exactly. A stale or incomplete source value may be corrected in the derived read model, but it must remain visible as uncertainty rather than being relabeled as verified evidence.

## Scope

- Define and validate the meanings and usable ranges of `view_offset`, `duration`, and `percent_complete` for audiobook observations before using them to derive position or chapter progress.
- Add explicit progress-quality states that distinguish at least verified position evidence, approximate/source-percent evidence, inconsistent or stale evidence, and unavailable evidence. Use the project’s existing typed/read-model patterns where possible.
- Recalculate derived audiobook position, percentage, chapter state, and session summaries from validated position evidence without mutating `playback_observations` or other raw source snapshots.
- Prevent a stale percentage from being promoted to precise chapter progress when a usable position cannot be established. Uncertain values must be labeled approximate or unavailable, never verified.
- Make Overview digest cards, Progress groups and lazy expansions, and shared audiobook detail consume the same corrected derived result.
- Support a retroactive derived rebuild for existing audiobook observations through the normal application/read-model path. No manual database edits are part of the workflow.
- Add one positive canary with structurally valid position evidence and one stale/inconsistent-progress canary that proves the repair remains honest and does not regress to the old percentage fallback.
- Keep the correction capability-based and generic. Do not add title, author, series, user, or item allowlists to make a selected audiobook pass.

## Out Of Scope

- Movies, TV, Anime, or Classic TV progress behavior.
- An audiobook ingestion redesign beyond the field validation and provenance needed to prevent invalid progress promotion.
- New proof workers, chapter-source systems, transcription workers, or additional background queues.
- Rewriting, deleting, normalizing, or manually editing raw observations, source snapshots, chapter sources, or database rows.
- Inventing chapter boundaries or converting an approximate percentage into verified chapter completion.
- Redesigning the Overview digest grouping or the existing audiobook chapter-source/proof workflow.
- A broad schema migration unless existing typed persistence cannot represent the required quality state and the migration is explicitly justified by evidence.

## Likely Files Or Areas

- `src/adapters/tautulliAdapter.ts`
- `src/service/ingestionService.ts`
- `src/service/dashboardService.ts`
- `src/types/api.ts` and related shared types/read-model contracts
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- Relevant audiobook progress contract or dashboard documentation only when the implementation creates durable behavior future blocks must rely on.

## Acceptance Criteria

- Raw audiobook observations remain byte-for-byte/field-for-field unchanged by the repair and rebuild path; tests assert the relevant source fields before and after.
- The field contract validates `view_offset`, `duration`, and `percent_complete` against duration, bounds, high-water/session context, and available provenance before treating any value as position evidence.
- A usable validated position is preferred for derived progress. Invalid, missing, stale, or contradictory fields cannot silently become a verified position.
- Every derived audiobook progress result carries an explicit quality state and source explanation. Approximate and unavailable results are distinguishable from verified results in API data and UI labels.
- Chapter completion is reported as verified only when the validated position and existing verified chapter boundaries support that claim. A source percentage alone cannot produce verified chapter completion.
- The Way of Kings-style stale-progress canary no longer reports a precise false current chapter/percentage from the stale fallback; it is corrected from validated evidence or marked approximate/unavailable with an understandable explanation.
- A structurally different positive audiobook canary with valid position evidence still reports the expected percentage and chapter state.
- Overview audiobook digests, Progress cards/expansions, and shared audiobook detail show the same corrected position, percentage, chapter state, quality state, and explanation.
- Existing valid historical audiobook days remain stable after the derived rebuild; the repair does not flatten legitimate progress or inflate listening time from position-like fields.
- No movie or TV payload, rendering, or progress behavior changes as a side effect.
- Dashboard layouts remain readable and avoid horizontal overflow at the project’s supported narrow and desktop widths.

## Verification

- `npm run verify:block` passed on 2026-07-26:
  - 145/145 service tests passed.
  - 69 dashboard browser regressions passed with one intentional narrow-layout skip.
  - JavaScript syntax and tool-contract verification passed.
  - The 500-row Overview load canary completed in 131.95 ms against the 300 ms limit.
- Restarted only `plex-cowatch-service`; `npm run verify:live-dashboard` passed.
- The live Way of Kings canary now reports:
  - Overview session endpoints at chapter 17 / 54%, chapter 17 / 90%, and chapter 18 / 14% chapter-local progress.
  - Progress and shared detail both report chapter 18, 19% book progress, `stale_progress`, `play_duration`, and `sourceVerified: false`.
  - No approximate position is promoted to verified chapter completion.
  - Corrected listening-time deltas report 520 minutes across the visible history and 146 minutes in the current local-day digest instead of re-adding the cumulative duration after reset rows.
- A read-only before/after comparison across Overview, Progress, and detail retained all 46 Way of Kings source-evidence rows with the same SHA-256 (`0dc0ad6e67a92da6b6d248abc32539bae238afe2f7e55db9245d391bacd133ae`).

## Escalation Conditions

- Stop and re-scope if the source contract cannot distinguish position-like `duration` values from true media duration without new upstream evidence.
- Stop before adding a migration, worker, or new proof/source subsystem if the existing read-model and service boundaries cannot express the quality state.
- Do not apply a live retroactive repair until the positive and stale canaries pass and the raw-observation preservation check is recorded.
