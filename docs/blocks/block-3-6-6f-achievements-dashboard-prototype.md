# Block 3-6-6F: Achievements Dashboard Prototype

> Status: Planned (created 2026-10-09).
> Result: Not implemented.
> Dependency: Blocks 3-6-6A, 3-6-6C, and 3-6-6D implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Make achievements visible in the household dashboard as a **prototype** that consumes only the public achievements contract, proving the contract is sufficient for a later polished badge experience or standalone app.

## Scope

- Achievements section on People cards (and the person detail view if one exists) showing each result's state, progress, and `earnedAt`.
- Honest rendering of all five states: `earned`, `in_progress`, `not_earned`, `blocked`, `unknown`. Blocked and unknown are visually distinct from not earned and never look like failure; state meaning is not conveyed by color alone.
- Explanation affordance per result (why earned, blocked, or unknown) from contract supporting references.
- Placeholder badge visuals derived from `badgeKey` and `tier` only (for example a neutral token or glyph). No final artwork.
- Data fetched only through the 3-6-6C HTTP contract route; no direct use of dashboard internals or evaluator code.
- Follows AGENTS.md layout standards: no horizontal overflow from 320px to 1440px, balanced padding, thin scrollbars, content-first sizing.

## Out Of Scope

- Polished badge artwork, animations, rarity/tier design, notifications, sharing, rankings, standalone app, persistence.

## Likely Files Or Areas

- `src/web/static/dashboard.js` and `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs` and the deterministic fixture
- `docs/testing/dashboard-regression-contract.md` if a durable invariant is added

## Acceptance Criteria

- The dashboard renders achievements solely from the public contract (verified by a test asserting no other achievement data path).
- All five states render distinctly with accessible labels and keyboard-reachable explanations.
- Hidden listeners never appear.
- Geometry passes at 320px, 390px, 768px, 1024px, and 1440px without page-level horizontal overflow.
- Playwright coverage is extended for the new cross-surface invariant.
- `npm run verify:block` passes; `npm run verify:live-dashboard` passes after deployment.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard`
- Playwright state rendering, accessibility, hidden-listener, contract-only, and responsive geometry assertions
