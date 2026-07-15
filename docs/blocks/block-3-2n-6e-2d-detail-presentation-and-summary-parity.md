# Block 3-2n-6E-2D: Detail Presentation And Summary Parity

> Status: Planned.
> Result: Not implemented.
> Notes: Corrective child after 3-2n-6E-2C2. Make the shared hero readable and ensure Audiobook detail summaries agree with the verified expanded chapter hierarchy before 6E-3.

## Goal

Make detail presentation readable and semantically consistent: hero artwork should preserve faces and remain legible, while the Audiobook summary should report the verified read-through position rather than raw completed track rows.

## Dependencies And Entry Gate

- 6E-2A shared hero, poster, hierarchy, and one-scroll contracts are implemented.
- 6E-2C1 and 6E-2C2 are implemented and verified, so source-resolution and cross-surface artwork failures are distinct from presentation defects.
- Verified audiobook chapter mapping already supplies the expanded hierarchy’s read states and current position.

## Scope

- Reduce the hero overlay darkness, improve contrast treatment, and adjust hero height/focal positioning so genuine landscape art remains readable without routinely cutting off faces.
- Preserve the full-width hero and responsive layout across 320px, 390px, 768px, 1024px, and 1440px.
- Make the shared Audiobook detail summary use verified chapter read-through state: when chapters 1–31 are read from a 62-chapter book, show `31 of 62 chapters` rather than `0 of 62`.
- Ensure the summary numerator and expanded hierarchy derive from one chapter-aware source; do not use raw completed Plex track rows for verified chapter totals.
- Keep source labels explicit for verified chapters, unverified track/file evidence, and unknown totals.
- Add deterministic visual/contract coverage for hero readability, crop safety, audiobook summary parity, and no additional scroll owner.

## Out Of Scope

- Stale Plex identity recovery, cover freshness, poster/backdrop source selection, cache invalidation, or dashboard artwork adoption; 6E-2C1 and 6E-2C2 own artwork integrity.
- Changing session/repeat semantics, chapter inference rules, verified chapter data, or Progress calculations beyond reusing the established chapter-aware read model.
- Migrating Progress, removing `#progress-dialog`, generated artwork, external providers, database migrations, or 6D transcript/resume work.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- The detail hero remains full-width, readable, and visibly less obscured; faces are not routinely cropped at required desktop and narrow viewports.
- For verified Audiobooks, the left detail summary reports the number of chapters read through from the same chapter-aware state used by the expanded hierarchy.
- A book with chapters 1–31 read and 62 total displays `31 of 62 chapters`; it never falls back to raw completed track count for that verified summary.
- Unverified track/file evidence and missing chapter totals retain explicit source-honest wording.
- Existing poster/backdrop proxying, watcher lanes, one-scroll ownership, route state, focus behavior, and Progress isolation remain compatible.
- `npm run verify:block` and `npm run verify:live-dashboard` pass.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after PM2 restart
- Focused audiobook summary parity and deterministic viewport/hero checks
