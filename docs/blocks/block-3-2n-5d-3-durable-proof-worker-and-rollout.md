# Block 3-2n-5d-3: Durable Proof Worker And Rollout

> Status: Implemented with recurring rollout ready to resume as of 2026-07-12.
> Result: Implemented with limitations.
> Verification: `npm run verify:block` - passed with 100 service tests, 36 dashboard regression tests, static dashboard validation, and tool-contract verification.
> Notes: Added migration 16, unique durable proof jobs, global/job leases and heartbeat recovery, bounded completion scheduling, deterministic retries, safe activation/skip classifications, disabled-by-default same-process runtime, CLI status/canary/requeue operations, and privacy-safe health/audit summaries. The backup, corrective 5D-2A gate, disabled Eric canary, PM2 restart, audit checks, verified Progress readback, and live dashboard smoke gate passed. Recurring proof remains disabled pending the explicit 5D-3 enablement decision.

## Goal

Automatically process eligible audiobook proof work at a safe rate, survive restarts and transient failures, expose privacy-safe operations, and prove the end-to-end path with one canary before enabling the recurring worker.

## Dependencies And Entry Gate

- Blocks 3-2n-5d-1 and 3-2n-5d-2 are implemented and verified.
- Corrective Block 3-2n-5d-2A is implemented; `npm run verify:block` and the disabled Eric recovery canary passed.
- Production remains disabled until the staged canary and privacy checks pass.
- The existing manual import remains available throughout rollout and rollback.

## Scope

- Materialize exactly one durable job per `(audiobook_id, media_revision)` with states `pending`, `running`, `retry_wait`, `succeeded`, `failed_terminal`, and `unsupported_multi_file`.
- Add a same-process runtime with explicit `start`, `stop`, and deterministic `runOnce` seams.
- Use concurrency one, a renewable job lease, a 60-second heartbeat, and expired-lease recovery.
- Process at most one eligible job every 15 minutes; do not continuously drain the queue.
- Retry transient failures after 15 minutes, 1 hour, 6 hours, and 24 hours; the fifth failed attempt becomes terminal.
- Treat invalid contracts, low confidence, unsupported media shape, superseded revisions, and unavailable manifests as non-transient safe outcomes.
- Skip external invocation when the matching revision is already verified or superseded.
- Consume an outbox event only after its job or safe terminal classification commits.
- Add one structured CLI/tool surface for status, one-shot canary execution, and requeue. Writes remain dry-run by default and require explicit apply/confirmation.
- Add bounded privacy-safe proof status to health and structured audit events without a household dashboard action or public HTTP mutation route.
- Perform the staged disabled-to-canary-to-enabled production rollout.

## Out Of Scope

- New chapter-analysis logic inside CoWatcher.
- Multi-file timeline construction, file repair, chapter embedding, or public mutation routes.
- Unbounded queue draining, parallel proof workers, or a separate service process.
- Reworking Progress mapping beyond consuming the 5D-1 activation contract.

## Runtime And Retry Contract

- Completion-based scheduling persists the next eligible run and prevents restart storms.
- Transient codes include adapter unavailability, timeout, temporary file/mount unavailability, and retryable upstream failure.
- Deterministic validation, confidence, version, and media-shape failures do not retry automatically.
- Requeue is idempotent, audited, and resets only the selected existing job; it never creates a duplicate job.

## Likely Files Or Areas

- A focused proof coordinator/runtime and `src/server/app.ts`
- `src/cli/cli.ts`, health/audit contracts, and tool documentation
- SQLite job/state migration plus deterministic runtime tests

## Acceptance Criteria

- Repeated or overlapping triggers create one job and one active lease per audiobook revision.
- Expired running jobs recover after restart without duplicate external invocation.
- The worker processes no more than one eligible job per 15-minute cycle.
- Retry timing and fifth-attempt terminal behavior are deterministic under an injected clock.
- Verified unchanged revisions skip the adapter; changed revisions create exactly one new job.
- Multi-file revisions become `unsupported_multi_file` and retain fallback Progress.
- Status, canary, and requeue outputs are structured, bounded, path-safe, and compatible with tool verification.
- Dashboard responsiveness and existing workflows remain intact.

## Verification

- `npm run verify:block`
- Deterministic restart, lease, retry, throttle, skip, requeue, health, audit, and privacy tests.
- Staged live rollout: back up SQLite; deploy disabled; reconcile and inspect counts; configure the adapter; run one single-book canary; verify revision/cache/Progress/privacy; enable the worker; rebuild/restart PM2; run `npm run verify:live-dashboard`.
