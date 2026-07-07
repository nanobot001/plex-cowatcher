# Block 3-2n-2: Progress Workspace Shell

> Status: Implemented on 2026-07-06.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (76/76 unit tests, 28/28 Playwright tests).
> Notes: Rebuilt the Progress workspace around three paginated sections (Continue, Recently Active, Recently Completed), integrated URL parameters and browser history, and verified correctness with comprehensive Playwright E2E coverage.

## Goal

Replace the current all-card Progress render with a fast, bounded workspace shell for Recently Active, Continue, and Recently Completed progress groups, including person/category filtering and browser-history state, without hierarchy expansion yet.

## Dependencies And Entry Gate

- Block 3-2n-1 is implemented and verified.
- The `/api/dashboard/progress` response has typed bounded groups, timing metadata, hidden-user exclusion, alias handling, artwork identity, and repeat/unknown semantics.

## Scope

- Rebuild `renderProgress` around bounded sections for Recently Active, Continue, and Recently Completed groups.
- Add Progress person and category controls that preserve selection in the hash route and browser history.
- Render movie, episodic, and audiobook summary cards without full season/chapter dot grids on first paint.
- Display distinct item count, plays/repeats, partial count, completed count, observed time, known total state, and visible people context using the 3-2n-1 contract.
- Keep Movies as completion/repeat summaries without artificial hierarchy.
- Provide clear empty, loading, and partial failure states for each Progress section.
- Add Playwright coverage for first interactive state, bounded DOM count, URL-restorable filters, narrow viewport overflow, and no page errors.

## Out Of Scope

- Adding season, episode, book, or chapter expansion.
- Introducing new backend hierarchy endpoints.
- Changing the 3-2k detail modal behavior except for drill-through links if needed.
- Goals, ratings, recommendations, collection editing, or Plex mutation.

## Risk And Mitigation Plan

- Risk: the UI rewrite could recreate the current all-card or all-dot-grid render under a cleaner visual skin.
- Mitigation: render bounded summary cards only on first paint and add Playwright DOM-count coverage against the deterministic fixture.
- Risk: Progress filters can drift from the dashboard route/hash and browser-history patterns used elsewhere.
- Mitigation: reuse the existing dashboard URL-state approach and test reload, Back, and Forward explicitly.
- Risk: unknown totals can look like empty bars, zero progress, or completed work if the shell invents display math.
- Mitigation: consume the 3-2n-1 known/unknown state directly and render explicit unknown copy rather than deriving percentages from missing totals.

## Drift Controls

- Do not add hierarchy expansion, backend expansion routes, or season/chapter node rendering in this block.
- Do not add instructional in-app copy to compensate for unclear UI; solve the interaction through layout, labels, states, and accessible controls.
- Preserve dashboard design standards for padding, no horizontal overflow, proportional layout, thin scrollbars where needed, and 320px behavior.

## Dependency Plan

- Start only after 3-2n-1 is implemented and `npm run verify:block` passes.
- Treat the 3-2n-1 response type as the source of truth; if the shell reveals a contract gap, fix the contract intentionally rather than adding browser-only inference.
- Extend `tests/e2e/dashboard-regression.spec.mjs` in this block because the visible Progress shell adds durable cross-surface invariants.

## Opportunities To Use

- Reuse existing segmented controls, dashboard route helpers, loading states, and overflow helpers where they match the established dashboard language.
- Establish stable Progress `data-testid` selectors now so 3-2n-4 hierarchy tests do not rely on incidental CSS classes.
- Improve section-level empty, loading, and partial-failure states while the shell is being rebuilt, because these are cheaper before hierarchy expansion lands.

## Likely Files Or Areas

- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/e2e/fixture-server.mjs`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- Progress reaches an interactive state within the 3-2g budget on the deterministic fixture.
- Initial Progress DOM count remains bounded regardless of total history size.
- Person/category controls preserve selection across reload, Back, and Forward.
- Unknown totals are visible as unknown states, not empty bars, zero percent, complete, or 100%.
- Movies show progress/repeat evidence without invented hierarchy.
- The 320px and desktop regression journeys have no horizontal overflow or page errors.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
