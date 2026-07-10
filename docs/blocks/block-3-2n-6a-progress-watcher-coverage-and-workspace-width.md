# Block 3-2n-6a: Progress Watcher Coverage And Workspace Width

> Status: Implemented on 2026-07-09.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (79/79 service tests, 30/30 deterministic Playwright journeys, dashboard syntax, and tool contracts).
> Notes: Progress rows now expose completion coverage and on-demand watcher evidence while Recently Completed uses the full-width workspace below the primary sections.

## Goal

Make expanded Progress rows immediately understandable under All users: show how many visible people have completed an item, provide compact access to who and when, and retain source-honest partial and unknown evidence without crowding the workspace.

## Scope

- Add per-person watcher evidence with state, latest observed/completed timestamp, rewatch count, source, and partial position to the read-only Progress expansion contract.
- Render up to four completed-watcher dots, then a `+N` control, alongside a visible completion count and compact secondary partial/source-uncertain summary.
- Provide one keyboard- and touch-accessible shared roster popover for watcher details.
- Move Recently Completed below Continue Watching and Recently Active as a visible full-width section.
- Extend deterministic service and dashboard regression coverage and update durable design/testing contracts.

## Out Of Scope

- New episode-level detail routes or modals.
- Data migrations, dependency changes, Plex mutations, or non-Progress dashboard redesign.
- Treating missing playback evidence as an unwatched fact.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/e2e/fixture-server.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Expanded episode, verified chapter, and track rows show an unambiguous completed count over the visible household total; watched and repeated viewers count as completed while unknown evidence remains explicitly unknown.
- At most four completed-watcher dots appear inline. Individual dots disclose the visible person and latest recorded completion; `+N` and the summary disclose the complete evidence roster without expanding/collapsing the card.
- Partial and source-uncertain evidence is compact, source-qualified, and does not masquerade as completion.
- Recently Completed appears as a visible full-width section below the two primary Progress sections.
- Desktop and narrow journeys keep lazy single-card expansion, cache/URL behavior, keyboard access, no page errors, and no horizontal overflow.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
