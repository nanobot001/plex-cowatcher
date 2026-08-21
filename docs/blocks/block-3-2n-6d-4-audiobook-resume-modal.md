# Block 3-2n-6D-4: Audiobook Stopping-Point Excerpt Extension

> Status: Planned, narrowed after 6J-B.
> Result: Not implemented.
> Notes: Canonical per-listener progress, chapter state, and the collapsed complete chapter disclosure already exist. This block adds only private revision-valid stopping-point context.

## Goal

Add a concise optional “Near your stopping point” excerpt to the existing canonical Audiobook detail presenter without rebuilding progress, chapter maps, listener attribution, or modal structure.

## Entry Gate

- Blocks 6D-1A, 6D-1B, 6D-2, and 6D-3 are implemented and verified.
- One current revision-valid synthetic or explicitly approved result exists.
- The implemented 6J-B canonical audiobook projection and shared detail workspace remain authoritative.

## Scope

- Extend the existing lazy canonical Audiobook detail response with at most one current 6D-3 result for the active visible listener.
- Default listener selection to the existing dashboard/person context and canonical per-listener progress behavior; do not invent a second selector or position model.
- Render one escaped-text-only “Near your stopping point” section adjacent to the existing canonical current-position/chapter presentation.
- Omit the section completely for disabled, pending, unavailable, no-speech, failed, stale, superseded, hidden-listener, unverified, or multi-file states.
- Keep the excerpt out of generic activity, audit, health, exports, tool status, and non-audiobook presenters.
- Preserve the existing chapter disclosure, one modal scroll region, routing, focus, cache, responsive geometry, and shared shell.

## Out Of Scope

- A new progress bar, chapter map, up-next model, complete-list renderer, modal, route, listener-position evaluator, or hierarchy redesign.
- Browser job controls, full transcripts, segments, copy/export/download, model diagnostics, summaries, search, or recommendations.
- Changes to ingestion, proof, progress math, jobs, revisions, scheduling, or non-audiobook views.

## Likely Files Or Areas

- canonical dashboard detail service/API types
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs` and deterministic fixtures

## Acceptance Criteria

- One current result displays a listener-attributed inert excerpt of no more than the persisted 20 words.
- Every unavailable/stale/private-ineligible state omits the section without an empty card, spinner, or operational error.
- Tags, entities, URLs, Markdown, and instruction-like fixture text render only as text.
- Existing canonical current/furthest/revisit/chapter behavior and complete-chapter disclosure remain unchanged.
- Hidden listeners and excerpt text do not appear in unrelated response surfaces.
- At 320px, 390px, 768px, 1024px, and 1440px there is no horizontal overflow, duplicate scroll region, cramped padding, or excessive empty space.
- `npm run verify:block` passes; after deployment, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Service privacy/revision/visibility tests
- Semantic, keyboard, inert-text, omission, one-scroll, and geometry assertions in `tests/e2e/dashboard-regression.spec.mjs`
- `npm run verify:live-dashboard`
