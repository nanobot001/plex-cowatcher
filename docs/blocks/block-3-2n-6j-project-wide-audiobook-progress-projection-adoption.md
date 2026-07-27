# Block 3-2n-6J: Project-Wide Audiobook Progress Projection Adoption

> Status: Planned umbrella. Do not implement directly.
> Result: Split into two ordered child blocks.
> Dependencies: Block 3-2n-6H provides the canonical evaluator; Block 3-2n-6I provides exact future position evidence with approximate/unknown fallback.
> Notes: 6J-A owns service/API projection adoption. 6J-B owns browser presentation and cross-surface regression. Each child requires its own branch and verification gate.

## Goal

Make every project surface that presents, sorts, summarizes, or opens audiobook progress consume the same per-user canonical snapshot while retaining context-appropriate presentation for current position, furthest attainment, historical sessions, chapter states, quality, and provenance.

After both children are complete, no audiobook progress bar, chapter claim, completion label, or progress sort may silently derive from raw `percent_complete` when a canonical projection is required.

## Child Block Sequence

1. `block-3-2n-6j-a-service-and-api-progress-projection-adoption.md`
2. `block-3-2n-6j-b-browser-progress-presentation-and-regression.md`

Implement in order. 6J-B must consume the stable additive contract delivered by 6J-A and must not recreate audiobook progress math in browser code.

## Split Boundary

### 6J-A owns

- The complete audiobook-progress consumer inventory.
- Typed additive service/API projection fields.
- Context selection for current, furthest, session-as-of, chapter-state, and raw evidence.
- Overview, Progress, detail, Media/Continue, Timeline, People, legacy-read, sorting, CSV compatibility, and write-isolation behavior at the service/API level.
- Deterministic endpoint parity and raw-evidence preservation tests.

### 6J-B owns

- Browser rendering of the 6J-A contract.
- Current/furthest/revisit presentation across Overview, Progress, shared detail, Media Explorer, Continue Consuming, Timeline, and People drill-through.
- Responsive styling, concise copy, accessibility, and no-overflow behavior.
- Cross-surface Playwright coverage, durable dashboard invariants, and the separate live smoke gate.

## Locked Consumer Semantics

| Consumer | Canonical projection |
| --- | --- |
| Overview audiobook digest | Per-user, book, local-day session movement as of each session end |
| Progress card | Current position plus furthest trusted marker and quality |
| Progress hierarchy | Per-user chapter states from the canonical chapter ledger |
| Shared detail | The same current/furthest/chapter snapshot as Progress |
| Media Explorer | Current-position bar; explicit furthest marker when current is lower |
| Continue Consuming | Current position |
| Explorer progress sort | Furthest trusted/estimated attainment with quality-aware deterministic fallback |
| Timeline activity feed | Position as of that observation/session, not today's latest position |
| People | Canonical detail drill-through; completion wording distinguishes plays, chapters, and books |
| API callers | Typed current/furthest/session/chapter fields with quality and provenance |
| CSV/raw evidence | Original source fields remain raw and clearly named; no silent substitution |

## Shared Guardrails

- Keep Overview audiobook digests and all canonical progress snapshots per user. Household views may list multiple listeners but must not average or merge their progress.
- Preserve raw observations and the raw CSV contract.
- Approximate or unknown progress cannot trigger Copy History, Plex synchronization, or another mutation.
- Keep evaluation in the shared service/domain layer. Browser code selects and presents fields; it does not derive chapter state or position.
- Preserve route names and non-audiobook behavior unless an explicitly additive compatibility field is required.
- Do not add a materialized cache, worker, broad API version, or dashboard redesign without evidence and re-scoping.

## Umbrella Acceptance Criteria

- 6J-A and 6J-B are both implemented and independently verified in order.
- Every inventoried audiobook-progress consumer has an explicit canonical or raw-evidence projection.
- Service/API payloads and visible browser surfaces agree on current position, furthest position, session-as-of progress, chapter states, rewind/revisit state, quality, reason, and revision identity.
- Raw export and write-action isolation remain intact.
- Exact, rewind, stale/reset, approximate historical, missing-position, multi-user, and non-audiobook canaries pass.
- Desktop and narrow layouts remain concise, accessible, and free of horizontal overflow.

## Out Of Scope

- Implementing this umbrella directly.
- New position capture, notifier configuration, or activity sampling; Block 3-2n-6I owns capture.
- Changing the 6H evaluator's meanings to fit presentation.
- Rewriting raw observations or historical source percentages.
- Plex progress/watched-state writes based on derived audiobook progress.
- Transcript/resume-context work, recommendations, goals, ratings, metadata/title correction, or a general dashboard redesign.

## Verification And Exit Gate

- Each child must run `npm run verify:block` before being marked implemented.
- 6J-B must restart only the affected dashboard service and run `npm run verify:live-dashboard`.
- Do not mark 6J complete until both child results and their verification evidence are recorded.
