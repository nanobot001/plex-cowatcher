# Block 3-2n-6D-3: Stable-Stop Reconciliation Worker And Rollout

> Status: Planned, revised after 6I.
> Result: Not implemented.
> Notes: Discover eligible work by bounded reconciliation over durable `audiobook_position_evidence`; do not attach a competing capture hook to ingestion.

## Goal

Safely turn eligible exact 6I audiobook stops into private bounded resume excerpts while keeping playback ingestion responsive and resource use explicitly controlled.

## Scope

- On startup and a low-frequency tick, reconcile a bounded recent window of durable exact position-evidence rows into 6D-2 jobs.
- Require direct finite offset, explicit source stop time, visible linked listener/book, current single-file revision, duration consistency, and partial—not completed—book state.
- Apply a configurable quiet period, default 15 minutes. A newer eligible stop for the same listener/book/revision supersedes older pending work.
- Revalidate evidence, revision, duration, completion, and supersession immediately before invocation and before activating output.
- Process at most one job per tick and one concurrently with leases, heartbeat, timeout, process-tree termination, capped retry/backoff, and restart recovery.
- Clip only listened history ending at the validated stop, with a maximum 60-second window.
- Add bounded status and one confirmed canary/requeue operation through the existing CLI/tool surface. Writes are dry-run by default and require explicit apply plus confirmation.
- Keep the worker independently disabled until deterministic verification, backup, runtime/model probe, explicit canary, resource readback, cleanup proof, watcher continuity, and dashboard responsiveness pass.

## Out Of Scope

- Tautulli notifier/webhook changes, activity polling, another exact-position table, or ingestion-time job publication.
- Dashboard presentation, multi-file mapping, completed-book context, percentage-only clipping, cloud APIs, summaries, or transcript retention.
- Automatically enabling the worker as part of implementation.

## Likely Files Or Areas

- resume-context service and runtime composition
- configuration, health, CLI/tool, permissions, and event contracts
- fake adapter/clock fixtures and service tests
- production rollout and recovery documentation

## Acceptance Criteria

- Eligible durable evidence creates one job after the quiet period; repeated ticks and PM2 restarts do not duplicate it.
- Missing/approximate/stale/completed/hidden/unlinked/multi-file/revision-mismatched evidence never launches transcription.
- Newer evidence supersedes stale work and stale running output cannot activate.
- Disabled configuration launches no child and leaves capture, proof, progress, and ingestion unchanged.
- Status/events/health are bounded and contain no excerpt, path, child output, model-cache detail, or raw error.
- The implementation branch passes `npm run verify:block`.
- A separately authorized enablement canary proves resource policy, cleanup, watcher continuity, and read responsiveness before recurring execution is enabled.
- After deployed runtime change, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Fake-clock/fake-adapter reconciliation, quiet-period, dedupe, supersession, retry, restart, concurrency, and disabled tests
- CLI/tool/event/health privacy and confirmation tests
- Separately authorized backed-up local canary followed by `npm run verify:live-dashboard`
