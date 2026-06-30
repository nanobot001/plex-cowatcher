# Block 3-2o: Dashboard Accessibility And Regression Gate

> Status: Planned.
> Result: Not implemented.
> Notes: Final release gate for the corrective dashboard sequence; it may fix integration defects but may not introduce a sixth layout or new product scope.

## Goal

Prove the redesigned dashboard is coherent, responsive, accessible, performant, privacy-safe, and regression-safe before the series is declared complete.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2n individually complete with their recorded exit evidence.
- No acceptance criterion from an earlier block may be deferred into this block without updating that block’s result and rationale.

## Scope

- Run a complete five-layout Playwright journey at 1440x900, 1024x768, and 390x844.
- Add stable visual snapshots or structural screenshot assertions for shell and first viewport of every layout.
- Complete keyboard-only navigation, focus order/restoration, dialog/sheet, hierarchy, filter, carousel, pagination, and error recovery checks.
- Verify color contrast, semantic headings/landmarks, accessible names, reduced-motion behavior, and non-color evidence distinctions.
- Verify loading, empty, partial failure, stale item, artwork failure, no-results, and offline-adapter states.
- Verify every media card/detail surface uses the correct canonical poster/cover, including audiobook cases where book, author, artist, series, album, and chapter artwork differ.
- Verify Dashboard People settings end to end: default shown state, exact-username default label, alias set/reset, hide/show, service-restart persistence, exclusion from every dashboard layout/aggregate, and no effect on ingestion, Discord, copy history, audit, or stored evidence.
- Re-run realistic performance budgets and record payload size, DOM size, and interactive timing for each layout.
- Verify CSV privacy/content, browser-history restoration, localStorage migration/fallback, and no private paths, tokens, Discord IDs, or authenticated URLs in public responses/markup.
- Run regression checks for Copy History, Audit, Settings, Discord prompt actions, PM2 single-process behavior, API/CLI contracts, and artwork proxy.
- Update durable dashboard QA documentation and mark the corrective series complete only after all gates pass.

## Out Of Scope

- New layouts, recommendations, reports, new external services, visual experimentation, or unrelated refactoring.
- Weakening tests or performance thresholds to obtain a pass.

## Likely Files Or Areas

- `tests/run-tests.mjs`
- `docs/testing/dashboard-redesign-qa.md`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `docs/blocks/block-3-2-richer-browser-ui.md`
- `docs/blocks/README.md`
- `docs/roadmap.md`

## Acceptance Criteria

- All earlier block acceptance criteria are traceable to an automated check or named manual Playwright step.
- No critical or serious accessibility issue remains in the documented walkthrough.
- No layout exceeds the agreed response, DOM, or interaction budget.
- All five layouts are usable at all three target viewports without horizontal page overflow.
- Public-read dashboard surfaces and CSV contain no secrets or private local data.
- No audiobook card or detail uses author/artist artwork when a canonical book cover exists, and no media card with an available canonical poster/cover shows a generic play icon.
- Hidden users and their activity are absent from every dashboard view and aggregate; aliases are consistent, presentation-only, and never alter stable identity or tool-facing records.
- Existing non-dashboard workflows and tool contracts pass unchanged.
- The final browser review demonstrates the redesign contract rather than merely resembling a mockup.

## Verification And Release Gate

- `npm run build`
- `npm test`
- `npm run verify:tools`
- `node --check src/web/static/dashboard.js`
- Complete and attach the documented Playwright matrix results.
- Restart the PM2 service and perform a live localhost smoke test.
- Do not move these blocks to `completed/` or resume Block 3-3 until every release criterion passes.

## Drift Guardrails

- This block closes gaps; it cannot absorb new features.
- Any failed gate must be fixed in the owning earlier block’s scope or explicitly reopen that block.
- Pixel-perfect mockup copying is not acceptance; correct hierarchy, evidence, responsiveness, and usefulness are.
