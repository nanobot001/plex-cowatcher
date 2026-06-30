# Block 3-2k: Rich Media Detail Workspace

> Status: Planned.
> Result: Not implemented.
> Notes: Adds one shared, media-aware detail system after Library selection and identity are stable.

## Goal

Replace the generic modal with a reusable detail workspace that explains hierarchy, people, progress, sessions, repeats, and provenance for the selected movie, series, or audiobook.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2j complete.
- The selected-title contract from 3-2j is stable and URL serializable.

## Scope

- Implement a persistent right-side detail pane on desktop and an accessible full-screen sheet on narrow screens.
- Add shared hero data: top-level artwork, canonical title, category, library, people, first/last consumed, total observed time, distinct items, repeats, and evidence summary.
- For TV, Classic TV, and Anime, expose show -> season -> episode hierarchy with watched, partial, repeated, and unknown states per person.
- For Audiobooks, expose parent series -> subseries -> series -> book -> chapter hierarchy using canonical audiobook data.
- For Movies, expose plays, completion, participants, co-watch evidence, and repeat history without inventing seasons or collections.
- Lazy-load hierarchy and session evidence only after selection or expansion.
- Preserve the originating layout, filters, sort, pagination, and scroll position when detail closes.
- Keep observed playback, explicit confirmation, inferred overlap, and Plex synchronization visually distinct.

## Out Of Scope

- Playback/resume controls, ratings, notes, metadata editing, versions, subtitles, recommendations, or Plex mutations.
- Changing hierarchy inference or canonical audiobook matching rules.

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

## Verification And Exit Gate

- `npm run build`
- `npm test`
- Playwright detail walkthrough for one movie, TV show, Classic TV show, anime series, and audiobook.
- Verify back/forward, reload, close/focus restoration, stale identity, artwork failure, and partial metadata.
- Confirm detail timing remains within the 3-2g budget.

## Drift Guardrails

- All layouts must reuse this detail workspace; no layout-specific detail modal may be introduced later.
- UI labels must reflect stored evidence and cannot imply Plex mutation or certainty not present in the data.
