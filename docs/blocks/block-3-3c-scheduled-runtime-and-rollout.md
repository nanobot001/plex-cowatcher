# Block 3-3C: Scheduled Runtime And Rollout

> Status: Planned.
> Result: Not implemented.
> Dependency: Blocks 3-3A and 3-3B implemented and verified.

## Goal

Schedule report delivery in the existing service runtime with explicit timezone, restart, catch-up, health, and rollout behavior.

## Scope

- Add independently disabled daily/weekly schedule configuration using the household timezone.
- Prefer the existing long-running service timer/runtime; introduce an external scheduler only if evidence proves the service cannot meet the contract.
- Define DST behavior, missed-run/catch-up policy, startup reconciliation, and no catch-up bursts.
- Reuse 3-3B delivery identity so restarts and overlapping ticks cannot duplicate reports.
- Add bounded health/status, next/last-run fields, operator controls, and structured privacy-safe events.
- Separate implementation from live enablement; use one approved canary period before recurring rollout.

## Out Of Scope

- Report content changes, new delivery channels, public scheduling UI, general job framework, or enabling by default.

## Likely Files Or Areas

- existing runtime scheduling/service composition
- configuration, health, CLI/tool/event contracts
- PM2/production docs and fake-clock tests

## Acceptance Criteria

- Disabled configuration schedules and sends nothing.
- Fake-clock DST, restart, delayed tick, overlap, and missed-period fixtures obey one documented catch-up policy.
- At most one logical delivery occurs per period/channel/revision.
- Health distinguishes disabled, due, running, succeeded, delayed, and failed states without sensitive data.
- `npm run verify:block` passes.
- A separately authorized live canary and restart prove one delivery, dedupe, watcher continuity, and responsive dashboard/health before recurring enablement.
- After runtime deployment, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Fake-clock schedule/restart/DST/dedupe tests
- Separately authorized live canary and `npm run verify:live-dashboard`

