# Block 3-2f: Premium Dashboard Redesign

## Goal

Redesign the dashboard from 5 overlapping tabs into 5 dramatically distinct, premium panels based on mockups. Implement Gantt chart timeline, category stat cards, consumption dots, categorized library browser, continue watching, co-watch patterns, weekly heatmaps, and operations lane.

## Implementation Plan

### Phase 1: Backend Data Enrichment
- Enhance `DashboardService` with new methods/queries:
  - `getContinueWatching()` - most recent incomplete observations per title (last 30 days).
  - Enhance `getOverview()` to `getOverviewEnriched()` with category hours, completion rates, top titles per category, weekly heatmaps per user.
  - Enhance `getProgress()` to `getProgressEnriched()` with episode-level dot data, audiobook hierarchy, and recently completed items.
  - `getCowatchPatterns()` - group co-watching events by category pairs and sum hours.
- Update Express routes in `src/server/routes.ts` to serve the enriched data.

### Phase 2: Frontend Rewrite
- Update `src/web/index.ts`: Rename "Media Explorer" to "Library" and "Progress & Collections" to "Progress". Update the subtitle. Keep shared filters.
- Completely rewrite `src/web/static/dashboard.js` render functions to support the new premium layouts:
  - `renderOverview()`: Command center (stat cards, continue watching, completion rings, leaderboards, heatmaps, ops lane).
  - `renderTimeline()`: Gantt chart (user swim lanes, time axis, co-watch markers).
  - `renderLibrary()`: Categorized poster grids with continue watching and episode badges.
  - `renderPeople()`: Active user cards with heatmaps, co-watch patterns, event cards with badges.
  - `renderProgress()`: Season dots, audiobook hierarchy, recently completed.
  - `openDetail()`: Enhanced modal with playback evidence thumbnails and consumption dots.
- Overhaul `src/web/static/styles.css` with a warmer, premium Plex-inspired dark theme and comprehensive layout styles for the new components (Gantt, heatmaps, dot grids, donuts, stat cards, carousels).

## Acceptance Criteria
- [x] 5 tabs function without errors: Overview, Timeline, Library, People, Progress.
- [x] Overview displays category stat cards, continue watching, completion rings, leaderboards, and heatmaps.
- [x] Timeline renders a Gantt chart visualization with user rows and time blocks.
- [x] Library displays categorized sections (TV, Movies, Anime, Audiobooks) with "Continue Watching".
- [x] People focuses on active users with heatmaps and detailed co-watching pattern cards.
- [x] Progress shows episode dot grids for series and honest unknown-total handling.
- [x] CSS uses the new warmer dark theme variables.
- [x] Existing functionality (CSV export, filters, `/copy`, `/audit`, `/settings`) remains intact.
- [x] Verify passes (`npm run build`, `npm test`, `npm run verify:tools`).

Status: Completed.
