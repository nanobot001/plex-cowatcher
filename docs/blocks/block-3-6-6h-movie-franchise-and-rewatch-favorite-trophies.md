# Block 3-6-6H: Movie Franchise Collections, Rewatch Favorites, And Expanded Genre/Era Tiers

> Status: Implemented (2026-10-16).
> Result: Implemented and verified via deterministic test gate (`npm run verify:block`) and live smoke gate.
> Dependency: Blocks 3-6-6A, 3-6-6C, and 3-6-6D implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Give Movies rich, progressive representation on the **Trophy Shelf** and in **Badges** without flooding the Trophy Shelf with one-off single-watch movie posters—by introducing **Movie Franchise / Collection Trophies**, **Cult-Classic Rewatch Favorite Trophies (2x+)**, and multi-tier **Genre, Volume, and Era** badge chains.

## Scope

- **Movie Franchise & Collection Trophies (`movie_collection_mastery_<collectionKey>`)**:
  - Group movies belonging to a multi-film franchise or collection (resolved from Plex collection metadata, TMDB `belongs_to_collection` enrichment, or `config/movie_collections.json` overrides) into dynamic poster-backed Trophy Shelf items.
  - Evaluate `in_progress` (watched `>= 1` movie in the collection), `caught_up` (watched all movies currently available on Plex while known franchise entries remain off-server or unreleased), and `earned` (completed 100% of released movies in the franchise).
  - Include per-film breakdown (`episodeReplayDetails` / collection item details) showing each movie's title, release year, watched state, play count, and on-server availability.
- **Rewatched "Cult Classic / Comfort Movie" Trophies (`movie_mastery_<ratingKey>`)**:
  - A single movie watched once (`1x`) does **not** create a Trophy Shelf card (preventing hundreds of 1-off movie cards from crowding out series and franchises).
  - A single movie watched **2 or more times** across distinct viewing sessions (`replayCount >= 1` via `evaluateReplaySemantics`) earns a dynamic poster-backed Trophy Shelf card:
    - **Silver (`2x Replay`)**: Watched twice on distinct sessions (`nextTier: Gold 3x`).
    - **Gold (`3x Replay`)**: Watched 3 times on distinct sessions (`nextTier: Platinum 4x+`).
    - **Platinum (`4x+ Replay`)**: Watched 4 or more times on distinct sessions.
- **Expanded Movie Volume, Genre & Era Badges (`src/achievements/ruleCatalog.ts`)**:
  - **Volume Progression**: Extend beyond 50 movies with `movie_count_100` (Gold), `movie_count_250` (Platinum), and `movie_count_500` (Platinum) so active viewers always have an `in_progress` volume target.
  - **Genre Devotion Chains**: Add tiered genre progressions (`5 Bronze -> 15 Silver -> 30 Gold -> 50 Platinum`) across core catalog genres (*Science Fiction*, *Action & Adventure*, *Horror & Thriller*, *Animation*, *Comedy*, *Drama*).
  - **Era / Decade Explorer**: Add milestone badges for distinct movies watched by release era (e.g., *80s Classics*, *90s Cinema*, *2000s Features*, *New Releases*).

## Out Of Scope

- Awarding Trophy Shelf poster cards for single `1x` standalone movie watches.
- Counting same-session duplicate play observations as rewatches (must strictly use `evaluateReplaySemantics`).
- UI filter pills and modal layout adjustments (owned by Block `3-6-6I`).

## Likely Files Or Areas

- `config/movie_collections.json` (optional curated/override franchise definitions)
- `src/achievements/types.ts`
- `src/achievements/evidenceReader.ts`
- `src/achievements/evaluator.ts`
- `src/achievements/ruleCatalog.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Standalone movies watched only once (`1x`) do not generate dynamic Trophy Shelf cards.
- Standalone movies with `replayCount >= 1` (`2x+` total distinct sessions) generate poster-backed Trophy Shelf cards with Silver/Gold/Platinum tiers and next-tier replay progress.
- Multi-movie franchises/collections generate `in_progress`, `caught_up`, and `earned` Trophy Shelf cards with accurate on-server vs. off-server counts.
- Expanded movie volume and genre badge chains provide continuous `in_progress` targets past 50 movies.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Unit tests in `tests/run-tests.mjs` covering 1x vs. 2x+ movie rewatch trophies, franchise collection progress/caught-up/completion, and tiered genre/volume rules
