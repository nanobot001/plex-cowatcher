# Block 3-2c: Media Explorer And Rich Drill-Downs

> Status: Implemented on 2026-06-28.
> Result: Implemented.
> Verification: npm run build, npm test (52/52), npm run verify:tools, node --check src/web/static/dashboard.js, and live PM2 HTTP walkthrough - passed.
> Notes: Mixed-media explorer with stable search/sort/pagination, Plex art fallbacks, and media-aware movie, episodic, and audiobook hierarchy detail.

## Goal

Make household consumption easy to browse by title and easy to investigate deeply, using existing Plex artwork and media-aware hierarchy.

## Scope

- Add Media Explorer as the third dashboard layout.
- Support title search, sorting, bounded server-side pagination, category, library, person, date, and completion filters.
- Present Plex posters and covers through the token-safe artwork path from 3-2a.
- Build rich media, person, and session drill-down routes or panels with serializable filter context.
- Show movie detail, show/season/episode hierarchy, and audiobook series/subseries/book/chapter detail.
- Display duration, progress, repeats, people, sessions, co-watch evidence, and provenance when available.
- Centralize friendly category derivation for movies, TV, classic TV, anime, and audiobooks.
- Treat Explorer as consumed household titles, not a raw Plex media-type browser: admit only mapped household libraries (Movies, TV Shows/ETV/JDrama, Classic, Anime, and Audiobooks), and keep unknown or stale items out rather than guessing.
- Keep detail views readable as drill-downs, not editing surfaces.

## Out Of Scope

- Editing Plex or canonical metadata.
- Recommendations or ratings.
- Permanent artwork storage.
- Co-watch workflow mutations.
- New progress calculations beyond the shared read model.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/public/styles.css`
- `src/server/routes.ts`
- `src/service/queryService.ts`
- `src/service/summaryService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- [ ] Explorer supports mixed and category-specific browsing with deterministic pagination.
- [ ] Artwork failures do not break browsing or leak Plex credentials.
- [ ] Drill-down content changes appropriately for movies, episodic media, and audiobooks.
- [ ] Repeat plays are not confused with distinct episodes or chapters.
- [ ] Friendly category labels retain raw classification when derived or uncertain.
- [ ] Drill-down URLs/state can return to the prior filtered layout.
- [ ] Search and sort remain stable when the same title appears in multiple libraries or categories.

## Verification

- `npm run build`
- `npm test`
- Manual category, search, pagination, artwork, hierarchy, repeat-play, and navigation checks.