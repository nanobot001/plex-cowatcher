# Block 3-6-6D: Rewatch And Confirmed Co-Watch Rules

> Status: Planned.
> Result: Not implemented.
> Dependency: Blocks 3-6-6A and 3-6-6B implemented and verified.

## Goal

Add replay and household co-watch achievements only where session/provenance evidence supports the claim.

## Scope

- Define bounded rewatch milestones over evidence-backed distinct plays under current replay semantics.
- Define confirmed co-watch milestones over explicit approved co-watch evidence.
- Preserve listener attribution, household-local day/session meaning, supporting records, and blocked/unknown states.
- Add positive and structurally different negative fixtures for duplicate observations, same-day continuation, inferred co-watch, and conflicting evidence.

## Out Of Scope

- Inferred/proximity co-watch achievements, first/count rules, completion rules, or changing replay/session reconstruction.

## Likely Files Or Areas

- versioned achievement rule catalog
- replay/session and confirmed co-watch read contracts
- achievement evaluator fixtures/tests

## Acceptance Criteria

- Same-session duplicate observations do not become a rewatch.
- A supported distinct replay can satisfy a reviewed threshold.
- Only confirmed co-watch evidence satisfies co-watch rules; inferred/unknown evidence is blocked.
- Results remain deterministic and explainable after recalculation.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Replay/session, duplicate, confirmed/inferred co-watch, conflict, and recalculation tests
