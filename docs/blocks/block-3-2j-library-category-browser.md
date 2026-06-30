# Block 3-2j: Library Category Browser

> Status: Planned.
> Result: Not implemented.
> Notes: Replaces the single alphabetical 48-card grid with the category-led consumed-title browser defined by the redesign contract.

## Goal

Let the operator browse consumed household titles by media family without audiobooks, numeric prefixes, or repeated activity fragments overwhelming the opening view.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2i complete.
- Consumed-title identity and supported-library inclusion rules are frozen in the redesign contract.

## Scope

- Build bounded sections for Continue Consuming, TV, Classic TV, Movies, Anime, and Audiobooks.
- Default each section to recently consumed; provide explicit title, recent, progress, and play-count sorts where meaningful.
- Add category, person, completion, library, and date filters through the shared filter surface.
- Normalize display sorting so leading punctuation and year prefixes do not monopolize alphabetical results while preserving original titles.
- Add section-level counts and View All navigation with deterministic pagination.
- Show category-appropriate secondary text: episodes for episodic media, chapters/books for audiobooks, and plays for movies.
- Use top-level show/book/movie artwork and a deliberate category fallback when Plex artwork is unavailable.
- Resolve audiobook artwork from the canonical audiobook/book identity; explicitly reject author, artist, album, series, and chapter artwork as the card poster.
- Apply hidden-user exclusion before category counts, recent ordering, progress, and play totals; render aliases through the shared resolver where people are shown.
- Establish selected-title state and a reserved desktop detail region for 3-2k without implementing rich detail yet.

## Out Of Scope

- Entire Plex library browsing, unseen media, favorites, downloads, ratings, recommendations, metadata editing, or permanent artwork storage.
- Rich hierarchy and evidence detail, deferred to 3-2k.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`

## Acceptance Criteria

- The opening Library view shows all five categories without one category consuming the entire first page.
- Cards represent one movie, series, or canonical audiobook—not an episode, chapter file, or session fragment.
- Unsupported libraries, stale keys, raw tracks, and `other` never appear.
- Sorting and pagination are stable for equal titles and multiple libraries.
- A user can reach all results for any category without loading all categories in one response.
- Artwork failure preserves layout and accessible title/category context.
- Poster fixtures prove movie cards use movie posters, episodic cards use show posters, and audiobook cards use book covers even when author/artist artwork is also available.
- Hiding a user removes that user's sole-consumption titles and contribution to shared-title counts without deleting stored evidence.

## Verification And Exit Gate

- `npm run build`
- `npm test`
- Playwright category, sort, search, filter, pagination, artwork-failure, and browser-history walkthroughs.
- Verify the first visible Library response remains within the 3-2g limits.

## Drift Guardrails

- This is consumed-history exploration, not a Plex replacement library manager.
- Do not add fields or controls that require unsupported metadata sources.
