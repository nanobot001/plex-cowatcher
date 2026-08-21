# Block 3-2o: Dashboard Accessibility And Regression Release Gate

> Status: Planned.
> Result: Not implemented.
> Notes: This is a release audit and acceptance gate, not a container for unrelated dashboard redesign. Block 3-2n-6F-A is its final planned feature dependency; optional 6D resume-context work is excluded.

## Goal

Prove that the current dashboard is accessible, responsive, source-honest, privacy-safe, and regression-protected across every supported layout before the corrective dashboard sequence is closed.

## Entry Gate

- Block 3-2n-6F-A is implemented and verified.
- The current deterministic dashboard fixture and `docs/testing/dashboard-regression-contract.md` remain authoritative.
- Any material defect discovered during the audit is recorded as a separate bounded corrective block and resolved before final signoff; it is not silently absorbed here.

## Scope

- Audit Overview, Activity Timeline, Media Explorer, People, and Progress plus the shared detail workspace and Copy History, Audit, and Settings surfaces.
- Verify semantic labels, keyboard reachability, focus order/restoration, disclosure state, dialog behavior, reduced-motion compatibility, and non-color-only status meaning.
- Verify geometry at 320px, 390px, 768px, 1024px, and 1440px: no page-level horizontal overflow, clipped controls, unintended nested scrolling, cramped padding, or excessive empty space.
- Use semantic and geometry assertions in `tests/e2e/dashboard-regression.spec.mjs`. Preserve the contract prohibition on broad screenshot snapshots.
- Confirm source-honest unknown, approximate, verified, completed, multi-user, hidden-user, and error states across representative category fixtures.
- Confirm private data, paths, tokens, upstream URLs, raw errors, and hidden-listener content do not cross public dashboard boundaries.
- Run the deterministic block gate and the separate deployed read-only live dashboard smoke.

## Out Of Scope

- New product features, visual redesign, ingestion, schema, persistence, worker, or integration changes.
- Optional 6D audiobook transcript/resume context.
- Broad screenshot baselines or pixel-perfect layout freezing.
- Fixing a material defect inside this audit when it warrants its own ticket.

## Likely Files Or Areas

- `tests/e2e/dashboard-regression.spec.mjs`
- deterministic dashboard fixture builder/database
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `docs/testing/dashboard-regression-contract.md`
- one or more new corrective block files only if the audit finds material defects

## Acceptance Criteria

- All named surfaces pass semantic keyboard and geometry checks at the five required viewport widths.
- The test suite asserts durable behavior and geometry without adding broad screenshots.
- Dialogs preserve focus trapping, close restoration, URL/Back/Forward behavior, one intended scroll region, and no horizontal overflow.
- Source-quality and privacy states remain explicit and do not fabricate certainty from missing evidence.
- Any material failure has a separate reviewed corrective ticket and is resolved before this block is marked implemented.
- `npm run verify:block` passes.
- After the deployed dashboard is rebuilt or restarted, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard`
- Manual keyboard and screen-reader-oriented review of representative desktop and narrow layouts
- Review against `docs/testing/dashboard-regression-contract.md`
