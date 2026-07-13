# Block 3-2n-6C: Visible Progress And Enriched Detail

> Status: Implemented on 2026-07-12.
> Result: Implemented.
> Verification: `npm run verify:block` - passed with 103 service tests, 36 dashboard regression tests, static dashboard validation, and tool-contract verification. Live Warbreaker DOM/geometry inspection and `npm run verify:live-dashboard` also passed.
> Notes: Known totals now show explicit completed/total/percentage summaries, unknown totals remain honest, and the Progress-only modal is a viewport-bounded 1180px desktop workspace with real source, play, observed-time, activity, and participant context.
> Correction 2026-07-12: Verified audiobook summaries now report the latest chapter position and source percentage separately from historical chapter completion evidence; percentage fallback uses the verified book duration.

## Goal

Make Progress understandable without decoding dots or opening several pages, and make the Progress detail modal large enough to serve as an enriched hierarchy workspace on desktop while remaining usable at narrow widths.

## Failure Evidence And Dependencies

- Corrective Block 3-2n-5d-2A is implemented and verified.
- The disabled Warbreaker canary succeeded with 62 verified embedded chapters and 8 completed chapters, but its first-page card still renders generic distinct/play counts rather than `8 of 62 chapters` and a percentage.
- `#progress-dialog` inherits a fixed 680px desktop width from the shared dialog rule. A later `max-width: 920px` declaration does not override that fixed width.
- Existing dashboard tests verify source labels and lazy chapter rows, but not a visible numeric summary or a materially larger Progress modal.

## Scope

- Add explicit Progress summary copy for known totals: completed count, total count, unit, and percentage.
- For unknown audiobook totals, retain source-honest copy and label observed evidence without inventing a percentage.
- Keep compact evidence dots, but make them supplementary rather than the only glanceable progress signal.
- Add an enriched modal overview containing progress summary, source, plays, observed time, latest activity, and visible participants using existing response fields.
- Give only the Progress modal a substantially larger desktop width, content-first height capped by the viewport, fixed poster/reference column, and one intended scrolling content region.
- Preserve fullscreen tablet/narrow behavior, focus trapping, close restoration, URL state, lazy expansion, caching, and the separate media-detail dialog.
- Add semantic and dimension-based desktop/narrow regression coverage, including a verified audiobook card and modal.

## Out Of Scope

- Changing chapter proof, playback mapping, queue scheduling, or worker enablement.
- Changing the shared media-detail modal size or redesigning non-Progress dashboard layouts.
- Adding new API fields, dependencies, migrations, public mutations, or media writes.
- Treating unverified track/file evidence as chapter truth.

## Likely Files Or Areas

- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- A verified audiobook card exposes an immediately readable summary such as `1 of 3 chapters · 33%` through visible text and a stable selector.
- The live Warbreaker card exposes `8 of 62 chapters · 13%` after deployment.
- Unknown-total audiobook cards do not display a fabricated percentage.
- The Progress modal repeats the summary and shows source, plays, observed time, latest activity, and participants before the hierarchy.
- At a 1440px desktop viewport, the Progress modal is materially wider than the former 680px dialog and remains within the viewport.
- At narrow widths, the modal remains fullscreen with no horizontal overflow and only intended vertical scrolling.
- Existing Progress lazy loading, route restoration, Back/Forward, keyboard interaction, and non-audiobook behavior remain compatible.
- `npm run verify:block` and the deployed `npm run verify:live-dashboard` gate pass.

## Verification

- `npm run verify:block`
- Desktop and narrow semantic/dimension assertions in `tests/e2e/dashboard-regression.spec.mjs`
- Live readback of Warbreaker's first-page card after rebuild/restart
- `npm run verify:live-dashboard`
