# Block 3-2n-6J-A: Service And API Progress Projection Adoption

> Status: Planned.
> Result: Not implemented.
> Dependencies: Blocks 3-2n-6H and 3-2n-6I.
> Notes: First child of 3-2n-6J. This block owns service/API adoption and compatibility only; it does not redesign or migrate browser presentation.

## Goal

Make every service and API path that supplies audiobook progress select an explicit projection from the canonical per-user snapshot: current position, furthest attainment, session-as-of movement, chapter state, or raw source evidence.

Deliver one stable additive contract for 6J-B so the browser never needs to derive audiobook progress from raw `percent_complete`, infer chapter state, or guess how rewinds should be shown.

## Scope

- Produce a complete consumer inventory covering:
  - Overview recent-playback digests and audiobook completion/activity summaries;
  - Progress summary buckets, cards, hierarchy expansion, watcher evidence, and recently-completed classification;
  - shared detail summary and audiobook hierarchy;
  - Media Explorer, Continue Consuming, legacy continue-watching compatibility, and progress sorting;
  - Timeline activity/session payloads;
  - People recent-title and completion semantics;
  - legacy detail/activity reads and public-read dashboard responses;
  - raw CSV export, Copy History, watched-state synchronization, and Audit as explicit non-derived boundaries.
- Define typed additive API fields for the required projections, including:
  - current position/chapter/percentage;
  - furthest position/chapter/percentage;
  - session start/end movement and direction;
  - chapter states;
  - quality, source, reason, evaluated-at time, and revision identity.
- Reuse one projection adapter over the 6H evaluator instead of independently calculating fields in endpoint methods.
- Make Overview audiobook session rows receive session-specific as-of movement rather than the book's latest snapshot.
- Make Progress and shared detail receive the same per-user current, furthest, chapter, quality, and revision values.
- Make Media Explorer and Continue Consuming receive current position plus optional furthest context; keep progress sorting deterministic by furthest attainment with a documented quality-aware fallback.
- Make Timeline receive historical as-of progress for each observation/session.
- Correct People and Overview service wording/count inputs so completed playback observations, passed chapter boundaries, and completed books remain separate facts.
- Preserve route names and existing non-audiobook payload meanings. Add compatibility aliases only where required.
- Preserve the raw CSV contract. Do not replace raw `percent_complete`; any derived export field requires a separate name and compatibility review.
- Prove approximate/unknown progress cannot enter Copy History, Plex synchronization, or another mutation path.
- Record the final consumer mapping and additive field semantics in the block result or an appropriate durable data/API contract used by 6J-B.

## Out Of Scope

- `dashboard.js`, CSS, browser copy, visual meters/markers, responsive layout, or Playwright presentation journeys; Block 3-2n-6J-B owns those.
- Tautulli notifier/webhook configuration, activity sampling, or position capture.
- Changing 6H rewind, chapter-state, or evidence-quality meanings.
- Rewriting raw observations or historical source values.
- Adding a materialized cache, new worker, broad API version, or frontend state system.
- Transcript/resume-context work, metadata/title correction, or non-audiobook progress redesign.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/service/audiobookProgressEvidence.ts` only for projection adapters, not semantic changes
- `src/types/api.ts`
- `src/server/routes.ts`
- `tests/run-tests.mjs`
- `tests/e2e/fixture-server.mjs` only for API-ready shared fixtures needed by 6J-B
- `docs/data/dashboard-csv-export.md`
- `docs/tool-surface.md` only if a public-read contract changes materially
- An appropriate durable audiobook-progress API/data contract if the block creates one

## Acceptance Criteria

- The consumer inventory accounts for every surface and boundary listed in Scope; no known audiobook progress consumer is left implicit.
- Every audiobook service/API consumer chooses an explicit current, furthest, session-as-of, chapter-state, or raw-evidence projection.
- The additive contract contains sufficient typed information for 6J-B to render progress without inspecting raw `percentComplete`, `viewOffset`, or `duration`.
- Overview session payloads retain distinct session movement and do not repeat the latest book position across earlier sessions.
- Progress and shared detail return identical canonical values for the same user/book/revision.
- Continue Consuming uses current position; Explorer progress sorting uses deterministic furthest attainment and documents fallback ordering for approximate/unknown evidence.
- Timeline rows retain historical as-of progress even when the listener later advances or rewinds.
- People/Overview service inputs cannot call a passed chapter, partial session, or completed observation a completed book.
- A trusted rewind fixture returns a lower current position, stable higher furthest position, revisit direction, retained prior chapter attainment, and increasing validated listening time.
- Stale/reset, approximate historical, missing-position, multi-user, and multi-file fixtures remain source-honest.
- Raw CSV/source fields are unchanged and no derived approximate field reaches a mutation path.
- Existing route names, non-audiobook payload semantics, and compatibility callers remain stable.
- Browser presentation remains unchanged in this block except for additive payload availability.

## Scope Guard And Escalation Conditions

- Stop if implementation starts changing browser copy/layout; that belongs to 6J-B.
- Stop before adding persistent derived state or a worker unless measured endpoint performance proves the existing evaluator/projection path cannot meet the established budget.
- If a legacy contract cannot change meaning safely, preserve it and add a clearly named canonical field.
- Keep raw forensic evidence explicitly separate from derived progress.

## Verification

- `npm run verify:block`
- Deterministic endpoint parity tests over one shared forward/rewind/stale fixture
- Raw-observation and CSV-contract preservation assertions
- Compatibility tests for existing route names and non-audiobook payloads
- Mutation-isolation tests proving approximate/unknown progress cannot trigger writes
- No service restart or live-dashboard gate is required unless implementation unexpectedly changes deployed presentation/runtime behavior
