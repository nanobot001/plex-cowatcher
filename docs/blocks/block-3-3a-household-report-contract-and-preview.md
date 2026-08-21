# Block 3-3A: Household Report Contract And Preview

> Status: Planned.
> Result: Not implemented.

## Goal

Produce a deterministic, bounded, source-honest household watch report preview without sending messages or scheduling work.

## Scope

- Define household-local daily and weekly half-open periods with explicit timezone and DST behavior.
- Aggregate all supported media categories, visible listeners, completed/partial activity, and confirmed co-watch evidence from existing read models.
- Label observed, confirmed, inferred, and unknown facts; do not turn missing evidence into zero or completion.
- Exclude hidden listeners and privacy-sensitive fields.
- Return a versioned structured report plus bounded Markdown preview through read-only CLI/tool behavior.
- Define stable ordering, truncation, empty-period behavior, and a report revision/fingerprint for later delivery dedupe.

## Out Of Scope

- Discord delivery, scheduling, retries, new ingestion, archive mutation, achievements, or dashboard redesign.

## Likely Files Or Areas

- new focused report service/types
- existing dashboard/archive/co-watch read services
- `src/cli/cli.ts`, tool manifest/surface/permissions
- service and fixture tests

## Acceptance Criteria

- Fixed-clock daily/weekly fixtures produce stable household-local periods and identical repeated output.
- All media categories and visible listeners are represented without leaking hidden users.
- Evidence labels and unknown values remain source-honest.
- Structured and Markdown outputs are bounded, escaped, and share one revision identity.
- Preview is read-only and cannot send or schedule anything.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Fixed-clock/DST, aggregation, privacy, evidence, ordering, bounds, and tool-contract tests

