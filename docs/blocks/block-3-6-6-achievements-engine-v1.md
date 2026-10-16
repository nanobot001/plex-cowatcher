# Block 3-6-6: Achievements Engine v1

> Status: Planned umbrella (restructured 2026-10-09).
> Result: Not implemented directly.
> Notes: Restructured after architecture review. Locked direction lives in `docs/design/achievements-product-direction.md`. The v1 dashboard is a prototype; polished badges and a possible standalone app follow later, so v1 must be portable.

## Goal

Derive small, explainable, reproducible achievements and personal media showcase profiles from canonical watch evidence, exposed through one versioned contract that a dashboard prototype today and a polished badge experience or standalone app later can consume unchanged.

## Showcase Facets

1. **The Trophy Shelf (Series & Franchise Mastery)**: Completed TV shows, anime, or audiobook books, backed by Plex poster artwork and rewatch loyalty ribbons.
2. **Taste & Genre Affinity**: Devotion levels for standout genres (e.g. *Anime Devotee*, *Sci-Fi Explorer*) with hours logged and started vs. completed counts.
3. **The Obsession Spotlight (Superlatives)**: Highlights the single most-watched show or franchise by hours invested.
4. **Shared Viewing Bonds (Co-Watch Badges)**: Commemorates shows and franchises completed together.

## Locked Decisions

1. **Compute-on-read.** A pure evaluator over current canonical evidence. Enables dynamic show mastery without hardcoded database tables.
2. **Mirror current evidence.** Retracted evidence returns a result to its evidence-backed state. No sticky awards in v1.
3. **Dashboard prototype in v1**, consuming only the public contract to render a colorful Person Showcase on People cards.
4. **Poster-backed visuals.** Show badges dynamically leverage Plex poster artwork with declarative laurel/ribbon styling.
5. **Portable module.** Achievements code does not import dashboard, server, or browser code.

## Child Blocks (implement in order)

1. **3-6-6A — Contract, Evidence Reader, And Pure Evaluator.** (Implemented 2026-10-09) Rule catalog schema with badge descriptors, result contract, eligibility matrix, single evidence reader reusing existing services, deterministic evaluator.
2. **3-6-6C — Volume Milestones, Genre Affinity Rules, And Public Contract Surface.** (Implemented 2026-10-10) Volume milestones, category/genre devotion rules (hours & counts), and the read-only contract surface (localhost HTTP `/api/achievements`, CLI/tool `plex-cowatch achievements`).
3. **3-6-6D — Series Mastery, Rewatch Loyalty, And Shared Viewing Bonds.** (Implemented 2026-10-11) Dynamic show completion badges using Plex poster artwork, rewatch tier ribbons (1×, 2×, 3×), and confirmed co-watch bond badges.
4. **3-6-6F — Personal Showcase Dashboard Prototype.** (Implemented 2026-10-12) People-card and `/achievements` showcase: colorful trophy shelf of poster tiles, genre affinity tags, and the Obsession spotlight over the public contract only.
5. **3-6-6G — Audiobook Mastery, In-Progress Book Trophies, And Series Collections.** (Planned 2026-10-16) Dynamic cover-art Book Mastery trophies (`in_progress` and `earned`) from `audiobook_position_evidence`, author/series rollups, and expanded book/hour milestone tiers.
6. **3-6-6H — Movie Franchise Collections, Rewatch Favorites, And Expanded Genre/Era Tiers.** (Planned 2026-10-16) Dynamic Movie Franchise/Collection trophies (`in_progress`, `caught_up`, `earned`), Cult-Classic Rewatch Favorite movie trophies (`2x+`), and multi-tier movie volume/genre/era badge chains.
7. **3-6-6I — Multi-Media Trophy Shelf Filters, Modal Presenters, And Cross-Media Obsession Spotlight.** (Planned 2026-10-16) Media category filter pills (`All | TV | Anime | Movies | Audiobooks`), media-appropriate detail modal presenters, and cross-media Obsession Spotlight parity.

Deferred:

- **3-6-6B — Earned Ledger (optional).** Persist first-earned history only when sticky awards, notifications, or standalone-app sync require it.
- **3-6-6E — Series, Genre, And Library Completion Rules.** Denominator/classification evidence audit for library-wide completions.

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

