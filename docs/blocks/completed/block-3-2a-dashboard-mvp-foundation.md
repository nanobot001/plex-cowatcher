# Block 3-2a: Usable Dashboard MVP Foundation

> Status: Implemented on 2026-06-28.
> Result: Implemented.
> Verification: npm run build, npm test (52/52), npm run verify:tools, node --check src/web/static/dashboard.js, and live PM2 HTTP walkthrough - passed.
> Notes: Shared typed dashboard model, mixed-media overview, filters, resilient panels, details, and token-safe artwork proxy.

## Goal

Deliver the first genuinely useful dashboard slice: a polished household overview that shows what all configured users are consuming, with shared customization controls, mixed-media totals, and meaningful drill-downs backed by real data.

## Scope

- Define the typed dashboard filter, query, and view models shared by browser and HTTP layers.
- Extract reusable dashboard rendering, fetch, filter, loading, error, and empty-state primitives from the current inline page.
- Build Household Overview with mixed-media totals, recent activity, people, consumption mix, pending prompts, and service readiness.
- Add date, person, media-category, and library filters with visible active state and clear/reset controls.
- Add a recent-activity list covering movies, TV, classic TV, anime, and audiobooks.
- Provide first-level media and person detail from overview/activity selections.
- Persist non-sensitive filter and display preferences in browser localStorage.
- Reuse Plex artwork through a localhost-safe route with fallbacks and no token exposure.
- Add only the bounded aggregation and pagination endpoints required for this MVP.

## Out Of Scope

- Alternate layouts beyond Household Overview.
- Full timeline reconstruction, media explorer browsing, co-watch mutation controls, or CSV export.
- Permanent artwork or export storage.
- Scheduled reports or Discord delivery.
- New inference rules or database schema changes unrelated to the overview slice.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/public/styles.css`
- `src/server/routes.ts`
- `src/service/queryService.ts`
- `src/service/summaryService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- [ ] Dashboard opens with helpful real household information rather than raw JSON or placeholders.
- [ ] Every configured user and every supported media category can appear in overview and recent activity.
- [ ] Filters update all visible dashboard data consistently and survive reload when appropriate.
- [ ] Summary/activity elements open useful media or person detail and return cleanly to dashboard context.
- [ ] Plex artwork loads without exposing tokens or authenticated upstream URLs; missing artwork has a useful fallback.
- [ ] Queries are bounded, deterministically ordered, and use shared services.
- [ ] Partial API failure degrades affected panels without blanking the page.
- [ ] Existing browser routes and non-browser contracts remain intact.
- [ ] The page remains usable when storage preferences are missing, stale, or invalid.

## Verification

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Manual MVP walkthrough with multiple users, mixed media, filters, drill-down/back behavior, reload persistence, artwork fallback, and one simulated panel failure.