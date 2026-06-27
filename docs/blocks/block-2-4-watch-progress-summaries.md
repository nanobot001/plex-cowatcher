# Block 2-4: Watch Progress Summaries

Status: Implemented on 2026-06-27.
> Result: Implemented.
> Verification: `npm test` - passed.
> Notes: Implemented SummaryService to group playback time, distinct/completed episode counts, and show progress percentages, exposed via GET /api/watch-summary and watch-summary CLI command. on the Phase 2 query foundation.

## Goal

Answer what a person watched on a day, how much time they watched, and how far they progressed through a show.

## Scope

- Add read models grouped by show, person, and household-local day.
- Report distinct, completed, and partial episodes; total calculable playback time; latest watch; and latest season/episode.
- Report show progress against a known available-episode count with denominator freshness.
- Keep repeat plays queryable without inflating distinct-episode progress.
- Expose matching CLI and HTTP JSON surfaces backed by shared service logic.

## Out Of Scope

- Recommendations, claiming completion with unknown totals, sessions, inference, dashboards, and scheduled reports.

## Likely Files Or Areas

- `src/service/`
- `src/server/routes.ts`
- `src/cli/cli.ts`
- `src/types/`
- `tests/`
- `docs/tool-surface.md`
- `docs/data/`

## Acceptance Criteria

- Summaries filter by person, exact show, local day, and date range.
- Plays are distinct from unique episodes; completed viewing is distinct from partial viewing.
- Progress percentages appear only with a known denominator.
- Time totals report data completeness and do not silently estimate unknown durations.
- Repeat and partial-to-complete aggregation rules are tested and documented.
- CLI and HTTP share stable fields and service logic.

## Verification

- `npm run build`
- `npm test`
- `node dist/cli/cli.js watch-summary --user <configured-user> --days 7 --pretty`
- Manual: verify one show containing repeat, partial, and completed plays.