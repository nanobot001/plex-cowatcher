# Block 3-6-6C: First-Watch And Watch-Count Rules

> Status: Implemented (2026-10-11).
> Result: Implemented.
> Dependency: Block 3-6-6A implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Ship the first real achievement pack (Volume Milestones and Taste & Genre Affinity rules) and the read-only public contract surface (`/api/achievements` HTTP route and `plex-cowatch achievements` CLI tool) that the dashboard prototype and future clients will consume.

## Scope

- **Volume Milestones**: Reviewed first-watch and watch-count rules per visible person and canonical category (movie, TV, anime, audiobook), each declaring its `unit` and badge descriptor (`badgeKey`, `tier`, title, description).
- **Taste & Genre Affinity Rules**: Devotion badges for standout categories and genres (e.g. *Anime Devotee*, *Sci-Fi Explorer*, *Cinephile*) calculating hours logged, completed items, and started vs. completed ratios.
- Tagged with `facet: 'taste_affinity'`.
- Count only eligible, deduplicated evidence through the 3-6-6A reader.
- Preserve removed-media evidence and explicit source uncertainty.
- **Read-only contract surface:** one localhost HTTP route (`/api/achievements`) and one CLI/tool read command (`plex-cowatch achievements`) returning the 3-6-6A versioned contract. Update `docs/tool-manifest.yaml`, `docs/tool-surface.md`, and `docs/permissions.md`.

## Out Of Scope

- Series-specific mastery badges (Block 3-6-6D), rewatches (3-6-6D), co-watch bonds (3-6-6D), dashboard UI (3-6-6F), persistence, notifications, rankings.

## Likely Files Or Areas

- `src/achievements/` rule catalog entries and category/genre evaluator logic
- `src/server/routes.ts` read route and `src/cli/cli.ts` read command
- tool manifest, surface, and permissions docs
- `tests/run-tests.mjs` fixtures

## Acceptance Criteria

- Duplicate or linked source evidence does not inflate counts.
- Each rule names its unit; audiobook observations are never counted as books.
- Genre affinity rules calculate hours and distinct items accurately without mutating raw history.
- Unknown or ambiguous event identity blocks only the affected result and stays explainable.
- Recovered archive evidence can unlock a result without rewriting raw history.
- HTTP and CLI return identical contract payloads; hidden listeners and private fields are absent.
- `npm run verify:block` passes, including `verify:tools`.

## Verification

- `npm run verify:block`
- First-event, threshold, duplicate, removed-media, unknown, hidden-listener, unit, and HTTP/CLI parity tests
