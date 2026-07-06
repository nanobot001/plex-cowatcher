# Block 3-2n: Hierarchy Progress Workspace

> Status: Planned.
> Result: Not implemented.
> Notes: Replaces the unresponsive all-title Progress render with a bounded hierarchy-first workspace.

## Goal

Provide fast, honest progress exploration for episodic media and audiobooks while preserving partial consumption, repeats, per-person context, and unknown totals.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2m-5 complete, including the People ordering and heatmap interaction exit gate.
- Reuse the hierarchy and lazy-loading contracts from 3-2k rather than creating a second hierarchy model.

## Scope

- Start with bounded Recently Active, Continue, and Recently Completed groups rather than every title.
- Add person and category views with deterministic pagination or incremental loading.
- Present TV, Classic TV, and Anime as show summaries expandable into seasons and episode states.
- Present Audiobooks as series/subseries summaries expandable into books and chapter states.
- Keep Movies as completion/repeat summaries without artificial collection hierarchy.
- Separate distinct items, plays/repeats, completed items, partial items, observed time, and known totals.
- Lazy-load expanded hierarchy and reuse the 3-2k detail workspace for deeper evidence.
- Use canonical show posters and canonical audiobook book covers on all progress cards/nodes that display artwork; never use author/artist imagery as an audiobook cover.
- Apply hidden-user exclusion before progress calculation and use aliases for all visible per-person context.
- Provide explicit unknown-total and incomplete-metadata states.

## Out Of Scope

- Recommendations, goals, ratings, collection editing, progress mutation, or recalculating canonical audiobook hierarchy.
- Rendering all titles or all hierarchy nodes on first paint.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Progress reaches an interactive state within the 3-2g budget on the realistic fixture.
- Initial DOM and payload sizes remain within documented limits regardless of total history size.
- Repeat plays never increase distinct episode/chapter completion.
- Unknown totals are not displayed as zero, 100%, or completed.
- Expanding one hierarchy does not fetch or render unrelated hierarchies.
- Person/category filters preserve selection and browser-history context.
- Poster and user-preference fixtures verify book-cover identity, custom alias, username fallback, and hidden-user exclusion without changing underlying progress evidence.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Playwright first-paint timing and interaction checks with large, partial, repeated, and unknown-total fixtures.
- Drill through one TV, Classic TV, Anime, Audiobook, and Movie example.
- Confirm bounded response and DOM counts in automated tests.

## Drift Guardrails

- Progress is derived read-only intelligence; it must not edit Plex watched state.
- All hierarchy semantics come from the shared contract and 3-2k endpoints.
