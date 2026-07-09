# Block 3-2n-5: Audiobook Progress Source Honesty

> Status: Planned.
> Result: Not implemented.
> Notes: Fifth child of the 3-2n Progress sequence; corrects the current unsafe assumption that Plex audiobook track rows are verified chapters.

## Goal

Make audiobook Progress honest before adding richer chapter support. Current local data can prove canonical book identity, Plex/Tautulli playback evidence, linked catalog rows, partial plays, repeats, duration, and book-level progress. It cannot yet prove true audiobook chapter boundaries for every book. This block must expose source quality explicitly, stop labeling unverified track/file rows as chapters, and trigger lightweight audiobook metadata caching when audiobook watches are ingested.

## Dependencies And Entry Gate

- Blocks 3-2n-1 through 3-2n-4 are implemented and verified.
- Existing audiobook catalog tables, content catalog links, playback observations, and hierarchy expansion endpoints are available.
- `docs/blocks/completed/block-3-1-audiobook-differentiation.md` is treated as a drift warning: Plex tracks do not map 1:1 to chapters.
- Block 3-2n-5a must not start until this block passes its exit gate.

## Scope

- Add typed audiobook Progress source fields such as `progressUnit`, `progressUnitLabel`, `progressSource`, and `progressSourceVerified` to summary and expansion contracts.
- Establish a durable vocabulary contract: `progressUnit` ("episode", "movie", "track", "chapter", "book") and `progressSource` ("plex", "audiobook_tool", "unknown").
- Treat current `audiobook_books.chapter_count` as an observed track count. Explicitly set `totalKnown = false` for unverified audiobooks so progress bars do not show false percentages.
- Rename browser-facing audiobook copy away from "chapters" for unverified Plex track/file data.
- Preserve partial, completed, repeated, observed-duration, canonical book identity, series context, and artwork behavior.
- Trigger lightweight `MetadataService` caching/linking for audiobook playback observations during ingestion, matching the existing movie/episode enrichment pattern without running heavy chapter discovery.
- Extend deterministic service and dashboard tests so current audiobook Progress cannot regress back to false chapter claims.

## Out Of Scope

- Running `ffprobe`, Audnexus, silence detection, Whisper, Prologue automation, media repair, or sidecar chapter imports.
- Creating chapter boundary tables or mapping playback offsets to chapters.
- Treating Plex track rows, file parts, or `audiobook_books.chapter_count` as verified chapters.
- Replacing the lazy expansion model, adding multi-card expansion, or rendering all audiobook evidence on first paint.
- Visual dot-map polish; Block 3-2n-6 owns the final readable evidence-map treatment after source honesty is in place.

## Risk And Mitigation Plan

- Risk: false precision from old `chapter_count` semantics.
- Mitigation: rename exposed copy and add explicit source-quality fields before later UI polish consumes the data.
- Risk: audiobook metadata remains stale because ingestion does not cache audiobook rows.
- Mitigation: add lightweight metadata caching for audiobook observations only; leave heavy chapter probing to explicit later blocks.
- Risk: dashboard copy becomes vague.
- Mitigation: use precise labels such as `tracks/files`, `book progress`, or `unknown`, and reserve `chapters` for future verified chapter sources.
- Risk: future blocks forget why this correction exists.
- Mitigation: update durable dashboard/data/testing docs with the source-honesty contract.

## Drift Controls

- Do not hide poor audiobook metadata behind polished chapter language.
- Do not convert unknown or unverified totals into percentages.
- Do not expose private file paths, adapter secrets, API keys, or local-only details in dashboard/tool responses.
- Do not add write actions, Plex mutations, recommendations, ratings, or collection editing.
- Do not weaken existing TV, Classic TV, Anime, Movie, People, Timeline, or tool-contract coverage.

## Dependency Plan

- Start from `src/service/dashboardService.ts` audiobook Progress grouping and expansion behavior.
- Check `src/types/api.ts` before browser changes so source-quality names and nullability are explicit.
- Update `src/service/ingestionService.ts` to cache audiobook metadata through the existing `MetadataService` seam.
- Extend `tests/run-tests.mjs` before or alongside browser tests to lock service-level source semantics.
- Use `tests/e2e/fixture-server.mjs` only for deterministic UI cases needed by this block and later polish.

## Opportunities To Use

- Reuse canonical `audiobook_books.id`, title, artwork, hierarchy fields, linked `content_catalog` rows, and playback observations.
- Reuse the lazy `/api/dashboard/progress/expand/:groupKey` endpoint while making its unit/source semantics honest.
- Produce a contract that lets 3-2n-5a import true chapters later without another browser vocabulary reset.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/service/ingestionService.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `tests/run-tests.mjs`
- `tests/e2e/fixture-server.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/data/README.md`
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Audiobook Progress responses include explicit unit/source fields for summary cards and expansion responses.
- Existing Plex catalog rows are displayed as tracks/files or book-level evidence, not as verified chapters.
- Audiobook `totalKnown` is `false` when the only source of total count is observed catalog rows. Progress bars do not show percentages for audiobooks with `totalKnown = false`.
- Browser-facing Progress copy never says `chapters` for unverified Plex track/file evidence.
- Audiobook metadata caching is triggered for newly ingested audiobook observations without invoking heavy chapter discovery.
- Partial, completed, repeated, observed-duration, canonical book identity, and artwork behavior remain intact.
- Deterministic tests cover multi-track audiobook evidence, single-file/book-level progress evidence, unknown source evidence, partials, repeats, and missing-catalog cases.
- Existing TV, Classic TV, Anime, Movie, People, Timeline, and tool-contract tests continue to pass.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
