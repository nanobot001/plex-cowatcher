# Block 2-3: Watch History Query API

> Status: Implemented on 2026-06-27.
> Result: Implemented.
> Verification: `npm test` - passed.
> Notes: Implemented QueryService supporting advanced filtering, ordering, pagination, and localDay timezone handling, exposed via GET /api/watch-history and watch-history CLI command.

## Goal

Let scripts ask who watched what, when, and how much using combinable filters and stable structured results with clear provenance.

## Scope

- Add one query service shared by structured JSON CLI and HTTP surfaces.
- Support combinable person, exact content/show, media type, genre, household-local day, date/time range, completion state, and limit filters.
- Return progress, best-known intervals, stable identities, and evidence/provenance fields.
- Define household timezone handling while storing unambiguous timestamps.
- Add deterministic ordering, bounded pagination, safe empty results, and structured validation errors.
- Keep the read surface secret-safe.

## Out Of Scope

- Aggregated summaries, natural-language parsing, sessions, co-watching inference, and browser search UI.

## Likely Files Or Areas

- `src/service/`
- `src/server/routes.ts`
- `src/cli/cli.ts`
- `src/types/`
- `tests/`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`
- `docs/permissions.md`

## Acceptance Criteria

- CLI and HTTP use the same service and validation.
- Filters combine, including one person plus one exact show plus one local day.
- Stable IDs identify content; titles are only search/display fields.
- Results label observed playback, human confirmation, Plex-synchronized state, and inference where present.
- Ordering and pagination are deterministic; errors and empty results are structured.
- Tests cover every filter and representative combinations.

## Verification

- `npm run build`
- `npm test`
- `node dist/cli/cli.js watch-history --user <configured-user> --days 7 --pretty`
- Manual: query `GET /api/watch-history` with user, show, and date filters.