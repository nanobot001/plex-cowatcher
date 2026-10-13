# Block 3-6-6A: Contract, Evidence Reader, And Pure Evaluator

> Status: Implemented on 2026-10-09.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (159/159 unit tests, 79 browser regression specs, tools verified).
> Notes: Built isolated `src/achievements/` engine with pure evaluator, evidence reader reusing canonical play streams, replay semantics, and People co-watch attribution, and published `docs/data/achievements-contract.md`.
> Dependency: Block 3-6-1 (timestamp provenance fix). Not dependent on 3-6-5A.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Build the portable foundation every later achievement block and future client depends on: a declarative rule catalog, a versioned result contract, one evidence reader over existing canonical sources, and a deterministic pure evaluator. Ship no user-facing achievements yet.

## Scope

- **Isolated module** (for example `src/achievements/`) with no imports from dashboard services, Express, or browser code.
- **Rule catalog schema:** stable `ruleId`, integer `version`, `family`, `unit`, `threshold`, `scope`, evidence requirements, and a badge descriptor (`badgeKey`, `tier`, title, description). Presentation fields never affect evaluation.
- **Result contract** with `contractVersion`, evidence watermark, household timezone, and per-subject results in exactly one state: `earned`, `in_progress`, `not_earned`, `blocked`, `unknown`. Include progress (`current`, `target`, `unit`), `earnedAt` (source event time or `null`), and privacy-safe supporting references.
- **Evidence-eligibility matrix** (carried from 3-6-1, which closed without it): which evidence may satisfy first-watch, counts, rewatch, confirmed co-watch, and completion families, and what must remain `blocked` or `unknown`. Record it in `docs/data/`.
- **One evidence reader** reusing existing logic only:
  - canonical merged play stream (observations plus linked Plex history, deduplicated via `archive_observation_links`);
  - `evaluateReplaySemantics` for replay meaning;
  - People co-watch attribution reconciling `cowatch_confirmations` with the latest non-cleared `cowatch_adjudications` decision;
  - existing audiobook unit separation (observations, passed chapters, completed books).
- **Deterministic evaluator:** pure function of `(catalog, evidence, context)`; stable ordering; watermark = highest observation, archive event, confirmation, and adjudication ids.
- **Subject identity:** `user_id`, filtered by `COALESCE(dashboard_shown, enabled)`.
- Fixture-only demonstration rules; nothing is exposed to users.

## Out Of Scope

- Shipped rules, HTTP/CLI surfaces, dashboard UI, result tables, persistence, scheduling, notifications.
- New replay, co-watch, or deduplication logic.

## Likely Files Or Areas

- `src/achievements/` (types, catalog schema, evaluator, evidence reader)
- thin adapters over existing replay, People attribution, and canonical play-stream reads
- `docs/data/achievements-contract.md` (contract plus eligibility matrix)
- `tests/run-tests.mjs` fixtures

## Acceptance Criteria

- The catalog can express first-watch, count, rewatch, confirmed co-watch, and completion families without source-specific special cases.
- The module has no imports from dashboard, server, or browser code.
- Identical evidence watermark and timezone produce byte-identical ordered results.
- Linked Tautulli and Plex history plays are counted once.
- Inferred co-watch cannot satisfy a confirmed rule; unknown denominators block completion; missing evidence yields `unknown`, never `not_earned`.
- A cleared adjudication changes the result on the next evaluation (mirror-current-evidence policy).
- `earnedAt` is the crossing event's source time, or `null` when unknown.
- Hidden listeners are absent from results.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Fixtures: earned, in-progress, blocked, unknown, duplicate-linked play, inferred versus confirmed co-watch, adjudication clear, hidden listener, rule version bump, timezone determinism
