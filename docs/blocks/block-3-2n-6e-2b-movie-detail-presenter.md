# Block 3-2n-6E-2B: Movie Detail Presenter

> Status: Implemented on 2026-07-14.
> Result: Implemented.
> Verification: `npm run verify:block` passed (104/104 service/integration tests, 43 dashboard regression tests with one intentional skip, dashboard syntax, and tool contracts); `npm run verify:live-dashboard` passed after PM2 restart.
> Notes: Replaced the empty Movie hierarchy placeholder with a responsive source-backed viewing record, progress meter, playback facts, latest activity, visible participants, and evidence explanation. Progress calculations, artwork semantics, and the Progress dialog remain unchanged.

## Goal

Make Movie detail modals feel complete instead of presenting an empty primary column after the single poster and compact summary rail have rendered.

## Dependencies And Entry Gate

- 6E-2 shared shell/category presenters are implemented and verified.
- 6E-2A hero, poster, one-scroller, responsive, and source-honesty contracts remain unchanged.
- The current `DashboardDetailWorkspaceResponse` already provides the Movie title, category, visible people, playback summary, and progress summary needed for this bounded presenter.

## Scope

- Replace the Movie presenter's hierarchy-only placeholder with a responsive primary-column viewing record.
- Show the current progress state, a bounded progress meter when a percentage exists, observed play/completion counts, observed time, latest activity, and visible household participants using existing API fields.
- Add a concise evidence explanation that distinguishes observed Plex playback from an episodic hierarchy; do not invent plot, cast, director, runtime, or other metadata absent from the current contract.
- Keep the poster/summary reference rail, full-width hero, canonical detail route, one `.detail-workspace-scroll`, keyboard behavior, and Progress dialog unchanged.
- Add deterministic dashboard coverage that proves the Movie presenter contains meaningful content and remains usable across the existing viewport matrix.

## Out Of Scope

- Changing progress calculation, session/repeat semantics, artwork resolution, or the Movie API identity contract.
- Adding Plex metadata fetches, database migrations, generated copy, plot/cast/director fields, or external artwork providers.
- Migrating Progress or removing `#progress-dialog`; 6E-3 owns that work.

## Acceptance Criteria

- A Movie detail modal has a visible, content-sized primary-column viewing record instead of only “no episodic hierarchy.”
- Progress, playback, latest activity, and participant values are rendered from the canonical detail response and remain source-honest when values are missing.
- The progress meter has an accessible label and does not imply completion when the current percentage is unknown.
- The presenter has no horizontal overflow, does not create a second scroll owner, and remains readable from 320px through 1440px.
- `npm run verify:block` passes and `npm run verify:live-dashboard` passes after the deployed dashboard is restarted.
