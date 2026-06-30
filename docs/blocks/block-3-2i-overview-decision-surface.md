# Block 3-2i: Overview Decision Surface

> Status: Planned.
> Result: Not implemented.
> Notes: Rebuilds Overview after the shared shell exists, using Mockup 1 for composition and only the evidence-backed operations concepts from Mockup 5.

## Goal

Make Overview answer, within one screen, what the household consumed, what is in progress, who was active, and what genuinely needs attention.

## Dependencies And Entry Gate

- Blocks 3-2g and 3-2h complete.
- Use only data and actions defined in the redesign contract.

## Scope

- Add a compact summary strip for total consumed time plus TV, Classic TV, Movies, Anime, and Audiobooks.
- Display comparison deltas only when a complete comparable prior period exists; otherwise omit the delta.
- Build a bounded Continue Consuming row using the most recent meaningful incomplete state per person/title, with progress and remaining time when known.
- Add Recently Completed, category mix, and household activity sections with explicit date-window labels.
- Add a Needs Attention lane restricted to unresolved prompts, failed Discord delivery, failed Plex synchronization, missing metadata, and uncertain classification.
- Move service readiness to a compact operations indicator; retain detailed health through an expandable secondary surface.
- Make every title, person, category, and attention item navigate to a defined filtered view or detail context.
- Render canonical posters/covers on every media card; audiobook cards must show the book cover and never the author/artist image.
- Apply dashboard visibility and aliases to every person label, activity item, active-user count, and household aggregate.

## Out Of Scope

- Recommendations, trending, watchlists, expiring media, due dates, scheduled reports, or mutation actions not already authorized.
- Building the rich title detail pane; links may use the existing detail until 3-2k.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`

## Acceptance Criteria

- At desktop width, the summary, Continue Consuming, and Needs Attention are visible without scrolling below two full screens.
- All five categories are represented consistently and `other` is absent.
- Continue Consuming contains no completed item, duplicate session fragment, or stale unsupported media.
- Needs Attention contains only actionable, evidence-backed states and links to their resolution context.
- Empty and partial-data states explain why a section is absent without fabricating content.
- Overview first paint meets the 3-2g performance budget.
- Hidden users contribute neither visible rows nor aggregate totals; custom aliases appear consistently and username fallback remains exact.
- Every media card with available canonical artwork shows the correct movie/show/book poster or cover, including an audiobook fixture with distinct author and book images.

## Verification And Exit Gate

- `npm run build`
- `npm test`
- Playwright desktop/narrow screenshots with populated, empty, and partial-failure fixtures.
- Click-through checks for one category, title, person, and attention item.
- Compare against Mockup 1 for hierarchy, not pixel identity.

## Drift Guardrails

- Overview is a decision surface, not a second Library or analytics warehouse.
- Each section must answer a distinct user question and must not repeat the same unfiltered title carousel elsewhere.
