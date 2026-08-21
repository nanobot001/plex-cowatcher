# Block 3-3: Household Watch Reports

> Status: Planned umbrella.
> Result: Not implemented directly.
> Notes: The original broad report ticket has been split into three independently verifiable children.

## Goal

Provide source-honest household watch reports with bounded previews, explicit delivery, and restart-safe scheduling without coupling report calculation to Discord or the Windows runtime.

## Child Blocks

1. **3-3A — Household Report Contract And Preview:** Define periods, evidence vocabulary, privacy rules, deterministic aggregation, and bounded read-only preview.
2. **3-3B — Discord Delivery And Idempotency:** Add manually confirmed Discord delivery with durable dedupe and safe retry.
3. **3-3C — Scheduled Runtime And Rollout:** Add timezone-aware scheduling, catch-up policy, health/operator controls, and a controlled live canary.

Implement the children in order. Do not implement this umbrella directly.

## Shared Constraints

- Use household-local reporting periods and include all supported media categories.
- Exclude hidden listeners and preserve observed, confirmed, inferred, and unknown evidence labels.
- Delivery and scheduling remain disabled until their own child gates pass.
- Reuse the existing service process, database, Discord adapter, event log, health model, CLI/tool conventions, and PM2 runtime unless evidence proves they cannot satisfy a child.
- No report child may rewrite playback, archive, progress, or co-watch evidence.

## Exit Gate

The umbrella is complete only when 3-3A, 3-3B, and 3-3C are implemented, independently verified with `npm run verify:block`, and the scheduled runtime has passed its separately authorized live canary and `npm run verify:live-dashboard` where deployment changed.
