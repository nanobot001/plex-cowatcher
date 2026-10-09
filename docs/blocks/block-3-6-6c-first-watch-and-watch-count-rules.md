# Block 3-6-6C: First-Watch And Watch-Count Rules

> Status: Planned (restructured 2026-10-09).
> Result: Not implemented.
> Dependency: Block 3-6-6A implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Ship the first real achievement pack and the read-only public contract surface that the dashboard prototype and any future client will consume.

## Scope

- Reviewed first-watch and watch-count rules per visible person and canonical category, each declaring its `unit` (for example distinct movies, distinct episodes, completed audiobook books) and a badge descriptor.
- Count only eligible, deduplicated evidence through the 3-6-6A reader.
- Preserve removed-media evidence and explicit source uncertainty.
- **Read-only contract surface:** one localhost HTTP route and one CLI/tool read command returning the 3-6-6A versioned contract. Update `docs/tool-manifest.yaml`, `docs/tool-surface.md`, and `docs/permissions.md`.

## Out Of Scope

- Rewatch, co-watch, completion families, dashboard UI, persistence, notifications, rankings.

## Likely Files Or Areas

- `src/achievements/` rule catalog entries
- `src/server/routes.ts` read route and `src/cli/cli.ts` read command
- tool manifest, surface, and permissions docs
- `tests/run-tests.mjs` fixtures

## Acceptance Criteria

- Duplicate or linked source evidence does not inflate counts.
- Each rule names its unit; audiobook observations are never counted as books.
- Unknown or ambiguous event identity blocks only the affected result and stays explainable.
- Recovered archive evidence can unlock a result without rewriting raw history.
- HTTP and CLI return identical contract payloads; hidden listeners and private fields are absent.
- `npm run verify:block` passes, including `verify:tools`.

## Verification

- `npm run verify:block`
- First-event, threshold, duplicate, removed-media, unknown, hidden-listener, unit, and HTTP/CLI parity tests
