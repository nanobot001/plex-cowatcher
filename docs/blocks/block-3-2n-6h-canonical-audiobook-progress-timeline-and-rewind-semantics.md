# Block 3-2n-6H: Canonical Audiobook Progress Timeline And Rewind Semantics

> Status: Implemented on 2026-08-15.
> Result: Implemented with limitations.
> Verification: `npm run verify:block` - passed (148 deterministic tests, 69 browser tests passed with 1 intentional skip, tool contracts passed).
> Notes: Added the pure typed canonical evaluator, revision-safe replay, rewind/furthest/session/chapter projections, 6G compatibility adapter, and dashboard adoption for verified audiobook reads. Exact capture remains 6I; browser presentation remains 6J-B.
> Dependency: Block 3-2n-6G established validated position evidence and explicit quality states.
> Scope note: First block in the project-wide audiobook-progress sequence. This block owns deterministic domain semantics only; it does not add a new capture path or add a listening bar.

## Goal

Create one typed, deterministic audiobook-progress evaluator that can distinguish current position, furthest trusted position, session movement, rewinds/revisits, chapter history, and uncertainty for one listener and one exact audiobook media/chapter revision.

The evaluator must be the only future authority for derived audiobook progress. It must preserve raw observations and must not collapse current position, lifetime attainment, and chapter completion into one percentage.

## Current Problem

- Block 3-2n-6G correctly prevents stale source percentages from becoming verified progress, but its high-water behavior can protect against resets only by treating later lower positions as uncertain.
- A legitimate rewind is therefore indistinguishable from a source reset when exact evidence is absent.
- Current chapter mapping can mark every historical chapter containing approximate observations as `partial`, even though only the latest forward position or a later replay should be current.
- Session summaries, current resume position, furthest attainment, and chapter completion require different projections over the same evidence.

## Locked Shared Semantics

- **Current position** is the newest usable position as of the requested time. It may move backward after a trusted rewind.
- **Furthest trusted position** is the highest verified position reached for the same listener, audiobook, and compatible media/chapter revision. A rewind does not erase it.
- **Listening time** is derived from validated session duration evidence. It does not decrease during a rewind and is not inferred from net playhead movement.
- **Session movement** records the best supported session start and end positions, direction, chapter-local change, and quality. Historical sessions are evaluated as of their own end time, never copied from the book's latest position.
- **Chapter state** is one of `in_progress`, `revisiting`, `passed`, `probably_passed`, `explicitly_completed`, or `unknown`. Presentation aliases may be added later, but their meanings may not be weakened.
- `passed` means trusted position evidence crossed the chapter boundary. It is not a forensic claim that every second was heard.
- `probably_passed` is an inference from bounded approximate evidence and must never be presented as verified completion.
- `explicitly_completed` requires authoritative completion evidence applicable to that chapter or exact file/chapter unit.
- A lower exact offset after a higher exact offset is a rewind/revisit. A lower approximate value against stale/reset evidence remains uncertain unless corroborated.
- Household views retain per-user snapshots. They must not average positions or merge one listener's chapter attainment into another's.
- Every derived value carries evidence source, quality, reason, evaluated-at time, media revision, and chapter revision when available.

## Scope

- Define a typed canonical snapshot for one audiobook/listener containing:
  - current position and book/chapter percentage;
  - furthest trusted position and percentage;
  - direction/revisit state;
  - chapter states;
  - session movements;
  - evidence quality, source, reason, and revision identity.
- Refactor or extend the existing `audiobookProgressEvidence` logic into a pure evaluator that accepts ordered source observations plus verified chapter/media timelines.
- Preserve exact offsets as exact, bounded estimates as approximate, and missing or contradictory evidence as unknown.
- Detect trusted forward movement, rewind/revisit movement, stale/reset rows, duplicate observations, and out-of-order delivery without mutating source rows.
- Rebuild historical derived results by replaying existing observations in deterministic time/id order.
- Keep single-file and already-supported multi-file global-offset mapping capability-based and revision-safe.
- Provide adapters from the new snapshot to the existing 6G result shape only where needed to keep current callers compiling until Block 3-2n-6J-A migrates service/API consumers.
- Add focused service canaries for forward progress, a trusted rewind, stale/reset evidence, approximate historical progress, and structurally different multi-file mapping.

## Out Of Scope

- Tautulli notifier/webhook configuration, `get_activity` sampling, or any new ingestion path; Block 3-2n-6I owns future exact capture.
- Dashboard copy, CSS, cards, progress bars, or visible cross-surface migration; Block 3-2n-6J-B owns browser presentation.
- Transcript/resume-context generation, media clipping, or Whisper work.
- Rewriting, deleting, or inventing values in `playback_observations`.
- Treating a passed playhead boundary as proof that every second was heard.
- New queues, background workers, or materialized caches unless a measured read-performance failure proves the pure evaluator insufficient.
- Movies, TV, Anime, or Classic TV.

## Likely Files Or Areas

- `src/service/audiobookProgressEvidence.ts`
- `src/service/audiobookMultiFileService.ts`
- `src/service/dashboardService.ts` only for a temporary compatibility adapter
- `src/types/api.ts` or a dedicated shared audiobook-progress type module
- `tests/run-tests.mjs`

## Acceptance Criteria

- One canonical typed snapshot exposes current and furthest positions as separate fields; no field is ambiguously named `progress` without a documented scope.
- For exact offsets that move chapter 17 -> chapter 19 -> chapter 14 -> chapter 15:
  - current position is chapter 15;
  - furthest trusted position remains chapter 19;
  - the backward segment is identified as a rewind/revisit;
  - listening time reflects validated session durations rather than net offset change;
  - chapters are not duplicated or broadly relabeled `partial`.
- A lower stale/reset row without trusted offset cannot manufacture a rewind or erase a prior usable position; the ambiguity is explicit.
- Historical session results retain the position known at each session end and do not inherit the latest book snapshot.
- Chapter states preserve the distinction among passed, probably passed, current/revisiting, explicitly completed, and unknown.
- Raw observations and source fields are unchanged before and after evaluation.
- Media/chapter revision mismatch cannot project a position onto incompatible boundaries.
- Single-file and supported multi-file canaries produce equivalent book-global semantics.
- The existing 6G positive and stale-progress fixtures remain source-honest through the compatibility adapter.
- No dashboard, ingestion, PM2, tool, or non-audiobook behavior changes in this block.

## Escalation Conditions

- Stop and re-scope before adding persistent derived state, a worker, or a new table unless a measured deterministic fixture proves on-read evaluation cannot meet the existing performance budget.
- Stop if current media/chapter revisions cannot be associated with the evaluated observations without inventing identity.
- Do not classify an apparent rewind when only contradictory approximate evidence exists.

## Verification

- `npm run verify:block`
- Focused service tests for forward, rewind, replay, stale/reset, duplicate, out-of-order, revision-drift, single-file, and multi-file evidence
- Raw-observation before/after equality assertion
- No service restart or live-dashboard gate is required unless implementation unexpectedly changes deployed behavior
