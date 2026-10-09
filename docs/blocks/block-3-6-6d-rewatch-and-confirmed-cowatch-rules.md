# Block 3-6-6D: Rewatch And Confirmed Co-Watch Rules

> Status: Planned (restructured 2026-10-09).
> Result: Not implemented.
> Dependency: Blocks 3-6-6A and 3-6-6C implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Add replay and household co-watch achievements only where existing session and confirmation evidence supports the claim.

## Scope

- Rewatch rules over distinct replays as defined by `evaluateReplaySemantics`; no separate replay logic.
- Confirmed co-watch rules over the existing People co-watch attribution, which reconciles Discord `cowatch_confirmations` with the latest non-cleared browser `cowatch_adjudications` decision.
- Preserve listener attribution, household-local day/session meaning, supporting references, and blocked/unknown states.
- Badge descriptors for every rule.
- Positive and structurally different negative fixtures.

## Out Of Scope

- Inferred/proximity co-watch achievements, changes to replay or session reconstruction, completion rules, persistence, UI.

## Likely Files Or Areas

- `src/achievements/` rule catalog entries
- evidence reader adapters over replay semantics and People attribution
- `tests/run-tests.mjs` fixtures

## Acceptance Criteria

- Same-session duplicate observations do not become a rewatch.
- A supported distinct replay can satisfy a reviewed threshold.
- Only confirmed co-watch evidence satisfies co-watch rules; inferred or unknown evidence is blocked.
- Achievement co-watch counts match the People page for the same evidence.
- Clearing an adjudication updates the result on the next read.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Replay/session, duplicate, confirmed versus inferred co-watch, adjudication clear, People parity, and conflict tests
