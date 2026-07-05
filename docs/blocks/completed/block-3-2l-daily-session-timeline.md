# Block 3-2l: Daily Session Timeline

> Status: Implemented on 2026-07-05.
> Result: Implemented.
> Verification: `npm run verify:block` - passed.
> Notes: Bounded daily timeline workspace with lane aggregation, date picker navigation, co-watching moments, and paginated history feed.

## Goal

Make Timeline useful for understanding one day of household consumption, overlaps, and co-watch evidence without rendering months of tiny unlabeled fragments.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2k complete, including the 3-2j-1 co-watch evidence correction.
- Session/detail contracts are stable; do not change inference thresholds in this block.

## Scope

- Default to Today when activity exists, otherwise the most recent active household day.
- Add previous/next day navigation, date picker, Today action, and an optional bounded seven-day mode.
- Render one lane per active person and merge observations according to existing reconstructed-session rules.
- Apply dashboard visibility before lane/session aggregation and label lanes with the shared alias resolver, falling back to exact Plex usernames.
- Label blocks when space permits and provide accessible title, time, progress, category, and evidence details for every block.
- Distinguish completed, partial, paused/fragmented, inferred overlap, and explicit confirmation without implying unsupported live playback.
- Use `Together` only for human-confirmed exact-item events and `Likely together` only for 3-2j-1 qualifying inference; ordinary overlapping lanes remain observed activity unless the shared service establishes a relationship.
- Add co-watch moments beneath the lanes using actual people, title, duration, and provenance.
- Open the shared 3-2k detail workspace from a session block.
- Move the chronological Activity Feed below the chart and paginate it independently.

## Out Of Scope

- Live presence, live playback control, new session reconstruction, new overlap thresholds, or multi-month visualization.
- Rendering inactive household members as empty lanes by default.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/service/sessionService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Initial Timeline renders at most one day and never requests or mounts 500 activity rows.
- Repeated observations belonging to one session do not appear as dozens of adjacent unlabeled blocks.
- Day navigation, filters, detail selection, and Activity Feed pagination are independent and URL restorable.
- Co-watch moments identify people and distinguish confirmed from inferred evidence.
- Empty days offer previous/next active-day navigation.
- Timeline remains usable at desktop and narrow widths without horizontal page overflow.
- Hidden users have no lane, blocks, co-watch marker, filter option, or aggregate contribution; aliases are consistent in lanes, details, and co-watch moments.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Playwright walkthrough for active, empty, overlapping, fragmented, and audiobook-heavy days.
- Browser responsiveness check using the realistic 3-2g fixture.
- Verify no full-history response is issued during initial load.

## Drift Guardrails

- Timeline answers “what happened during this day/week”; historical browsing belongs in the paginated feed.
- Do not infer live status from historical playback evidence.
