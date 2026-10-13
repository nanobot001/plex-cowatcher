# Block 3-6-6F: Achievements Dashboard Prototype

> Status: Planned (created 2026-10-09).
> Result: Not implemented.
> Dependency: Blocks 3-6-6A, 3-6-6C, and 3-6-6D implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Make personal media achievements and identity visible in the household dashboard as an expressive, colorful **Media Passport / Showcase Shelf** on People cards, consuming only the public achievements contract to prove the contract is ready for both the dashboard and a future standalone showcase app.

## Scope

- **Four Showcase Facets** on People cards (and Person detail view):
  1. *Trophy Shelf*: Responsive shelf of completed series/anime/audiobooks using Plex poster artwork (`posterUrl`) with rewatch loyalty ribbons (Bronze/Silver/Gold).
  2. *Taste & Genre Affinity*: Colorful devotion pills/meters (e.g., hours logged in top genres, shows completed vs. paused/abandoned).
  3. *Obsession Spotlight*: Prominent card highlighting the listener's #1 most-watched show/franchise by hours.
  4. *Shared Viewing Bonds*: Chips/badges celebrating series completed 100% together with household co-watch partners.
- Honest rendering of all five states: `earned`, `in_progress`, `not_earned`, `blocked`, `unknown`. Blocked and unknown are visually distinct from not earned and never look like failure; state meaning is not conveyed by color alone.
- Explanation affordance per badge (why earned, blocked, or unknown) from contract supporting references.
- Artwork rendered from contract `posterUrl` with clean glyph/token fallbacks for non-poster milestone badges.
- Data fetched only through the 3-6-6C HTTP contract route (`GET /api/achievements`); no direct use of dashboard internals or evaluator code.
- Follows AGENTS.md layout standards: no horizontal overflow from 320px to 1440px, balanced padding, thin scrollbars, content-first sizing.

## Out Of Scope

- Standalone app development, real-time push notifications, DB persistence, external sharing APIs, manual award overrides.

## Likely Files Or Areas

- `src/web/static/dashboard.js` and `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs` and the deterministic fixture
- `docs/testing/dashboard-regression-contract.md` if a durable invariant is added

## Acceptance Criteria

- The dashboard renders personal showcase data solely from the public contract (verified by a test asserting no other achievement data path).
- The four facets (Trophy Shelf, Taste & Genre Affinity, Obsession Spotlight, Shared Viewing Bonds) render cleanly on People cards.
- Completed show posters render via `posterUrl` with rewatch ribbons; missing poster assets fall back cleanly without breaking layout.
- All five states render distinctly with accessible labels and keyboard-reachable explanations.
- Hidden listeners never appear.
- Geometry passes at 320px, 390px, 768px, 1024px, and 1440px without page-level horizontal overflow.
- Playwright coverage is extended for the new cross-surface invariant.
- `npm run verify:block` passes; `npm run verify:live-dashboard` passes after deployment.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard`
- Playwright state rendering, accessibility, hidden-listener, contract-only, and responsive geometry assertions
