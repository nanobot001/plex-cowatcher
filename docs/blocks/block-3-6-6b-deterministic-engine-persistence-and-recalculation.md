# Block 3-6-6B: Deterministic Engine, Persistence, And Recalculation

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-6-6A implemented and verified.

## Goal

Build a deterministic engine and idempotent result store before adding domain rule packs.

## Scope

- Evaluate versioned rules over a fixed archive snapshot/query boundary.
- Persist rule version, subject, result state, safe supporting-record references, calculation revision, and timestamps.
- Recalculate idempotently, replace only the intended rule/version/subject result set, and preserve auditability.
- Support dry-run diffs and bounded confirmed apply through existing CLI/tool conventions.
- Add fixture-only demonstration rules that are not shipped as user-facing achievements.

## Out Of Scope

- Production rule families, scheduled recalculation, dashboard presentation, notifications, or archive mutation.

## Likely Files Or Areas

- achievement evaluator/service and types
- additive result-state migration/database methods
- CLI/tool dry-run/apply operation and event contract
- deterministic engine fixtures/tests

## Acceptance Criteria

- Identical snapshot/rules produce identical ordered results and no duplicate persistence.
- Dry-run shows bounded adds/changes/removals without writing.
- Apply is confirmed, transactional, restart-safe, and preserves prior rule-version audit evidence.
- Unknown/blocked results remain distinct from not earned.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Determinism, idempotency, transaction, restart, version, dry-run/apply, and audit tests
