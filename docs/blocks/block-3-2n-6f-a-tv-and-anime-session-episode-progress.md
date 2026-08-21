# Block 3-2n-6F-A: TV And Anime Session Episode Progress

> Status: Implemented locally; verification blocked.
> Result: Additive TV, Classic TV, and Anime per-session episode progress is implemented. The mandatory `npm run verify:block` run is blocked by the existing audiobook Timeline regression (`timeline and People retain historical audiobook meaning without raw browser progress`, desktop and narrow); the new episodic checks and the affected People regression pass.
> Verification: `npm test` passed with 153/153 tests; focused episodic browser checks passed; `node --check src/web/static/dashboard.js` and `npm run verify:tools` passed. Full `npm run verify:block` did not pass because of the unrelated Timeline assertion.
> Dependency: Block 3-2n-6F established the additive Overview digest and session contracts this block extends.
> Notes: Corrective Overview follow-up for TV, Anime, and Classic TV only. Keep the completed 6H through 6J-B audiobook sequence closed and unchanged. Only `plex-cowatch-service` was restarted; `npm run verify:live-dashboard` passed against the deployed dashboard.

## Goal

Make each episodic Overview session explain how far each represented episode progressed: explicitly completed episodes show a full bar, source-backed partial episodes show their approximate percentage, and missing evidence remains visibly unknown instead of becoming zero or unwatched.

## Read-Only Evidence Baseline

- A representative 2026-08-20 audit of the local database found 3,536 episode observations, including 3,019 explicitly completed rows and 490 incomplete rows with a positive `percent_complete` value.
- The same audit found no historical episode rows with `view_offset`, so historical partial bars can use recorded source percentages but cannot claim exact positions.
- The Tautulli adapter and ingestion service already preserve `percent_complete`, its provenance, `view_offset`, and `completed`; no new capture or persistence is required for the observed shapes.
- `buildPlaybackDigestSession` currently emits only `episodeKeys` for TV, Anime, and Classic TV. The browser resolves those keys to episode labels but receives no per-session episode progress projection. This omitted projection is the simplest verified explanation for the missing bars.
- The counts above are a point-in-time evidence sample, not an acceptance threshold. Implementation must remain capability-based and title-independent.

## Scope

- Add a typed, additive per-episode progress projection to `DashboardPlaybackDigestSession` for TV, Anime, and Classic TV without removing or changing the compatibility `episodeKeys` field.
- Keep the new episode projection separate from audiobook `completedChapters`, `currentChapter`, and canonical audiobook progress fields.
- Emit one deterministic progress entry per episode represented by a session, retaining rating key, display label/episode coordinates, explicit completion state, recorded percentage when available, and enough provenance to distinguish source-backed approximate progress from unavailable evidence.
- If any represented observation explicitly marks the episode completed in that session, project it as completed with a 100% display value. Do not infer completion from percentage alone.
- Otherwise select the latest deterministic source-backed percentage for that episode within the session, bound it for display, and label it approximate. If no usable percentage exists, project an unknown state without inventing 0%.
- Collapse duplicate observations for the same episode within one session without creating duplicate progress rows; preserve existing session, participant, replay, and episode ordering semantics.
- Render compact per-episode rows in the expanded Overview session body. Completed episodes receive a full accessible bar and `Completed`; partial episodes receive their percentage and `Approximate progress`; unknown episodes receive source-honest text and no progress bar.
- Preserve existing artwork, card selection, shared-detail navigation, category/date/user filters, keyboard behavior, and responsive layout.
- Extend deterministic service fixtures and browser regression coverage for completed, partial, unknown, duplicate-observation, and non-episodic compatibility cases.

## Out Of Scope

- Database migrations, observation rewrites, historical offset fabrication, or a backfill that invents missing percentages.
- Changes to Tautulli/Plex adapters, polling, webhooks, workers, PM2 topology, or external-service configuration.
- Audiobook chapter evaluation, exact audiobook stop capture, canonical audiobook projections, or any reopening of Blocks 3-2n-6H through 3-2n-6J-B.
- Show-wide completion percentages, season completion redesign, Timeline bar semantics, Progress-page redesign, achievements, or Plex watched-state mutation.
- Treating missing evidence as unwatched, 0%, or incomplete with confidence.

## Likely Files Or Areas

- `src/types/api.ts`
- `src/service/dashboardService.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css` only if the existing digest progress styles cannot support aligned per-episode rows
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`

## Acceptance Criteria

- The Overview API exposes an additive per-session episode-progress collection for TV, Anime, and Classic TV while preserving `episodeKeys` and all existing response fields.
- A session fixture containing one explicitly completed episode and one 50% incomplete episode returns one 100% completed entry and one 50% approximate entry in deterministic episode order.
- Multiple observations for one episode in one session produce one entry. Explicit completion wins for that session; otherwise the latest usable source-backed percentage is shown.
- A 100% source percentage without explicit completion is not labelled `Completed`.
- An episode with neither explicit completion nor a usable percentage is labelled unavailable and renders no progress bar; it is never displayed as 0% or unwatched.
- Expanded Overview sessions show readable episode identity, state text, and an accessible progress bar for completed and partial entries. Completed bars expose `aria-valuenow="100"`; partial bars expose their bounded recorded percentage.
- Existing audiobook, movie, participant, replay, artwork, card-selection, and shared-detail behavior remains unchanged.
- The layout has no horizontal overflow and preserves readable spacing from 320px through desktop widths.
- Tests include positive completed/partial evidence and structurally different unknown and duplicate-observation cases without using title-specific production logic.

## Escalation Conditions

- Stop and re-scope if representative fixture/live shapes contradict the stored `percent_complete` or `completed` semantics assumed above.
- Stop before adding schema, ingestion, a background worker, or a competing progress evaluator; those changes require new evidence and explicit authorization.
- Stop if correct per-session projection would require changing established session boundaries or participant attribution rather than adding a read-only digest projection.

## Verification

- `npm run verify:block`
- Rebuild or restart only the affected deployed dashboard service after implementation.
- `npm run verify:live-dashboard` after the deployed rebuild or restart.
