# Block 3-2g: Dashboard Contract And Performance Baseline

> Status: Planned.
> Result: Not implemented.
> Notes: First corrective block after 3-2f. It freezes the dashboard product vocabulary and removes the query/rendering behavior that currently prevents later visual work from being validated reliably.

## Goal

Establish a measured, bounded foundation for the redesign so every later dashboard block builds against the same category, identity, filter, selection, and performance contracts.

## Dependencies And Entry Gate

- Depends on completed Blocks 3-2a through 3-2f and the current Phase 2 read services.
- Before editing, reproduce and record current Overview, Timeline, Library, People, and Progress behavior with Playwright at desktop and narrow widths.
- Do not begin 3-2h until every exit criterion below passes.

## Scope

- Create a durable dashboard design/data contract covering the five supported categories, exclusion of `other` from household-facing views, media identity levels, filter semantics, selected-item context, evidence labels, and unknown-data treatment.
- Define one canonical artwork contract: media cards resolve artwork from the displayed top-level identity; movies use movie posters, episodic cards use show posters, and audiobook cards use the canonical book cover rather than author, artist, album, series, or chapter artwork. Define the category fallback used only when that poster/cover is unavailable.
- Define dashboard presentation preferences for each configured user: `shown` defaults to true for enabled users and `alias` defaults/falls back to the exact Plex username. Hidden users are excluded from all dashboard results and aggregates but remain untouched in ingestion, history, Discord, copy, audit, and adapter domains.
- Define aliases as presentation-only values keyed by stable internal user identity, never as replacements for usernames or external IDs.
- Inventory every dashboard endpoint and document its consumer, default window, maximum page size, ordering, and expected response shape.
- Bound Timeline to one day by default and one week maximum per request; separate chart sessions from paginated activity-feed rows.
- Replace Progress all-history loading with bounded summary results and lazy hierarchy/detail retrieval.
- Ensure Overview, Library, and People queries do not load unbounded playback observations to compute first paint.
- Add timing instrumentation usable in tests without exposing private paths, tokens, or raw adapter responses.
- Add realistic fixtures large enough to expose the current 6,000-plus-observation failure mode.

## Out Of Scope

- Visual redesign, new navigation, new charts, recommendations, watchlists, ratings, or Plex mutations.
- Changing session inference or co-watch confidence rules.

## Likely Files Or Areas

- `docs/design/dashboard-redesign-contract.md`
- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`
- `docs/testing/dashboard-redesign-qa.md`

## Acceptance Criteria

- A single durable contract defines supported categories, units of display, filter behavior, route bounds, selection state, evidence vocabulary, and exclusions.
- The contract includes an explicit artwork-resolution table for movie, episodic, and audiobook identities and prohibits author/artist artwork on audiobook cards.
- Dashboard API fixtures prove default username labels, custom aliases, hidden-user exclusion, and preservation of underlying user/history records.
- No household-facing dashboard summary or collection contains category `other`.
- Timeline responses cannot return more than the documented day/week and item limits.
- Progress first paint does not calculate or serialize every title hierarchy.
- Tests use a realistic large fixture and prove deterministic ordering and pagination.
- Measured local API targets are documented: summary endpoints <= 750 ms and bounded detail endpoints <= 1,500 ms on the fixture machine, with thresholds reported rather than silently ignored.
- Existing CSV, copy-history, audit, settings, Discord, and tool contracts remain unchanged.

## Verification And Exit Gate

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Run the documented dashboard performance check against realistic fixtures.
- Playwright: each layout reaches an interactive non-loading state within two seconds locally.
- Record baseline and post-block timings in the block result before marking complete.

## Drift Guardrails

- Later blocks may extend this contract only by explicitly updating it and their own acceptance criteria.
- Do not add fields “for future use”; every new response field must have a named current consumer and test.
- Unknown data remains unknown and must never be converted into a recommendation, rating, completion, or inferred watched-state mutation.
- Artwork resolution must follow canonical media identity rather than whichever observation or metadata image is easiest to retrieve.
- User aliases and visibility must be applied through the shared dashboard read model, not independently in each renderer.
