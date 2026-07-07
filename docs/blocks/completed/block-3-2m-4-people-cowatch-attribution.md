# Block 3-2m-4: People Co-Watch Attribution And Window Controls

> Status: Implemented on 2026-07-05.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (75/75 service tests, 22/22 Playwright tests, syntax, and tool contracts); `npm run verify:live-dashboard` - passed after PM2 restart.
> Notes: People now combines direct and confirmed attributed activity without duplication, exposes evidence breakdowns and accessible heatmap semantics, and supports restorable 7/30/90-day, all-time, and custom periods.

## Goal

Make People totals reflect both directly observed playback and confirmed co-watching while preserving evidence provenance, preventing double counting, and giving the operator clear control over the reporting period.

## Dependencies And Entry Gate

- Blocks 3-2m through 3-2m-3 are implemented and have passed their required verification gates.
- Existing dashboard membership, alias, pairing, adjudication, and Discord-review semantics remain authoritative.
- Block 3-2n must not begin until this corrective block is implemented and its exit gate passes.

## Scope

- Add People-scoped `7 days`, `30 days`, `90 days`, `All time`, and `Custom` period controls, with trailing 30 days remaining the default.
- Apply the effective People period consistently to profiles, pairings, and co-watch reviews; keep Operations explicitly labeled as current unresolved state rather than period-filtered history.
- Count confirmed co-watch participation in a person's aggregate plays, duration, completion, active days, category mix, recent titles, and heatmap without relabeling attributed evidence as directly observed.
- Treat successful normal co-watch confirmations and current positive browser/Discord adjudications as confirmed shared evidence. Exclude inference alone, No, Not sure, Clear, cancelled/stale review state, failed confirmation, and hidden participants.
- When a confirmed participant has no matching playback observation, derive one attributed contribution from the source playback's title, evidence time, normalized duration, and completion state. Preserve unknown duration when the source duration is unavailable.
- Deduplicate by stable event/observation evidence so a participant's matching direct playback takes precedence and the same watch never contributes twice to totals or recent activity.
- Preserve additive provenance breakdowns for directly observed activity, activity added from confirmed co-watching, confirmed shared-session count, and unknown attributed duration.
- Replace unexplained heatmap colors with a visible teal duration-intensity legend and a distinct gold Together marker. Cell labels/tooltips must expose total, observed, and attributed minutes plus confirmed shared sessions.
- Keep all-time totals accurate through database aggregation rather than the bounded activity sample. Bound the all-time daily heatmap to the latest 365 days and label its displayed range separately from the all-time totals.
- Preserve aliases, dashboard membership, privacy filtering, panel-level failure isolation, URL-restorable state, and existing 320px-1440px responsive behavior.

## Public Interface Contract

- Extend `GET /api/dashboard/people` compatibly with `period=7d|30d|90d|all|custom`; custom periods require valid `dateFrom` and `dateTo`, and existing date-only requests remain supported.
- Preserve current person aggregate fields, but define them as deduplicated inclusive totals after attributed confirmed activity is added.
- Add per-person observed and attributed-together breakdowns, confirmed-together session count, and unknown attributed-duration count.
- Add observed minutes, attributed minutes, and confirmed shared-session counts to each heatmap day.
- Mark recent contributions as directly observed or attributed confirmed-together without exposing internal IDs or raw adapter payloads.
- Extend effective-window metadata with the selected preset and displayed heatmap bounds.
- Make the pairings and co-watch review reads accept the same period contract when requested by the People workspace.

## Out Of Scope

- Counting `Likely together` inference as personal activity without a positive human decision.
- Creating playback observations, watch events, Plex watched-state mutations, Discord prompts, or adjudication rows while reading People data.
- Rewriting stored watch history, merging user identities, changing dashboard membership, or changing existing normal prompt/Plex-sync semantics.
- Household reports, social features, per-user goals, or Block 3-2n hierarchy/progress work.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/design/dashboard-redesign-contract.md`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- A confirmed source playback with no participant observation adds exactly one attributed contribution to that participant's inclusive totals and evidence breakdown.
- A matching participant observation takes precedence; direct and confirmed evidence remain visible, but the play, duration, completion, recent item, and heatmap activity are counted once.
- Source duration is credited only as labeled attributed time; missing source duration remains unknown and never becomes invented watch time.
- Inferred, rejected, uncertain, cleared, failed, stale, and hidden-user evidence cannot increase a person's totals.
- Positive browser and Discord decisions use the same confirmed-shared semantics as successful normal confirmations without invoking Plex mutation.
- Period presets and valid custom dates are URL-restorable and align profiles, pairings, and reviews. Invalid or reversed custom dates return a structured validation error.
- All-time totals are complete even when activity exceeds the summary sample limit; the separately labeled heatmap remains bounded to the latest 365 days.
- The heatmap has a visible intensity legend, an accessible Together marker, and descriptive cell labels that do not rely on color alone.
- Existing response fields, hidden-user filtering, aliases, independent panel failure behavior, and mobile/desktop layouts do not regress.

## Verification And Exit Gate

- `npm run verify:block`
- Service tests for direct-only, attributed-only, matching-direct deduplication, multi-participant events, unknown duration, evidence exclusions, hidden users, adjudication reversal, period boundaries, all-time aggregation beyond the sample limit, and structured custom-date validation.
- Playwright coverage for presets, custom dates, URL restoration, breakdown labels, heatmap legend/marker/tooltips, panel isolation, and 320px-1440px overflow/accessibility invariants.
- After rebuilding or restarting the deployed dashboard, run `npm run verify:live-dashboard` as the separate read-only smoke gate.

## Drift Guardrails

- Reading or rendering People data must remain side-effect free.
- Attributed confirmed activity is evidence-backed participation, not a fabricated direct playback observation.
- Inclusive totals equal direct observations plus only the deduplicated contributions absent from direct history.
- Heatmap intensity represents duration; the Together marker represents evidence type.
- Do not mark this block implemented or begin Block 3-2n until the mandatory block gate passes.
