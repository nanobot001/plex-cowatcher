# Block 3-2n-6E-2C2: Dashboard-Wide Artwork Adoption And Compatibility

> Status: Implemented on 2026-07-14.
> Result: Implemented.
> Verification: `npm run verify:block` passed (107/107 service and integration tests; 45/46 dashboard regression cases, with the one remaining case being the intentional narrow duplicate-project skip; dashboard syntax and tool-contract verification also passed).
> Notes: Every current dashboard artwork consumer now adopts the verified 6E-2C1 resolver through one canonical descriptor. `artworkUrl` remains the exact compatibility alias of `posterUrl`, Movie detail uses the same canonical rating-key identity as cards, and deterministic desktop and narrow-viewport coverage proves cross-surface parity plus reload-visible Audiobook source changes.

## Goal

Make every dashboard artwork consumer use one canonical private poster identity and revision so cards, detail workspaces, and other current surfaces cannot show different covers for the same title. Preserve additive compatibility while locking source-change reload behavior into the deterministic browser contract.

## Dependencies And Entry Gate

- 6E-2C1 is implemented and has passed `npm run verify:block`.
- The shared non-Progress detail workspace and its private poster/backdrop fields remain the presentation authority until 6E-3 migrates Progress detail.

## Scope

- Inventory every production consumer found through `artworkUrl`, `posterUrl`, `backdropUrl`, and literal `/api/artwork` construction in service and browser code.
- Add one typed artwork descriptor/builder for canonical identity, opaque revision, poster URL, and optional backdrop URL where the surface supports it.
- Add canonical `posterUrl` to current dashboard item contracts while preserving `artworkUrl` as the exact poster compatibility alias; do not remove or repurpose existing fields.
- Migrate Overview, Activity/Timeline, Media Explorer/Library, People drill-throughs, Progress cards, and any additional discovered artwork consumer to the shared builder. Progress detail remains on its existing dialog until 6E-3.
- Ensure all consumers use the same canonical Audiobook identity and local authoritative cover rather than constructing competing rating-key routes.
- Keep missing-art UI fallbacks intentional and variant-specific; poster failure must not cause portrait art to be used as a backdrop.
- Extend the isolated fixture so artwork can change while the fixture server remains running, then prove reload parity without external services or PM2.
- Extend the durable dashboard regression contract with canonical cross-surface artwork, legacy alias, private revision, and source-change reload invariants.

## Out Of Scope

- Altering hero overlay, crop, focal point, dimensions, or other visual composition.
- Migrating Progress detail or removing `#progress-dialog`.
- Removing `artworkUrl`, changing public tool names, database migrations, new providers, image processing, generated artwork, or background refresh jobs.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `tests/run-tests.mjs`
- `tests/e2e/fixture-server.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- Every production artwork consumer identified by the inventory uses the shared canonical builder; no independent literal route construction remains outside that builder or the private proxy implementation.
- For a single canonical title, all current card/list surfaces and the shared detail workspace resolve the same poster identity and current opaque revision.
- A valid local Audiobook cover is identical across Overview, other current consumers, and detail. Changing it while the fixture server remains running changes the rendered image after reload without server restart or cache clearing.
- Stale Movie and TV-family identities continue to resolve through 6E-2C1 from every migrated entry surface.
- `artworkUrl` remains present and equals `posterUrl` for compatibility wherever the former field already existed.
- Backdrop URLs remain private and separate from poster URLs; missing backdrops retain the established gradient/fallback behavior without portrait stretching.
- The deterministic dashboard suite covers desktop and narrow entry/detail parity, source mutation/reload, missing-art fallback, and absence of leaked upstream source data.
- `npm run verify:block` passes before the block is marked implemented.

## Verification

- API contract tests for canonical descriptor and `artworkUrl === posterUrl` compatibility.
- Deterministic Playwright checks across every current artwork-bearing dashboard surface.
- In-process fixture source-change and reload check.
- `npm run verify:block`
