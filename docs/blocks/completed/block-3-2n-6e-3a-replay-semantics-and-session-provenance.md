# Block 3-2n-6E-3A: Replay Semantics And Session Provenance

> Status: Implemented and verified.
> Result: Raw observations, reconstructed sessions, household-local viewing days, and evidence-backed replays are now separate across Progress and shared detail projections.
> Verification: Completed 2026-07-16. `npm run verify:block` passed with 113 service/integration tests, 53 dashboard regression cases plus one intentional viewport-matrix skip, JavaScript syntax validation, and tool-contract verification. After the PM2 restart, `npm run verify:live-dashboard` passed.
> Notes: Corrective block after 6E-3 and before 6D. Replace raw-observation-based “repeated” labels with source-honest session, viewing-day, and genuine replay semantics across Progress and shared detail surfaces.

## Goal

Make “repeated” mean a genuine additional viewing rather than a second telemetry row. A listener who starts, stops, resumes, or generates multiple overlapping observations on one continuous day should not automatically receive a repeated label. The read model must distinguish raw observations, reconstructed viewing sessions, local viewing days, and evidence-backed replays before 6D builds audiobook resume context on top of progress truth.

## Dependencies And Entry Gate

- Block 3-2n-6E-3 is implemented and verified, so Progress and non-Progress callers consume one shared detail workspace.
- Existing `SessionService` interval reconstruction, canonical detail identity, Movie household-local viewing-day grouping, and audiobook verified/unverified source rules remain available as inputs.
- Do not change 6D transcription, resume jobs, or modal presentation in this block; 6D consumes the corrected read model after this block passes.

## Scope

- Define and document the distinction between `observationCount`, `sessionCount`, `viewingDayCount`, and `replayCount` for one visible listener and one canonical media item.
- Reuse or extend deterministic session reconstruction so contiguous, overlapping, and ordinary start/stop observations collapse into one session instead of becoming a replay.
- Mark `repeated` only when there is evidence of more than one genuine viewing session: different local viewing days are strong evidence, while same-day replays require separate session boundaries plus a meaningful completion/offset-reset signal.
- Keep ambiguous multiple observations source-honest. They may contribute to observation/session evidence, but must not become `repeated` solely because a row count exceeds one.
- Apply the corrected semantics consistently to TV, Classic TV, Anime, Movie, verified Audiobook chapters, and unverified Audiobook track/file fallback.
- Expose enough bounded provenance for the UI and tests to explain a repeated state without leaking raw private data: session count, viewing-day count, replay count or reason, latest evidence time, and source classification where applicable.
- Preserve existing `watched`, `partial`, `unknown`, and `source_uncertain` behavior, current-position mapping, hidden-user exclusion, aliases, canonical identity, and bounded lazy loading.
- Update user-facing copy and accessibility labels so “Repeated” is reserved for genuine replay evidence; raw observation totals must not be presented as replay totals.

## Semantics To Lock

- A raw playback observation is telemetry and is never, by itself, a play or replay.
- A viewing session is a bounded interval reconstructed for one listener and canonical item from overlapping/contiguous observations and the existing inactivity policy.
- A viewing day is a household-local calendar day containing eligible evidence for that listener and item.
- A repeated state requires at least two evidence-backed viewing sessions. Two different viewing days satisfy the strong-evidence path. Same-day repeated viewing requires separate sessions and a meaningful completion or backward offset reset; a mere polling gap does not qualify.
- Partial-only or source-uncertain observations do not create a repeated state unless a later eligible session independently proves a replay.
- Existing public field names remain compatibility-sensitive. Add explicit fields or a versioned projection where needed rather than silently changing the meaning of an established tool-facing count.

## Out Of Scope

- Rebuilding the Progress or Overview modal shell; 6E-3 owns shared workspace migration.
- Audiobook transcription, stable-stop workers, resume jobs, excerpts, or the 6D modal.
- Changing chapter boundaries, proof activation, playback ingestion, Plex writes, or external provider behavior.
- Merging media by title, fuzzy identity, artwork, or cross-user similarity.
- Treating every same-day start/stop pair as a replay, or inventing replay confidence when session boundaries are unavailable.

## Likely Files Or Areas

- `src/service/sessionService.ts`
- `src/service/dashboardService.ts`
- `src/service/summaryService.ts` or other shared read-model aggregation code
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `docs/blocks/block-3-2n-6d-audiobook-resume-context.md` only for dependency wording if the final contract changes

## Acceptance Criteria

- Three same-day start/stop observations that reconstruct to one session produce `sessionCount = 1`, `replayCount = 0`, and no `repeated` state.
- Two completed sessions on different local viewing days produce a repeated state with distinct session/day evidence; raw observation count is separately available and does not inflate replay count.
- Two same-day completed sessions with a clear boundary and completion/offset reset may produce one replay; two same-day rows without that evidence do not.
- TV, Classic TV, Anime, Movie, verified Audiobook, and unverified Audiobook fixtures all use the same replay rule while retaining their source-specific progress rules.
- Existing overlapping-session behavior remains correct: overlapping observations merge into one session and do not become repeated.
- Partial, unknown, source-uncertain, hidden-user, stale-identity, and ambiguous-boundary cases remain source-honest and do not fabricate replay claims.
- Progress hierarchy badges, watcher evidence, summary cards, and shared detail presenters agree on repeated state and bounded session/day counts.
- Existing canonical Movie viewing-day history remains compatible and does not double-count same-day observations.
- Regression coverage proves that raw observation count, session count, viewing-day count, and replay count are not conflated.
- `npm run verify:block` passes before implementation status changes. After deployed rebuild/restart, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Focused service fixtures for same-session start/stop, overlapping observations, different-day replays, same-day completed replays, ambiguous gaps, partials, source uncertainty, aliases, hidden users, and canonical identity.
- Dashboard regression coverage across required widths for repeated labels, provenance copy, one-scroll behavior, and cross-surface parity.
- Live smoke after restart confirms corrected repeated semantics remain visible without changing non-replay progress or audiobook source honesty.
