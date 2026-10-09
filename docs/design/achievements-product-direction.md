# Achievements Product Direction

> Status: Locked direction, 2026-10-09.
> Applies to: Block 3-6-6 and all successors.

## Why This Matters

Achievements are a first-class product capability, not a generic gamer-score checklist or dashboard garnish. 

The vision is an expressive, colorful **Personal Media Showcase**: an at-a-glance celebration of what each household member genuinely enjoys and invests time in (e.g. anime devotion, standout genres, hours logged, specific series completed, and rewatch loyalty).

The v1 dashboard presentation is a **portable prototype** feeding a future polished standalone badge application. Every v1 decision must keep that path open.

## Core Taxonomy: Four Showcase Facets

Rather than a flat list of generic milestones, a person's achievements are structured across four storytelling facets:

1. **The Trophy Shelf (Series & Franchise Mastery)**:
   - Dynamic badges for completed TV series, anime, or audiobook books.
   - **Poster-backed visuals**: Badges reference existing Plex poster artwork, rendering as colorful miniature poster tiles with metallic laurels / ribbons.
   - **Rewatch loyalty levels**: Badges level up when a show is rewatched (Bronze for finished once, Silver/Gold for 2× or 3× rewatches).
2. **Taste & Genre Affinity Badges**:
   - Celebrates genre devotion (e.g., *Anime Devotee (Level 3)*, *Sci-Fi Explorer*, *True Crime Sleuth*) based on hours logged and series completed.
   - Tracks viewing health: shows started vs. completed in that category.
3. **The Obsession Spotlight (Superlatives)**:
   - Dynamic spotlight on their #1 most-watched show or franchise by hours invested this period.
4. **Shared Viewing Bonds (Co-Watch Badges)**:
   - Highlights series or movies finished 100% together with another household member (e.g. *Justin & Tony: Completed Attack on Titan Season 4 together*).

## Locked Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Computation model | **Compute-on-read.** A pure evaluator runs over current canonical evidence. Enables dynamic show mastery without hardcoded database rules. |
| 2 | Retraction policy | **Mirror current evidence.** An achievement whose supporting evidence is retracted returns to its evidence-backed state. No sticky awards in v1. |
| 3 | Presentation | **Dashboard prototype is in v1** and consumes only the public achievements contract. Renders the Person Showcase on People cards. |
| 4 | Visuals | **Poster-backed show tiles** using Plex artwork plus declarative tier styling (Bronze, Silver, Gold, Platinum). |
| 5 | Planning | 3-6-6 blocks restructured to deliver this showcase model in order (3-6-6A → 3-6-6C → 3-6-6D → 3-6-6F). |

A persisted earned ledger is deferred (Block 3-6-6B) and activated only when permanent trophy memories, push notifications, or offline sync are required.

## Portability Requirements (Prototype → Product)

1. **Isolated module.** Achievement code lives in its own module (`src/achievements/`). It must not import dashboard services, Express, or browser code. Evidence enters through one reader interface; the evaluator is a pure function of `(ruleCatalog, evidence, context)`.
2. **Declarative rule & showcase catalog.** Rules and dynamic badges are data: stable `ruleId`, integer `version`, `family`, `unit`, `threshold`, `scope`, evidence requirements, and a **badge descriptor** (`badgeKey`, `tier`, display title/description, `posterUrl` / `artworkKey`, and optional flavor stats). Presentation hints never affect evaluation.
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

Polished custom vector badge artwork, sound effects, push notifications, sharing, rankings, and a standalone native application. These consume the v1 contract; they must not require changing evaluation semantics.
