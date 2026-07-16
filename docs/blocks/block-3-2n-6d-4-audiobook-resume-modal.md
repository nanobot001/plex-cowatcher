# Block 3-2n-6D-4: Audiobook Resume Modal

> Status: Planned.
> Result: Not implemented.
> Notes: Final child of 3-2n-6D. Present completed 6D-3 resume context and existing verified chapter progress as a useful audiobook-only workspace without making transcription a prerequisite for the modal.

## Goal

Replace the audiobook modal's default wall of chapter rows with a concise, attributed answer to “where was I?”: current chapter, within-chapter position, a short stopping-point excerpt when safely available, a compact chapter map, and what comes next.

## Dependencies And Entry Gate

- Blocks 6D-1 through 6D-3 are implemented and verified, including persisted revision-valid fixture/state.
- Block 6E-3 is implemented and verified. This block extends the shared canonical Audiobook presenter and one physical detail dialog; it must not recreate a Progress-only route, dialog, shell, or hierarchy renderer.
- Extension seam: add the bounded resume projection to the canonical Audiobook detail workspace response and render it inside the existing `detail-presenter-audiobook` path. Keep the existing `detail-workspace-scroll`, hierarchy lazy route, and canonical `detail`/legacy URL lifecycle intact.

## Scope

- Change only the Audiobook presenter inside the shared canonical detail workspace. Preserve TV, Classic TV, Anime, Movie, and every entry surface's shared shell behavior.
- Extend the canonical lazy Audiobook detail projection with a bounded per-visible-listener resume projection sourced only from active 6D-3 results matching the current audiobook media revision.
- Exclude hidden listeners and stale/superseded/failed jobs. Return excerpt content only through the localhost dashboard boundary; never add it to generic activity, audit, health, export, or tool-status responses.
- When multiple visible listeners have different positions, expose an accessible listener selector. Default to the dashboard person filter when present, otherwise the listener with the newest valid position; always show whose context is active.
- Make the right column use this order:
  1. `Resume listening`: listener, current chapter, within-chapter percentage from verified `partialPositions`, and latest supporting activity.
  2. `Near your stopping point`: completed local transcript excerpt and generation recency, only for a current revision-matched result.
  3. Compact accessible chapter map grouping completed/repeated, current/partial, and remaining/unknown chapters.
  4. Bounded `Up next` showing at most three verified chapters.
  5. Collapsed `Show all chapters` disclosure for the complete verified list.
- Keep the left column authoritative for overall book progress, source, plays, observed time, latest activity, and artwork. Do not repeat `24 of 62 chapters · 36%` as a prominent right-column strip.
- Render excerpt text as escaped text only—never HTML, Markdown, links, commands, or instructions.
- Do not show `Fill in summary later`, an empty resume card, persistent processing spinner, raw job state, model errors, paths, or diagnostics. Pending/unavailable/failed context falls back to the current-position workspace.
- Preserve source honesty. Unverified audiobooks keep track/file fallback and do not fabricate chapter numbers, within-chapter percentages, chapter maps, or `Up next` chapters.
- Render the full list only after disclosure. Keep one intended modal scroll region, fixed/sticky desktop artwork/reference content, content-first height, thin scrollbar, balanced padding, and no horizontal overflow.
- Preserve focus trapping, close restoration, keyboard interaction, canonical/legacy URL restoration, lazy fetch/caching, Back/Forward, and shared modal route semantics across every entry surface.
- Extend deterministic fixtures/regressions with ready, unavailable, stale-revision, multiple-listener, hidden-listener, final-chapter, and unverified-audiobook cases.

## Out Of Scope

- Creating, retrying, cancelling, deleting, or configuring jobs from the browser.
- Full transcripts, segments, confidence debugging, model configuration, queue controls, copy/export/download affordances, or operational status.
- Paraphrased summaries, LLM integration, semantic search, recommendations, or generated “previously on” prose.
- Changing proof, progress math, media revisions, ingestion, worker scheduling, or non-audiobook hierarchy views.

## Likely Files Or Areas

- `src/types/api.ts`
- `src/service/dashboardService.ts`
- `src/server/routes.ts` only if the existing lazy route needs a bounded read addition
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- deterministic dashboard fixture builder/database
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/` for durable resume-context vocabulary

## Risks And Drift Controls

- **Duplicate hierarchy:** Overall status stays left; the right answers current-position/context questions.
- **False household position:** Every position/excerpt is listener-attributed.
- **Copyright/privacy:** Display at most the persisted 20 words locally for visible listeners; no full/copy/export affordance.
- **Unsafe text:** Use text nodes/escaping and test HTML, Markdown, URLs, and instruction-like strings.
- **Stale context:** Require current media revision and active result on every read.
- **Layout regression:** Disclosure cannot create a second scrollbar or restore the default 62-row wall.
- **Maintainability:** Reuse existing states, `partialPositions`, disclosure primitives, and lazy route; no new modal framework.
- **Reversibility:** Empty/disabled resume state still yields a useful current-position/map/up-next modal.

## Acceptance Criteria

- Verified audiobook open no longer renders every chapter as the default dominant right-column content.
- In the deterministic Warbreaker-equivalent fixture, the left remains `24 of 62 chapters · 36%`, while `Resume listening` identifies Tony, Chapter 24, and `41% through this chapter` without duplicating overall status.
- A current successful result shows one inert escaped synthetic excerpt of no more than 20 words under `Near your stopping point`.
- Pending, disabled, unavailable, no-speech, failed, stale, and superseded contexts render no empty card or operational detail.
- Multiple listeners can select attributed context by pointer/keyboard; hidden listeners never appear in choices or response content.
- Compact map exposes Chapters 1-23 completed/repeated, Chapter 24 current/partial, and Chapters 25-62 remaining/unknown through visible and accessible labels.
- `Up next` begins at Chapter 25, contains at most three verified chapters, and adapts at final/unverified states.
- `Show all chapters` is collapsed by default, keyboard/pointer operable, reveals all verified chapters on demand, and restores focus predictably.
- Unverified audiobooks retain honest track/file fallback with no fabricated excerpt, map, within-chapter percentage, or next chapter.
- Transcript strings containing tags, entities, URLs, Markdown, or instruction-like content render only as inert text.
- At 320px, 390px, 768px, and 1440px, there is no horizontal overflow, duplicate nested scroll, cramped padding, or excessive empty space.
- Existing lazy loading, cache, routing, Back/Forward, focus, cross-surface parity, and non-audiobook presenter tests remain compatible.
- `npm run verify:block` passes before implementation status changes.
- After rebuild/restart, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Service tests for revision/visibility filtering, listener defaults, bounds, and omission from unrelated read surfaces
- Desktop/narrow Playwright assertions in `tests/e2e/dashboard-regression.spec.mjs` for hierarchy, keyboard operation, inert text, disclosure, one-scroll geometry, and overflow
- Live keyboard/geometry pass against one user-approved completed resume context
- `npm run verify:live-dashboard`
