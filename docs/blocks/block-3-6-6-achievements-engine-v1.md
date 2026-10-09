# Block 3-6-6: Achievements Engine v1

> Status: Planned umbrella (restructured 2026-10-09).
> Result: Not implemented directly.
> Notes: Restructured after architecture review. Locked direction lives in `docs/design/achievements-product-direction.md`. The v1 dashboard is a prototype; polished badges and a possible standalone app follow later, so v1 must be portable.

## Goal

Derive small, explainable, reproducible achievements from canonical watch evidence, exposed through one versioned contract that a dashboard prototype today and a polished badge experience or standalone app later can consume unchanged.

## Locked Decisions

1. **Compute-on-read.** A pure evaluator over current canonical evidence. No result tables in v1.
2. **Mirror current evidence.** Retracted evidence returns a result to its evidence-backed state. No sticky awards in v1.
3. **Dashboard prototype in v1**, consuming only the public contract.
4. **Portable module.** Achievements code does not import dashboard, server, or browser code.

## Child Blocks (implement in order)

1. **3-6-6A — Contract, Evidence Reader, And Pure Evaluator.** Rule catalog schema with badge descriptors, result contract, eligibility matrix, single evidence reader reusing existing services, deterministic evaluator. Fixture rules only.
2. **3-6-6C — First-Watch And Watch-Count Rules.** First shipped rule pack plus the read-only contract surface (localhost HTTP, CLI/tool).
3. **3-6-6D — Rewatch And Confirmed Co-Watch Rules.** Second rule pack, reusing replay semantics and People co-watch attribution.
4. **3-6-6F — Achievements Dashboard Prototype.** People-card presentation over the public contract only.

Deferred:

- **3-6-6B — Earned Ledger (optional).** Persist first-earned history only when sticky awards, notifications, or standalone-app sync require it.
- **3-6-6E — Series, Genre, And Library Completion Rules.** Pending a denominator/classification evidence audit.

Block 3-6-5A is **not** a dependency. Achievements use an internal evidence reader, not the public archive query contract.

## Shared Constraints

- Every result state (`earned`, `in_progress`, `not_earned`, `blocked`, `unknown`) is explainable from a versioned rule and privacy-safe supporting references.
- Evaluation is deterministic for a given evidence watermark and household timezone.
- Evidence comes from existing canonical sources; no parallel replay, co-watch, or deduplication logic.
- Inferred co-watching cannot satisfy a confirmed co-watch rule.
- Unknown denominators or classifications cannot produce a completion achievement.
- Results are keyed by `user_id` and respect dashboard visibility; hidden listeners never appear in public reads.
- `ruleId` and `badgeKey` are permanent once published; behavior changes bump `version`.
- No rankings, public profiles, notifications, or playback-history mutation in v1.

## Exit Gate

The v1 umbrella is complete when 3-6-6A, 3-6-6C, 3-6-6D, and 3-6-6F each pass `npm run verify:block`, and the dashboard prototype passes `npm run verify:live-dashboard` after deployment.

