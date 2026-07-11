# Block 3-2n-6b: Overview Session Feed De-duplication

> Status: Planned.
> Result: Not implemented.
> Notes: Corrective follow-up to Blocks 3-2n-6 and 3-2n-6a; restores session-based Overview cards without weakening co-watch evidence semantics.

## Goal

Make each Overview card represent one viewing session, so pause/resume telemetry and confirmed co-watch evidence for the same viewing session do not crowd the feed or duplicate participant copy.

## Scope

- Define an Overview read-model session as one canonical item within the existing two-hour inactivity boundary, preferring a stable event/session identifier when present.
- Merge direct playback, confirmed/attributed co-watch evidence, and pause/resume updates into the same session card; select the strongest relationship label.
- Display the session start/end range and one visible participant expression through the poster badge.
- Apply one shared session-grouping contract in the server response and browser fallback.
- Extend deterministic fixtures, service assertions, browser regressions, and durable dashboard contracts.

## Drift Controls

- Never merge different canonical items.
- Never merge a later replay after a completed session.
- Keep raw observations append-only and unchanged; grouping is read-model only.
- Preserve explicit confirmed evidence over inferred/ordinary playback when choosing the session relationship.
- Do not change the shared two-hour session boundary without a separate ticket and contract update.

## Out Of Scope

- Changes to playback ingestion, Tautulli/Plex persistence, Discord prompts, or the Timeline session model.
- Broader Overview redesign or changes outside recent playback cards.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/web/static/dashboard.js`
- `tests/run-tests.mjs`
- `tests/e2e/fixture-server.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- A pause/resume sequence for the same item within two hours produces one Overview card with a session time range.
- Direct playback and confirmed co-watch evidence for that session produce one card with all participants and `Together` preferred over weaker relationship labels.
- A different item, a gap of two hours or more, or a later replay after completion produces a separate card.
- The card has no duplicated visible participant text; accessible participant naming remains intact.
- Desktop and narrow Overview journeys have no page errors or horizontal overflow.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
