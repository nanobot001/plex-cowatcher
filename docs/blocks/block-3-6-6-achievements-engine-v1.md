# Block 3-6-6: Achievements Engine v1

> Status: Planned umbrella.
> Result: Not implemented directly.
> Notes: The original broad engine-and-rule-pack ticket has been split to keep evidence policy, deterministic infrastructure, and domain rule families independently reviewable.

## Goal

Derive small, explainable, reproducible achievements from trustworthy archive evidence without rewriting history or treating missing evidence as failure.

## Child Blocks

1. **3-6-6A — Achievement Evidence And Versioned Rule Contract**
2. **3-6-6B — Deterministic Engine, Persistence, And Recalculation**
3. **3-6-6C — First-Watch And Watch-Count Rules**
4. **3-6-6D — Rewatch And Confirmed Co-Watch Rules**
5. **3-6-6E — Series, Genre, And Library Completion Rules**

Implement 3-6-6A and 3-6-6B first. Rule-family children may proceed only when their required denominator, classification, and provenance evidence is demonstrated.

## Shared Constraints

- Every earned, blocked, and unknown result is explainable from versioned rules and supporting archive records.
- Recalculation is deterministic and idempotent.
- Inferred co-watching cannot satisfy a confirmed co-watch rule.
- Unknown library membership, genre classification, series denominator, or completion state cannot produce a completion achievement.
- No rankings, public profiles, notifications, or playback-history mutation.

## Exit Gate

The umbrella is complete only when all selected v1 rule children pass `npm run verify:block`. Block 3-6-6E remains deferred until a fresh evidence audit proves trustworthy denominators and classification coverage.

