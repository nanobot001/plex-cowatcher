# Block 3-6-6C: First-Watch And Watch-Count Rules

> Status: Planned.
> Result: Not implemented.
> Dependency: Blocks 3-6-6A and 3-6-6B implemented and verified.

## Goal

Deliver the first bounded achievement pack using event evidence that does not require a library-wide denominator.

## Scope

- Define reviewed first-watch and watch-count milestone rules for one visible person and canonical media/category scopes.
- Count only eligible deduplicated archive events under the 3-6-6A evidence matrix.
- Preserve removed-media evidence and explicit source uncertainty.
- Add deterministic support records and recalculation fixtures.

## Out Of Scope

- Rewatch, co-watch, series/genre/library completion, rankings, or notifications.

## Likely Files Or Areas

- versioned achievement rule catalog
- achievement evaluator fixtures/tests
- bounded result read documentation

## Acceptance Criteria

- Duplicate source evidence does not inflate counts.
- Unknown/ambiguous event identity blocks only the affected result and remains explainable.
- Recovered archive evidence can unlock a result without rewriting raw history.
- Hidden listeners are excluded from public result reads.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- First-event, threshold, duplicate, removed-media, unknown, hidden-listener, and recalculation tests
