# Block 3-2k: Rich Media Detail Workspace

> Status: Implemented on 2026-07-04.
> Result: Implemented.
> Verification: `npm run verify:block` - passed.
> Notes: Replaces the generic modal with a centered, glassmorphic overlay modal showing TV and audiobook hierarchies, featuring instant optimistic loading and lag-free DOM close interactions.

## Goal

Replace the generic modal with a reusable detail workspace that explains hierarchy, people, progress, sessions, repeats, and provenance for the selected movie, series, or audiobook.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2j and Block 3-2j-1 complete.
- The selected-title contract from 3-2j is stable and URL serializable.
- `Watched by`, `Together`, and `Likely together` use the authoritative evidence contract from 3-2j-1.

## Scope

- Implement an accessible centered glassmorphic overlay modal on desktop and a sheet on narrow screens.
- Add shared hero data: top-level artwork, canonical title, category, library, people, first/last consumed, total observed time, distinct items, repeats, and evidence summary.
- Use the canonical poster/cover in the detail hero. For audiobooks, the hero and all book nodes use the specific book cover and must not fall back to author/artist artwork while a book cover exists.
- Resolve participant labels through dashboard aliases and omit hidden users and their evidence from dashboard detail aggregates while retaining the underlying records.
- For TV, Classic TV, and Anime, expose show -> season -> episode hierarchy with watched, partial, repeated, and unknown states per person.
- For Audiobooks, expose parent series -> subseries -> series -> book -> chapter hierarchy using canonical audiobook data.
- For Movies, expose plays, completion, participants, co-watch evidence, and repeat history without inventing seasons or collections.
- Lazy-load hierarchy and session evidence only after selection or expansion.
- Preserve the originating layout, filters, sort, pagination, and scroll position when detail closes.
- Keep observed playback, explicit confirmation, inferred overlap, and Plex synchronization visually distinct.
- Use `Watched by` for title-level participation, `Together` for human-confirmed exact-item co-watching, and `Likely together` for qualifying exact-item inference; do not show confidence percentages in the primary detail UI.
- Show confirmation/inference provenance and timing support in the evidence detail, including an honest fallback when historical confirmer identity is unavailable.

## Out Of Scope

- Playback/resume controls, ratings, notes, metadata editing, versions, subtitles, recommendations, or Plex mutations.
- Changing hierarchy inference or canonical audiobook matching rules.
- Confirm/deny review actions or Discord requests, deferred to 3-2m.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Selecting one title opens exactly one detail workspace whose heading and artwork match the selected top-level identity.
- Episodic and audiobook hierarchies never confuse plays with distinct episodes or chapters.
- Unknown totals and metadata are labeled unknown, not zero or complete.
- Detail payloads are bounded and hierarchy children load progressively.
- Detail is keyboard operable, focus trapped while modal on narrow screens, and focus restored on close.
- Direct URL/reload restores the selected item or shows a clear unavailable state.
- Detail artwork and participant tests cover canonical book-versus-author imagery, custom alias, username fallback, and hidden-user exclusion.
- Different episodes watched by different people remain separate per-person evidence and cannot become a show-level togetherness claim.
- Confirmed and inferred exact-item relationships use distinct labels, and unknown evidence remains unlabeled rather than becoming likely.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Playwright detail walkthrough for one movie, TV show, Classic TV show, anime series, and audiobook.
- Verify back/forward, reload, close/focus restoration, stale identity, artwork failure, and partial metadata.
- Confirm detail timing remains within the 3-2g budget.

## Drift Guardrails

- All layouts must reuse this detail workspace; no layout-specific detail modal may be introduced later.
- UI labels must reflect stored evidence and cannot imply Plex mutation or certainty not present in the data.
