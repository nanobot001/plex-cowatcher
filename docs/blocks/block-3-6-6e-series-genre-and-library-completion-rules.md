# Block 3-6-6E: Series, Genre, And Library Completion Rules

> Status: Deferred pending evidence audit.
> Result: Not implemented.
> Dependency: Blocks 3-6-6A and 3-6-6B plus trustworthy denominator/classification evidence.

## Goal

Add completion achievements only after current data proves a stable series/library denominator, classification authority, and completion rule for each supported category.

## Evidence-First Entry Gate

- Audit current series membership, genre/classification coverage, library visibility, removed media, editions, specials/extras, hidden listeners, and completion evidence.
- Identify one positive and one structurally different negative canary per proposed rule family.
- If denominators or classifications are incomplete/unstable, keep the affected rule family deferred rather than coding a heuristic.

## Scope

- Define only evidence-supported series, genre, and library completion rules.
- Version denominator snapshots and classification provenance used by each result.
- Recalculate when trustworthy membership/classification evidence changes.
- Preserve blocked/unknown results when completeness cannot be established.

## Out Of Scope

- Title/author/series allowlists, external provider disclosure without authorization, inferred membership, recommendations, or forcing every proposed family into v1.

## Likely Files Or Areas

- archive/catalog classification and denominator read contracts
- versioned achievement rule catalog
- read-only audit tooling/queries and deterministic fixtures

## Acceptance Criteria

- Every implemented rule names a reproducible denominator and classification authority.
- Removed/replaced items and editions have explicit inclusion semantics.
- Unknown membership/completion blocks the result instead of producing a false achievement.
- Rule families lacking evidence remain deferred with recorded gaps.
- `npm run verify:block` passes for any selected implementation.

## Verification

- Read-only current-data audit
- `npm run verify:block`
- Denominator, classification, removal/replacement, unknown, and recalculation tests
