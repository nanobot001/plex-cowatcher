# Block 3-2n-1: Progress Read Model Contract

> Status: Implemented on 2026-07-07.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (76/76 unit tests, 24/24 Playwright tests, syntax and tool contracts).
> Notes: Stabilized the new typed, bounded progress response contract in `src/types/api.ts`, implemented show/book grouping and fallback logic in `DashboardService.getProgress`, updated route backward compatibility, and verified correctness with comprehensive unit and HTTP tests.

## Goal

Replace the sampled Progress summary with a typed, bounded, deterministic read model that separates distinct items, repeat plays, partials, completed items, observed time, and unknown totals without changing the visible Progress UI yet.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2m-5 are complete.
- `block-3-2n-hierarchy-progress-workspace.md` has been reviewed and split into child blocks.
- Reuse the 3-2k hierarchy and artwork vocabulary; do not introduce a competing progress hierarchy model.

## Scope

- Define typed Progress response shapes in `src/types/api.ts` for summary groups, buckets, people context, known/unknown totals, repeat counts, partial counts, artwork, and timing metadata.
- Update `DashboardService.getProgress` to return bounded Recently Active, Continue, and Recently Completed groups with deterministic `limit`/`offset` or equivalent bounded paging metadata.
- Aggregate progress by stable media identity rather than `userId:category:title`, while preserving visible per-person context inside each group.
- Apply hidden-user exclusion and dashboard aliases before progress calculation.
- Ensure repeated completed plays never increase distinct episode/chapter completion.
- Represent unknown totals explicitly rather than as zero, complete, or 100%.
- Preserve the existing `/api/dashboard/progress` route as a read-only dashboard endpoint with timing metadata.
- Add or extend service tests and fixtures for repeats, partials, unknown totals, hidden-user exclusion, aliases, username fallback, and audiobook book-cover identity.

## Out Of Scope

- Replacing the visible Progress workspace UI.
- Adding hierarchy expansion endpoints.
- Rendering season, episode, book, or chapter nodes in the browser.
- Mutating Plex state, progress goals, ratings, recommendations, or collection metadata.

## Risk And Mitigation Plan

- Risk: the current Progress data is sampled from recent activity, so increasing the sample limit would hide the bug without fixing older partial or completed media disappearing.
- Mitigation: build a deterministic grouped read model with explicit bounded paging metadata instead of depending on `SUMMARY_SAMPLE_LIMIT`.
- Risk: repeated completed plays can inflate completion when play events are counted as completed items.
- Mitigation: compute distinct item state from stable media identities first, then expose repeat/play counts separately.
- Risk: unknown totals can drift into zero percent, complete, or 100% states.
- Mitigation: add an explicit known/unknown total state in the typed response and fixture-test it before any browser rewrite consumes the contract.

## Drift Controls

- Keep this block backend-contract only; do not rewrite `renderProgress`, add hierarchy expansion routes, or change visible dashboard behavior beyond compatibility.
- Reuse the 3-2k hierarchy and existing media/artwork vocabulary rather than adding parallel Progress-only identity terms.
- Apply hidden-user exclusion and dashboard aliases before aggregation so later UI blocks cannot accidentally render private or stale person context.

## Dependency Plan

- Start only after 3-2m-5 is complete and the 3-2n umbrella split remains the accepted plan.
- Define `src/types/api.ts` response shapes before changing the browser, because 3-2n-2 and 3-2n-3 both depend on these names and semantics.
- If a durable dashboard invariant is introduced, update the regression contract in the same block so later Playwright coverage has an agreed target.

## Opportunities To Use

- Reuse existing `getMedia()` grouping and artwork behavior where it already handles canonical media identity correctly.
- Reuse existing `getActivity()` visibility, alias, and username fallback behavior as a source of test expectations.
- Establish compact fixture cases for repeats, partials, unknown totals, aliases, and audiobook book-cover identity that later child blocks can consume.
- Add timing metadata and payload-bound assertions early so performance regressions are visible before hierarchy rendering exists.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`
- `docs/design/dashboard-redesign-contract.md`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- `/api/dashboard/progress` returns bounded, typed summary groups with deterministic ordering and pagination metadata.
- The service tests prove repeat plays do not inflate distinct completion.
- Unknown totals are represented as an explicit unknown state and never as zero or complete.
- Hidden users are absent from progress aggregation, while visible aliases and username fallback appear in person context.
- Audiobook progress summaries use canonical book-cover identity when artwork is present and do not use author/artist imagery as the book cover.
- Timing metadata remains present and testable.

## Verification

- `npm run verify:block`
