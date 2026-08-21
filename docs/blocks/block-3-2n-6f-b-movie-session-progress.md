# Block 3-2n-6F-B: Movie Session Progress

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-2n-6F established the additive Overview digest and session contracts this block extends; Block 3-2n-6F-A established the per-session progress presentation pattern.
> Notes: Corrective Overview follow-up for Movies only. Aligns movie session progress presentation with episodic and audiobook media without changing ingestion, persistence, or historical observations.

## Goal

Make each Movie Overview session display source-honest progress in the expanded session card matching the design and accessibility standards of episodic and audiobook media: explicitly completed movie sessions show a full 100% progress bar (`Completed`), source-backed partial sessions show their recorded percentage (`Approximate progress`), and missing evidence remains visibly unknown instead of fabricating 0% or guessing unwatched.

## Read-Only Evidence Baseline

- In the local database, movie observations in `playback_observations` already contain `completed`, `percent_complete`, and timestamps.
- Historical completed movie plays have `completed: 1`, while partial plays have recorded source percentages (`percent_complete` between 0 and 100). Legacy snapshot imports without progress evidence have null/missing percentage and `completed: 0`.
- `buildPlaybackDigestSession` in `src/service/dashboardService.ts` currently projects `completedChapters`/`currentChapter` for audiobooks and `episodeProgress` for episodic media, but emits no progress projection for movies.
- Expanding a Movie session currently shows session time and participants, but no progress bar or completion state.

## Scope

- Add a typed, additive `movieProgress` field (`DashboardPlaybackDigestMovieProgress`) to `DashboardPlaybackDigestSession` for the `movie` category.
- Keep the new movie progress projection separate from episodic `episodeProgress` and audiobook chapter fields.
- Emit one deterministic progress entry per movie session:
  - If any observation in the session marks the movie explicitly completed, project `state: "completed"`, `progressPercent: 100`, and `progressSource: "explicit_completion"`. Do not infer completion from percentage alone.
  - Otherwise, select the latest deterministic source-backed percentage for that movie within the session, bound it for display (0–100%), and project `state: "partial"`, `progressPercent: boundedPercent`, and `progressSource: "source_percentage"`.
  - If no usable percentage exists, project `state: "unknown"`, `progressPercent: null`, and `progressSource: "unavailable"` without inventing 0%.
- Render the movie progress row in the expanded Overview session body using markup, styling, and accessible progress bar semantics matching `digest-episode-progress` / `digest-progress-track`:
  - Completed movies display `Completed` and a full accessible gradient bar (`aria-valuenow="100"`).
  - Partial movies display `Approximate progress · <percent>%` and an accessible gradient bar reflecting the percentage.
  - Unknown movies display `Progress unavailable` without a meter.
- Preserve existing movie digest grouping, artwork, participant attribution, shared-detail navigation, filters, and responsive layout without horizontal overflow.
- Extend deterministic service fixtures (`tests/run-tests.mjs`) and browser regression coverage (`tests/e2e/dashboard-regression.spec.mjs`) for completed, partial, unknown, and multi-observation movie sessions.

## Out Of Scope

- Database migrations, schema edits, or raw observation mutations.
- Changes to Tautulli or Plex ingestion adapters, webhooks, or polling workers.
- Changes to shared movie detail workspace, movie identity resolution (Block 3-6-2C), or movie history backfill (Block 3-2n-6E-3C / 3-6-4).
- Timeline movie bar redesign, Progress-page movie redesign, or Plex watched-state mutations.
- Fabricating exact millisecond offsets or claiming exact playhead positions for historical movie records.

## Likely Files Or Areas

- `src/types/api.ts`
- `src/service/dashboardService.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/e2e/fixture-server.mjs`

## Acceptance Criteria

- `DashboardPlaybackDigestSession` exposes an additive `movieProgress` object when category is `movie`.
- A movie session fixture with `completed: true` returns `state: "completed"`, `progressPercent: 100`, `progressSource: "explicit_completion"`.
- A movie session fixture with partial percentage (e.g. 65%) and `completed: false` returns `state: "partial"`, `progressPercent: 65`, `progressSource: "source_percentage"`.
- A 100% source percentage without explicit completion is projected as `partial` with 100% and is not labelled `Completed`.
- A movie session with neither explicit completion nor usable percentage returns `state: "unknown"`, `progressPercent: null`, `progressSource: "unavailable"`.
- Expanded Overview movie sessions render matching accessible progress bars (`.digest-progress-track`) with correct `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow`, and state text.
- Movie digest card layout, subtitle, listener tags, and shared detail click/keyboard behavior remain unbroken across desktop and 320px narrow viewports.

## Escalation Conditions

- Stop and re-scope if representative movie observation fixtures contradict the stored `percent_complete` or `completed` semantics.
- Stop before adding schema, background workers, or storage changes.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after deploying/restarting `plex-cowatch-service`.
