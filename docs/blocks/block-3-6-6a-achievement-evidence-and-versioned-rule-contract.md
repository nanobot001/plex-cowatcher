# Block 3-6-6A: Achievement Evidence And Versioned Rule Contract

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-6-1 provenance closure and Block 3-6-5A query contract.

## Goal

Define the stable rule, evidence, support, blocked, and unknown vocabulary required before calculating achievements.

## Scope

- Define versioned rule IDs, versions, display copy, thresholds, evidence requirements, result states, and supporting-record references.
- Map eligible archive evidence for first watch, counts, rewatch, confirmed co-watch, series, genre, and library completion.
- Distinguish earned, not-yet-earned, blocked, and unknown; missing evidence is never a negative fact.
- Define rule-version migration/recalculation behavior and privacy-safe read contracts.
- Use fixtures only; do not implement calculation or persistence.

## Out Of Scope

- Engine execution, result tables, concrete threshold tuning, notifications, rankings, or UI.

## Likely Files Or Areas

- achievement rule/result types and contract schemas
- archive evidence eligibility documentation
- synthetic contract fixtures and service tests

## Acceptance Criteria

- The contract can express every proposed v1 family without source-specific special cases.
- Evidence matrices reject inferred co-watch for confirmed rules and unknown denominators for completion rules.
- Supporting records remain explainable and privacy-safe.
- Rule version changes have explicit compatibility/recalculation semantics.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Contract/schema fixtures for earned, blocked, unknown, conflicting, and version-change cases
