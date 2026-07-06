# Block 3-2m-5: People Ordering And Heatmap Interaction

> Status: Implemented on 2026-07-05.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (75/75 service tests, 24/24 Playwright tests, dashboard syntax, and tool contracts).
> Notes: Added browser-local Active/Other card ordering with pointer and keyboard controls, accessible heatmap evidence popovers and Timeline drill-through, the Together corner marker, and the matching response type and regression contracts. No known limitations.

## Goal

Let the household administrator arrange People cards without weakening the Active/Other identity model, and make daily activity and confirmed Together evidence understandable through deliberate pointer, touch, keyboard, and screen-reader interactions.

## Dependencies And Entry Gate

- Blocks 3-2m through 3-2m-4 are implemented and have passed their required verification gates.
- Preserve the existing People period, attribution, deduplication, privacy, and URL-restoration contracts.
- Block 3-2n must not begin until this corrective block is implemented and its exit gate passes.

## Scope

- Add `Default` and `Custom` card-order modes plus an explicit `Reset positions` action. Default temporarily shows the server-provided ordering without discarding saved custom positions; Reset clears those positions and returns to Default.
- Persist separate Active and Other order arrays in the existing browser-local dashboard preferences, keyed only by stable person IDs. Ignore missing IDs, append new IDs in default order, and safely reconcile identities that become hidden, removed, renamed, or move between groups.
- Preserve ordering preferences whenever People period or custom-date state changes; state updates must merge unrelated People fields instead of replacing them.
- Implement dependency-free Pointer Events dragging from a dedicated handle with a movement threshold, placeholder/lift feedback, touch support, and click suppression after a completed drag.
- Provide keyboard move-earlier/move-later controls and announce the resulting position through an `aria-live` region. Dragging and keyboard movement remain within the current Active or Other group.
- Replace native heatmap `title` hints with one shared, viewport-clamped popover showing date, total minutes, directly observed minutes, attributed Together minutes, play count, and confirmed Together session count.
- Give each heatmap one tab stop with arrow-key navigation between cells. Pointer hover previews the popover; keyboard focus or touch activation opens it.
- Include an explicit `Open day in Timeline` action that restores both the selected person and selected date. Extend the internal dashboard route shape with `timelineDate` and reuse the existing `timelineDate` URL parameter.
- Replace the small Together dot with a gold upper-right corner bracket. Use the identical marker in the legend and preserve a non-color accessible description.
- Correct the `DashboardPersonSummary` heatmap entry type to include observed minutes, attributed minutes, and confirmed Together sessions already returned at runtime, without changing the HTTP payload.

## Out Of Scope

- Server-synchronized or cross-browser ordering preferences, database/schema changes, or new preference endpoints.
- Dragging identities between Active and Other, changing membership/status semantics, or using aliases/usernames as ordering keys.
- New People reads or writes, attribution changes, Timeline redesign, or new per-day evidence payloads.
- Implementing Block 3-2n or absorbing its progress/hierarchy scope.

## Likely Files Or Areas

- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/design/dashboard-redesign-contract.md`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- Pointer, touch, and keyboard reordering work without accidental card or nested-control activation.
- Custom order survives rerender and reload. Default preserves saved custom positions, while Reset clears them and restores the server-provided order.
- Period and custom-date changes preserve ordering fields.
- Added, hidden, removed, renamed, or regrouped identities cannot corrupt saved ordering; new or regrouped visible identities append deterministically within their current group.
- Heatmap keyboard navigation uses one tab stop per heatmap rather than one per day and announces the focused cell's evidence.
- Hover, focus, and touch expose equivalent evidence, and the shared popover remains within 320px through 1440px viewports without horizontal overflow.
- The Timeline action restores the chosen person and date in browser-history/URL state.
- Duration intensity and confirmed Together evidence remain visually and semantically distinct, and Together is identifiable without relying on color alone.
- Existing attribution, deduplication, privacy filtering, period controls, responsive layout, and side-effect-free People reads do not regress.
- The TypeScript People response contract matches the existing runtime heatmap fields without changing response compatibility.

## Verification And Exit Gate

- `npm run verify:block`
- Extend `tests/e2e/dashboard-regression.spec.mjs` for pointer/touch-safe ordering, persistence and reconciliation, Default/Reset behavior, period-state preservation, keyboard movement and announcements, heatmap popovers, roving focus, Timeline drill-through, marker semantics, and 320px-1440px overflow invariants.
- After rebuilding or restarting the deployed dashboard, run `npm run verify:live-dashboard` as the separate read-only live smoke gate.

## Drift Guardrails

- Card ordering is browser-local presentation state only; person IDs remain authoritative.
- Active and Other remain separate semantic groups with the current server order as the default.
- Heatmap fill represents duration only; the gold corner bracket represents confirmed Together evidence only.
- Popovers consume existing People response data and must not create playback observations, watch events, prompts, adjudications, or any other state.
- Do not mark this block implemented or begin Block 3-2n until the mandatory block gate passes.
