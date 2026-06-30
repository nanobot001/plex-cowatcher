# Block 3-2e: Progress, Export, Accessibility And Hardening

> Status: Implemented on 2026-06-28.
> Result: Implemented.
> Verification: npm run build, npm test (52/52), npm run verify:tools, node --check src/web/static/dashboard.js, and live PM2 HTTP walkthrough - passed.
> Notes: Progress and collection views, streamed privacy-safe CSV, responsive keyboard-accessible UI, query indexes, and full regression verification.

## Goal

Complete the dashboard with progress-oriented exploration, optional external analysis, accessibility, responsive behavior, and performance/regression hardening.

## Scope

- Add Progress & Collections as the fifth dashboard layout.
- Show episodic show/season/episode progress and audiobook series/subseries/book/chapter progress.
- Preserve partial consumption, repeats, known-total uncertainty, and per-person context.
- Add CSV export of the active filtered history using documented stable columns.
- Generate and stream CSV on demand without retaining server-side export files.
- Exclude tokens, private media paths, authenticated artwork URLs, and sensitive adapter metadata.
- Complete responsive desktop/tablet behavior, keyboard navigation, visible focus, semantics, contrast, loading, empty, and error states.
- Profile realistic dashboard queries and add justified indexes or aggregation improvements.
- Run full browser, API, CLI, Discord, copy-history, settings, audit, PM2-contract, and service-worker regression checks.
- Treat CSV as a transient browser download, not as retained application data.

## Out Of Scope

- Scheduled exports or report delivery.
- Spreadsheet-specific formatting.
- Permanent CSV or artwork storage.
- New recommendations or analytics predictions.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/public/styles.css`
- `src/server/routes.ts`
- `src/service/queryService.ts`
- `src/service/summaryService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`
- `docs/data/` for the stable CSV contract if implementation creates it
- `docs/testing/` for durable dashboard QA guidance if needed

## Acceptance Criteria

- [ ] All five layouts are available through one persistent layout switcher.
- [ ] Progress handles distinct versus repeated consumption and unknown totals honestly.
- [ ] CSV reflects active filters, has stable documented columns, and is streamed without retained files.
- [ ] CSV and dashboard payloads exclude secrets and private paths.
- [ ] Core workflows are usable with keyboard only and at narrow and desktop widths.
- [ ] Large realistic datasets remain bounded and responsive.
- [ ] Existing copy-history, settings, audit, API, CLI, Discord, PM2, manifest, and service-worker behavior passes regression checks.
- [ ] The first visible dashboard load remains fast enough to be useful on a local household machine.

## Verification

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Manual five-layout mixed-media walkthrough.
- Manual keyboard, responsive, CSV privacy/content, failure-state, and performance checks.