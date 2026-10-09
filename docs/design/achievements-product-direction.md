# Achievements Product Direction

> Status: Locked direction, 2026-10-09.
> Applies to: Block 3-6-6 and all successors.

## Why This Matters

Achievements are a first-class product capability, not a dashboard garnish. The v1 dashboard presentation is a **prototype**. A later phase is expected to deliver polished badge artwork and may ship achievements as a **standalone application**. Every v1 decision must keep that path open.

## Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Computation model | **Compute-on-read.** A pure evaluator runs over current canonical evidence. No result tables in v1. |
| 2 | Retraction policy | **Mirror current evidence.** An achievement whose supporting evidence is retracted returns to its evidence-backed state. No sticky awards in v1. |
| 3 | Presentation | **Dashboard prototype is in v1** and consumes only the public achievements contract. |
| 4 | Planning | 3-6-6 blocks restructured to match these decisions (see `docs/blocks/README.md`). |

A persisted earned ledger is deferred. Add it only when a concrete need appears (sticky awards, "newly earned" notifications, or standalone-app offline/sync requirements). See Block 3-6-6B.

## Portability Requirements (Prototype → Product)

1. **Isolated module.** Achievement code lives in its own module (for example `src/achievements/`). It must not import dashboard services, Express, or browser code. Evidence enters through one reader interface; the evaluator is a pure function of `(ruleCatalog, evidence, context)`.
2. **Declarative rule catalog.** Rules are data: stable `ruleId`, integer `version`, `family`, `unit`, `threshold`, `scope`, evidence requirements, and a **badge descriptor** (`badgeKey`, `tier`, display title/description). Presentation hints never affect evaluation.
3. **Versioned public contract.** Results are exposed through one versioned JSON contract (`contractVersion`) shared by the localhost HTTP route, CLI/tool read command, and the dashboard. No client may reach into internal tables or evaluator internals.
4. **Stable identifiers.** `ruleId` and `badgeKey` are permanent once published. Behavior changes bump `version`; they never repurpose an id.
5. **Honest states.** Every result is one of `earned`, `in_progress`, `not_earned`, `blocked`, or `unknown`, with progress (`current`, `target`, `unit`) where meaningful. Missing evidence is never presented as failure.
6. **Explainable evidence.** Each result carries privacy-safe supporting references sufficient to explain why it holds, without private paths, tokens, upstream URLs, or raw payloads.
7. **Truthful dates.** `earnedAt` is the source event time of the evidence that crossed the threshold, or `null` when that time is unknown. It is never calculation time.
8. **Deterministic context.** Each response states its evidence watermark and household timezone so identical inputs produce identical outputs on any client.
9. **Subject identity.** Results are keyed by `user_id` and follow dashboard visibility (`COALESCE(dashboard_shown, enabled)`). Hidden listeners never appear in public reads.

## Evidence Reuse (No Parallel Logic)

- Plays: the existing canonical merged stream (Tautulli observations plus linked Plex history, deduplicated through `archive_observation_links`).
- Rewatches: `evaluateReplaySemantics` (`src/service/replaySemantics.ts`).
- Confirmed co-watch: the existing People attribution that reconciles `cowatch_confirmations` and the latest non-cleared `cowatch_adjudications` decision. Inferred co-watch never satisfies a confirmed rule.
- Audiobook units: the existing completion-fact separation (observations, passed chapters, completed books).

## Explicitly Later

Polished badge artwork, animations, tiers/rarity design, notifications, sharing, rankings, and a standalone application. These consume the v1 contract; they must not require changing evaluation semantics.
