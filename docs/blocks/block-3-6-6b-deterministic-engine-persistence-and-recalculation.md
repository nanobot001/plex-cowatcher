# Block 3-6-6B: Earned Ledger (Deferred, Optional)

> Status: Deferred (restructured 2026-10-09).
> Result: Not implemented.
> Dependency: Blocks 3-6-6A and 3-6-6F implemented, plus a concrete trigger below.
> Direction: `docs/design/achievements-product-direction.md`.

## Why Deferred

v1 is compute-on-read and mirrors current evidence, so persistence is not needed. The original scope (result tables, dry-run/apply recalculation, restart safety, version audit) existed only to manage stored results and has been removed.

## Triggers For Activation

Open this block only when one of these is confirmed:

- Sticky awards: earned achievements must survive evidence retraction.
- "Newly earned" notifications or a change feed.
- Polished badge app or standalone app needs offline sync or award history.
- Measured evaluation latency that caching cannot solve.

## Scope (When Activated)

- Additive ledger recording first-earned `ruleId`, `version`, `user_id`, `earnedAt`, and supporting references, written from evaluator output.
- Never the source of truth for evaluation; the pure evaluator stays authoritative.
- Explicit retraction display policy (for example "previously earned").
- Contract fields added additively under a bumped `contractVersion`.

## Out Of Scope

- Replacing compute-on-read, mutating playback history, or rankings.

## Acceptance Criteria (When Activated)

- Ledger writes are idempotent and transactional; re-evaluation adds no duplicates.
- Ledger and live evaluation disagreements are explicit, never hidden.
- `npm run verify:block` passes.
