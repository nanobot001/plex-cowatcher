# Block 3-2n-6J-B: Browser Progress Presentation And Regression

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-2n-6J-A must provide the stable additive service/API projection contract.
> Notes: Final child of 3-2n-6J. This block owns browser adoption, responsive presentation, accessibility, and cross-surface regression; it must not recreate progress calculations in JavaScript.

## Goal

Present the canonical audiobook progress contract consistently and elegantly across every browser surface, including rewinds, current versus furthest position, session-specific movement, chapter states, approximation, and uncertainty.

The result should be concise at card scale, informative in detail, and identical in meaning across Overview, Progress, shared detail, Media Explorer, Continue Consuming, Timeline, and People drill-through.

## Scope

- Consume only the 6J-A canonical fields for visible audiobook progress. Browser code may format values but must not calculate audiobook offset, chapter state, rewind direction, or quality from raw observation fields.
- Update Overview audiobook digest sessions to show concise session-specific movement, such as chapter-local start/end or `Revisiting`, without repeating the book's latest position on every row.
- Update Progress cards to show current position as primary and furthest reached as a subtle secondary marker/label when different.
- Update Progress hierarchy and watcher lanes to display the canonical chapter states without turning every historical touched chapter into `partial`.
- Update the shared audiobook detail summary/hierarchy so it matches Progress exactly for the selected listener.
- Update Media Explorer and Continue Consuming:
  - primary bar/text represents current position;
  - furthest position appears only when useful and does not visually overwhelm the card;
  - progress sort behavior is reflected honestly in accessible copy when current and furthest differ.
- Update Timeline activity rings/tooltips to show historical as-of progress rather than today's latest book position. Preserve Gantt width as session time.
- Update People recent-title/drill-through and any visible completion wording so playback observations, passed chapters, and completed books are not conflated.
- Present quality succinctly:
  - exact/verified values need no alarming treatment;
  - approximate or stale values are visibly qualified;
  - unavailable values remain unknown rather than zero;
  - rewinds are labeled `Revisiting` where supported.
- Keep per-user context visible and never merge household audiobook progress.
- Maintain balanced spacing, compact digest/card height, text truncation, one intended scroll owner, and no horizontal overflow from 320px through 1440px.
- Add semantic `data-testid`, ARIA, and visible-state contracts without pixel-perfect snapshots.
- Extend `docs/testing/dashboard-regression-contract.md` only when the implemented project-wide invariant exists.
- Run the separate live smoke gate after restarting only the affected dashboard service.

## Out Of Scope

- Service/API projection calculations or contract redesign; defects in 6J-A fields must be corrected in 6J-A scope or explicitly re-scoped.
- Position capture, notifier configuration, activity sampling, raw-observation repair, or schema work.
- New audiobook metadata/title correction.
- Plex progress/watched-state writes, Copy History changes, or Audit behavior.
- Transcript/resume-context work, recommendations, goals, ratings, or a general dashboard redesign.
- Movie, TV, Anime, or Classic TV presentation changes except compatibility assertions.

## Likely Files Or Areas

- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/fixture-server.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/e2e/live-dashboard-smoke.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `src/types/api.ts` only for browser-facing type corrections already consistent with 6J-A
- `src/service/dashboardService.ts` only for a proven 6J-A contract defect, not presentation convenience

## Acceptance Criteria

- No browser progress bar, chapter completion claim, progress label, or progress sort presentation derives audiobook meaning from raw `percentComplete`, `viewOffset`, or `duration`.
- Overview sessions display their own movement; multiple sessions do not repeat one inherited latest chapter/percentage unless evidence genuinely supports it.
- After a trusted rewind:
  - Continue Consuming and primary progress bars show the lower current position;
  - Progress and detail show the higher furthest position separately;
  - the active chapter is labeled `Revisiting`;
  - earlier passed chapters remain represented without duplicate completion;
  - Timeline retains each session's historical as-of position.
- Progress and shared detail visibly agree on current position, furthest position, chapter states, quality, reason wording, and selected listener.
- Explorer cards remain compact and readable when current and furthest differ; the furthest marker is accessible and does not imply the resume position.
- Approximate/stale values are qualified; unavailable values render as unknown with no fabricated bar.
- People and Overview visible wording does not equate completed playback observations or passed chapters with completed books.
- Raw CSV and write surfaces remain visually and behaviorally outside this presentation migration.
- Positive exact-position, rewind, stale/reset, approximate historical, missing-position, multi-user, and multi-file browser journeys pass.
- A structurally different Movie/TV journey proves non-audiobook rendering did not regress.
- Required desktop and narrow viewports have no page-level horizontal overflow, duplicate metadata, excessive card height, or competing scroll owners.
- `docs/testing/dashboard-regression-contract.md` records the implemented project-wide audiobook invariant.

## Scope Guard And Escalation Conditions

- Stop if browser code needs to infer missing canonical fields; return the contract defect to 6J-A rather than adding UI heuristics.
- Keep styling changes audiobook-progress-specific and reuse existing dashboard primitives.
- Do not introduce a new frontend framework, state store, chart library, or broad card redesign.
- If the browser migration exceeds the planned surfaces because a new consumer is discovered, record it in the consumer inventory and re-scope before silently expanding.

## Verification

- `npm run verify:block`
- Dashboard regression journeys for Overview, Progress, shared detail, Explorer/Continue, Timeline, and People drill-through at desktop and narrow widths
- Static or contract assertion that browser audiobook progress rendering does not consume raw position fields outside an explicitly labeled raw-evidence context
- Accessibility assertions for current/furthest/revisit labels and progress meters
- Restart only `plex-cowatch-service`, then run `npm run verify:live-dashboard`
