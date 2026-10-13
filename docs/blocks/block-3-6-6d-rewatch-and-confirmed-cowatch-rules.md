# Block 3-6-6D: Rewatch And Confirmed Co-Watch Rules

> Status: Implemented (2026-10-11).
> Result: Implemented and verified (168/168 tests passed, full block gate passed).
> Dependency: Blocks 3-6-6A and 3-6-6C implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Add replay, show completion, and household co-watch achievements only where existing session, catalog, and confirmation evidence supports the claim — powering the **Trophy Shelf** (completed shows with poster art and rewatch ribbons) and **Shared Viewing Bonds** (series watched together).

## Scope

- **Show Mastery & Trophy Shelf**: Completed show badges backed by Plex poster artwork (`posterUrl`) awarded when a series or anime has 100% completed episodes.
- **Rewatch Loyalty Ribbons**: Multi-tier badges/ribbons for distinct replays of completed shows (e.g., 2x, 3x) as defined by `evaluateReplaySemantics`; no separate replay logic or same-session duplicates.
- **Shared Viewing Bonds**: Confirmed co-watch badges celebrating shared viewing milestones and series completed together, reconciled through People co-watch attribution (Discord confirmations + browser adjudications).
- Preserve listener attribution, household-local day/session meaning, supporting references, and blocked/unknown states.
- Badge descriptors for every rule including `posterUrl` references where applicable.
- Positive and structurally different negative fixtures.

## Out Of Scope

- Inferred/proximity co-watch achievements, changes to replay or session reconstruction, raw database persistence, dashboard UI (owned by 3-6-6F).

## Likely Files Or Areas

- `src/achievements/` rule catalog entries
- evidence reader adapters over replay semantics and People attribution
- `tests/run-tests.mjs` fixtures

## Acceptance Criteria

- Completed shows earn poster-backed Trophy Shelf badges with 100% episode completion.
- Same-session duplicate observations do not count as rewatches.
- Distinct replays earn tiered Rewatch Loyalty ribbons/badges.
- Only confirmed co-watch evidence satisfies Shared Viewing Bond rules; inferred or unknown evidence is blocked.
- Achievement co-watch counts match the People page for the same evidence.
- Clearing an adjudication immediately revokes/updates co-watch achievements on the next read.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Replay/session, duplicate, confirmed versus inferred co-watch, adjudication clear, People parity, and conflict tests
