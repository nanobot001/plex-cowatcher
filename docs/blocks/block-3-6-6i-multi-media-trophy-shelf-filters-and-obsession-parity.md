# Block 3-6-6I: Multi-Media Trophy Shelf Filters, Modal Presenters, And Cross-Media Obsession Spotlight

> Status: Implemented (2026-10-16).
> Result: Implemented and verified via deterministic test gate (`npm run verify:block`) and live smoke gate.
> Dependency: Blocks 3-6-6G and 3-6-6H implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Update the Achievements dashboard UI (`src/web/index.ts`) and Obsession Spotlight (`src/achievements/evaluator.ts`) so **TV**, **Anime**, **Movies (Franchises & Rewatch Favorites)**, and **Audiobooks** can be filtered, browsed, and inspected with media-appropriate detail modals.

## Scope

- **Media Category Filter Bar (`src/web/index.ts`)**:
  - Add a secondary media filter bar (`All Media | TV | Anime | Movies | Audiobooks`) alongside the state filter tabs (`All | Earned | Caught Up | In Progress`), showing counts per media type and filtering both the **Trophy Shelf** and **Badges & Milestones** grids.
- **Media-Specific Trophy Card Badges & Copy**:
  - Render appropriate media pill icons and units on Trophy Shelf cards:
    - **TV / Anime**: `X/Y eps`, broadcast progress, and `Next: <date>`.
    - **Audiobooks**: `Xh Ym / Zh (X%)`, chapter count, and `Re-listened Nx` ribbon.
    - **Movie Franchises**: `X of Y films`, `Caught Up` or `100% Completed` franchise badge.
    - **Rewatched Movies**: `Watched Nx` loyalty ribbon (`Silver 2x`, `Gold 3x`, `Platinum 4x+`) and last watched date.
- **Media-Appropriate Achievement Detail Modal (`showModal` in `src/web/index.ts`)**:
  - Adapt the modal's coverage audit box and item checklist based on trophy type:
    - **TV / Anime**: *Server Coverage Audit* + *Episode Progress & Rewatch Checklist*.
    - **Audiobooks**: *Listening Progress Summary* (Hours Listened, Total Duration, Chapters Completed, Percent Complete) + *Chapter / Session Breakdown*.
    - **Movie Franchises**: *Franchise Coverage Audit* (Films on Plex, Household Watched, Missing Off-Server) + *Franchise Film Checklist*.
    - **Rewatched Movies**: *Replay Loyalty Summary* (Total Watches, First Watched, Latest Watched, Next Tier Progress) + *Viewing Session History*.
- **Cross-Media Obsession Spotlight (`src/achievements/evaluator.ts` & `src/web/index.ts`)**:
  - Extend `evaluateObsessionSpotlight` so high-hour Audiobooks and Movie Franchises/Rewatches compete fairly alongside TV/Anime series (or surface top obsession per media category when a media filter is active), using media-appropriate unit labels (`Episodes`, `Hours Listened`, `Films / Watches`).

## Out Of Scope

- Changes to raw playback ingestion or database schemas.
- Standalone external app deployment.

## Likely Files Or Areas

- `src/achievements/evaluator.ts`
- `src/web/index.ts`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Users can filter the Trophy Shelf and Badges by media category (`All`, `TV`, `Anime`, `Movies`, `Audiobooks`) in combination with state filters (`All`, `Earned`, `Caught Up`, `In Progress`).
- Clicking an Audiobook, Movie Franchise, or Rewatched Movie trophy opens a detail modal with media-appropriate labels (`Films`, `Chapters`, `Hours`) rather than hardcoded `Episodes` copy.
- Layout complies with `AGENTS.md` standards across 320px–1440px viewports with zero horizontal overflow.
- `npm run verify:block` and `npm run verify:live-dashboard` pass.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard`
- Playwright and unit test assertions for media category filtering and modal presentation
