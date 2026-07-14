# Block 3-2n: Hierarchy Progress Workspace Umbrella

> Status: Planned.
> Result: Split into implementation sub-blocks.
> Notes: Use this as the product and drift guardrail for Blocks 3-2n-1 through 3-2n-6; do not implement it directly.

## Goal

Provide fast, honest progress exploration for episodic media and audiobooks while preserving partial consumption, repeats, per-person context, and unknown totals.

## Split Decision

The original 3-2n scope crosses too many risk boundaries for one AI-buildable implementation turn: backend progress math, typed API contracts, deterministic pagination, indexed lazy hierarchy endpoints, frontend shell state, hierarchy expansion, artwork identity, and Playwright performance coverage.

Implement the outcome through these ordered sub-blocks:

1. `block-3-2n-1-progress-read-model-contract.md`
2. `block-3-2n-2-progress-workspace-shell.md`
3. `block-3-2n-3-progress-lazy-hierarchy-endpoints.md`
4. `block-3-2n-4-progress-hierarchy-ui-regression.md`
5. `completed/block-3-2n-5-audiobook-progress-contract.md`
6. `completed/block-3-2n-5a-audiobook-chapter-import-cache.md`
7. `completed/block-3-2n-5b-true-audiobook-chapter-progress.md`
8. `completed/block-3-2n-6-progress-evidence-map-polish.md`

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2m-5 complete, including the People ordering and heatmap interaction exit gate.
- Reuse the hierarchy and lazy-loading contracts from 3-2k rather than creating a second hierarchy model.

## Reviewed Risks

- Current `getProgress()` is sampled from recent activity rather than a deterministic progress read model, so older partial titles can disappear.
- Current completion math counts completed plays, which can let repeats inflate completion unless distinct item state is separated first.
- The current Progress renderer builds all summary cards and episode dot grids inline, preserving the unresponsive all-title drift risk.
- Existing detail hierarchy is useful but not a dedicated lazy progress hierarchy API; broad detail calls would fetch more than the expanded node needs.
- Progress has little dedicated Playwright coverage today, so first-paint, DOM bounds, URL state, expansion isolation, and responsive overflow need explicit regression checks.

## Drift Guardrails

- Progress is derived read-only intelligence; it must not edit Plex watched state.
- All hierarchy semantics come from the shared contract and 3-2k detail behavior.
- Hidden users must be excluded before progress aggregation, and aliases must be applied in the read model before the browser renders person context.
- Audiobook progress cards and nodes must use canonical book covers when available; never use author, artist, series, chapter, or track artwork as the book cover.
- Unknown totals must remain unknown and must not render as zero, 100%, or complete.
- Movies remain movie-level summaries; do not invent collection, season, or chapter hierarchy for them.

## Out Of Scope

- Recommendations, goals, ratings, collection editing, progress mutation, broad audiobook enrichment, or external metadata backfills.
- Rendering all titles or all hierarchy nodes on first paint.
- Implementing any child block directly from this umbrella file.

## Opportunities

- Reuse existing media grouping and artwork identity behavior as the starting point for progress summaries.
- Add explicit typed progress response shapes in `src/types/api.ts` before the UI depends on them.
- Add targeted indexes for hierarchy expansion paths before large fixtures make performance failures harder to diagnose.
- Reuse the dashboard route/hash patterns already used by Library, Timeline, and People for person/category/filter history.

## Child Block Ownership

- 3-2n-1 establishes the backend read model, response contract, fixtures, and math invariants.
- 3-2n-2 replaces the visible Progress workspace with bounded groups, filters, and URL-restorable state.
- 3-2n-3 adds lazy hierarchy expansion endpoints and supporting indexes without broad UI integration.
- 3-2n-4 wires hierarchy expansion into the browser and locks the Progress regression coverage.
- 3-2n-5 corrects audiobook Progress source semantics so Plex track/file rows are not mislabeled as verified chapters and audiobook watches trigger lightweight metadata caching.
- 3-2n-5a imports and caches verified chapter boundaries from the separate tool-friendly `audiobook` project or compatible structured fixtures.
- 3-2n-5b maps playback evidence onto cached verified chapter boundaries while preserving honest track/file or book-level fallbacks.
- 3-2n-6 polishes the expanded Progress UI into compact lazy evidence maps with accessible dots and readable typography.

## Likely Files Or Areas Across The Sequence

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`

## Acceptance Criteria

- The child blocks together deliver the original 3-2n goal without moving 3-2o earlier in the sequence.
- Each child block is independently verifiable with `npm run verify:block`.
- The final child block proves Progress first paint, payload bounds, DOM bounds, lazy expansion isolation, readable evidence maps, and drill-through examples for TV, Classic TV, Anime, Audiobook, and Movie.

## Verification And Exit Gate

- Do not mark this umbrella implemented directly.
- Each child block must run `npm run verify:block`.
- Run `npm run verify:live-dashboard` after any child block rebuilds or restarts the deployed dashboard.
