# Block 3-3B: Discord Delivery And Idempotency

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-3A implemented and verified.

## Goal

Deliver one reviewed household report to an approved Discord channel with durable idempotency and safe restart/retry behavior.

## Scope

- Send only a 3-3A report revision through the existing Discord adapter.
- Add a manually invoked dry-run-first operation requiring explicit apply and confirmation.
- Persist a uniqueness identity equivalent to period, channel, and report revision plus bounded status/audit fields.
- Escape Discord content, enforce message/section limits, and split deterministically when needed.
- Retry only safe transient failures; reconcile uncertain delivery without blindly duplicating a message.
- Keep delivery disabled by default and expose privacy-safe bounded status.

## Out Of Scope

- Scheduling, catch-up, channel discovery, Discord redesign, report calculation changes, or delivery to other platforms.

## Likely Files Or Areas

- report delivery service and additive migration/state
- existing Discord adapter, CLI/tool surface, event log, health counts
- fake Discord tests and 3-3A fixtures

## Acceptance Criteria

- Repeated apply, retry, and PM2 restart produce at most one logical delivery for a period/channel/revision.
- Dry-run performs no send; apply requires confirmation and targets only the configured approved channel.
- Oversized reports split deterministically within Discord limits and contain escaped safe text.
- Transient, permanent, and uncertain outcomes remain distinguishable and do not leak payloads/tokens/raw errors.
- Default configuration sends nothing.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Fake Discord success/transient/permanent/uncertain, dedupe, restart, bounds, privacy, and confirmation tests
- Separately authorized one-report delivery canary, if selected

