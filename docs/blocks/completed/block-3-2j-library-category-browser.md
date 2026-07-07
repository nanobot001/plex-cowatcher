# Block 3-2j: Library Category Browser

> Status: Implemented on 2026-07-02 after participant-label and visual-badge corrections.
> Result: Implemented.
> Verification: `npm run verify:block` (64/64 service tests and 6/6 isolated Playwright tests) plus `npm run verify:live-dashboard` - passed.
> Notes: Canonical Library and recent cards now show filter-aware participant badges over artwork plus an accessible `Watched by` line below it, including explicit confirmed targets without duplicate playback while preserving aliases and hidden-user exclusion.

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
- Render a compact visual participant badge over each canonical Library and recent-playback poster using the same names as `Watched by`; show at most two names plus `+N more` and never style or describe it as live presence.
- Render a compact `Watched by` line below each canonical title card using all visible title-level participants, sorted by shared display name, showing at most two names plus `+N more`.
- Treat `Watched by` as participation anywhere under the canonical movie/show/book identity, not evidence that the people watched the same item or watched together.
- Include visible independently observed users and visible explicit `status='confirmed'` targets from the exact matched watch event; prompt resolution or Plex synchronization alone cannot add a participant.
- Preserve that same complete participant set when a recent card opens the existing detail dialog; do not fall back to the source playback row's singular legacy `displayName`.

## Out Of Scope

- Entire Plex library browsing, unseen media, favorites, downloads, ratings, recommendations, metadata editing, or permanent artwork storage.
- Rich hierarchy and evidence detail, deferred to 3-2k.
- Co-watch inference rules, `Together`/`Likely together` labels, review actions, and Discord prompting; the semantics correction belongs to 3-2j-1.

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
- A show consumed by different people across different episodes lists those visible people under `Watched by` without displaying or implying co-watching.
- Participant labels use aliases with exact username fallback and remain compact at narrow widths; every populated Library and recent-playback poster has a matching visual viewer badge and accessible `Watched by` text.
- Viewer badges and `Watched by` use the same complete participant set and never imply live presence, same-item consumption, or co-watching.
- Opening a card preserves the exact visible participant names from the card in the detail dialog, including confirmed targets without duplicate playback rows.
- A confirmed target appears in `Watched by` even without a duplicate playback observation; hidden, dismissed, unresolved, and sync-only targets do not.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Playwright category, sort, search, filter, pagination, artwork-failure, and browser-history walkthroughs.
- Verify the first visible Library response remains within the 3-2g limits.
- Add service and Playwright fixtures for one viewer, two viewers, three-plus viewers, different-episode viewers, aliases, and hidden users.
- Add a regression fixture where the source has the only playback row and a second visible user is explicitly confirmed through the matched watch event.
- In Playwright, assert badge count matches populated card count, multi-viewer badge text matches `Watched by`, three-plus viewers show `+N more`, and narrow layouts do not overflow.
- In Playwright, open a multi-viewer recent card and assert its detail `People` list matches the card's complete `Watched by` list.
- Re-run the full exit gate before restoring this block to Implemented status.

## Drift Guardrails

- This is consumed-history exploration, not a Plex replacement library manager.
- Do not add fields or controls that require unsupported metadata sources.
