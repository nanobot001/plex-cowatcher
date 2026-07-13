# Block 3-2n-6D-3: Stable-Stop Worker And Rollout

> Status: Planned.
> Result: Not implemented.
> Notes: Third child of 3-2n-6D. Connect source-backed Tautulli history stops to the proven 6D-2 adapter/state through a disabled, restart-safe, one-job background runtime and explicit canary rollout.

## Goal

Automatically create one private resume excerpt from a trustworthy partial audiobook history stop while keeping ingestion responsive and bounding CPU, memory, retries, queue growth, and operational exposure.

## Stop Semantics And Assumptions

- CoWatcher polls Tautulli `get_history`; it does not currently consume a live pause/stop event stream.
- Current normalization prefers Tautulli `date` over `stopped` for legacy `watched_at`. Preserve a new optional source `stopped_at` from raw `stopped`; never reinterpret existing `watched_at`.
- An eligible candidate is an ended audiobook history-session row with direct finite source `view_offset`, explicit source `stopped_at`, linked visible listener/book, current single-file revision, and partial—not completed—book state.
- Lock through fixtures/canary that raw Tautulli `view_offset` and `duration` used for clipping are milliseconds. Do not reuse the dashboard's display-oriented seconds/milliseconds heuristic; ambiguous or inconsistent units are unsupported.
- A candidate becomes stable after a configurable quiet period, default 15 minutes, with no newer eligible observation for the same listener/book.
- This block does not claim to detect unrelated active playback. Structural resource limits and the quiet period are the controls for this phase.

## Scope

- Extend normalized history/playback evidence additively with optional source `stopped_at` and any required direct-offset provenance while preserving existing fields and behavior.
- Publish an idempotent candidate after an eligible observation commits. Candidate-publication failure must not fail or roll back playback ingestion.
- Reconcile a bounded recent observation window on startup/tick so transient publication failure or restart cannot permanently miss a candidate.
- Use 6D-2 uniqueness and a 30-second offset bucket. A newer stop outside that bucket supersedes older pending work for the same listener/book/revision.
- Add independently disabled resume configuration: enabled flag, quiet minutes, run interval, clip duration capped at 60 seconds, executable/script/model, timeout, and fixed one-thread/one-worker policy.
- At execution, require explicit `stopped_at`, direct validated millisecond offset, current single-file manifest, one private revision item, duration consistency, and non-completed current evidence.
- Resolve the private file path from the immutable manifest only inside the trusted invocation. Never duplicate it into job/result/log/tool/event state.
- Clip only history before the stop: `end = validated stop`, `start = max(0, end - configured duration)`. Never include unheard future audio or clamp an invalid end.
- Process at most one eligible job per low-frequency tick and one concurrently. Use leases/heartbeats, bounded timeout, process-tree termination, capped retry/backoff, restart recovery, and at most one launch per tick.
- Re-check newest observation, media revision, direct offset, and supersession immediately before invocation and before completion; stale output cannot activate.
- Treat empty/no-speech-dominant output as a safe no-context result. Store only the 6D-2 bounded excerpt and safe provenance.
- Add a CLI-only `project.audiobook_resume_context` operation for bounded status, one confirmed canary, and idempotent requeue of one existing non-running job. Status is read-only; canary/requeue are dry-run by default and require explicit apply plus confirmation.
- Record safe structured events and health counts without excerpt text, paths, child output, model-cache details, or raw errors.
- Keep runtime disabled until deterministic tests, database backup, runtime/model probe, one explicit canary, resource readback, cleanup, watcher continuity, and live dashboard responsiveness pass.

## Out Of Scope

- Dashboard/API projection; 6D-4 owns presentation.
- Paraphrased summaries, LLMs, cloud APIs, transcript search/archive, or retaining raw 6D-1 segments.
- Tautulli `get_activity`, Plex session monitoring, a high-frequency watcher, or an idle-machine detector.
- Multi-file mapping, percentage-only clipping, completed-book context, hidden-listener processing, or transcription after the observed stop.
- Reusing chapter-proof flags/queues or enabling resume because proof is enabled.

## Likely Files Or Areas

- `src/adapters/tautulliAdapter.ts`
- `src/types/index.ts`
- `src/service/ingestionService.ts`
- `src/service/audiobookResumeContextService.ts`
- `src/server/app.ts`
- `src/cli/cli.ts`
- `src/utils/config.ts`
- `.env.example`
- `src/service/healthService.ts`
- `tests/run-tests.mjs`
- `docs/tool-adapter-memory.md`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`
- `docs/permissions.md`
- `docs/event-log-schema.md`
- `docs/production/README.md`

## Risks And Drift Controls

- **False stop semantics:** Persist/name evidence `history_stop_candidate`, not `pause_event`; no real-time pause copy.
- **Timestamp/unit drift:** Require raw `stopped_at` and tested millisecond offsets. Never derive clip timing from legacy `watched_at`, percentage, title order, or the dashboard heuristic.
- **Ingestion coupling:** Optional publication cannot break observation storage; bounded reconciliation repairs misses.
- **CPU/memory/lag:** Exactly one inference thread/worker, below-normal child priority, one job/tick, 60-second maximum clip, no service-time model download, and explicit peak-working-set canary evidence.
- **No idle guarantee:** Do not claim the host was idle or add an activity API in this block.
- **Stale/private media:** Validate revision/duration before and after invocation; path exists only inside the trusted call.
- **Queue growth:** Coalesce superseded stops, process one per tick, bound status, and avoid catch-up bursts.
- **Transcript safety:** Text stays out of logs/events/tools. No LLM interprets it.
- **Reversibility:** Disabling resume stops publication/execution and leaves ingestion, proof, progress, and stored observations intact.

## Acceptance Criteria

- Existing `watched_at` behavior is unchanged; raw Tautulli `stopped` is preserved separately, and rows without explicit `stopped_at` are ineligible.
- Fixtures and one canary prove the direct millisecond offset/duration contract; ambiguous/inconsistent values never invoke the adapter.
- One eligible partial history row creates exactly one pending job after the quiet period; repeated polls and PM2 restarts create no duplicate.
- Candidate-publication failure does not fail ingestion, and bounded reconciliation later publishes the missing logical job.
- Newer stops/revisions supersede pending work and prevent stale running output from activating.
- Percentage-only, zero/missing offset, completed, hidden/unlinked, multi-file, stale, duration-mismatched, and unsupported observations never launch transcription.
- Runtime processes at most one job/tick and one concurrently with lease, heartbeat, timeout, process-tree termination, capped retries, and restart recovery.
- Missing runtime/model, unavailable priority policy, timeout, no speech, malformed output, and terminal failure do not affect ingestion, proof, progress, or service startup.
- `project.audiobook_resume_context` status is path/text safe; canary/requeue are dry-run by default, require confirmation, affect at most one job, are idempotent, and audit no excerpt content.
- Disabled configuration launches no child and leaves current behavior unchanged.
- Canary proves one-thread/one-worker/below-normal policy, bounded clip, no model download, cleanup, no missed watcher polls, and responsive health/dashboard reads. Record CPU percentage/time, peak child working set, and wall time as machine-specific evidence rather than universal thresholds.
- `npm run verify:block` passes before the block is marked implemented.
- After runtime rebuild/restart, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Fake-clock/fake-adapter tests for eligibility, quiet period, publication failure/reconciliation, dedupe, buckets, supersession, revision drift, retries, concurrency, and disabled behavior
- Tautulli fixture tests for separate `stopped_at`, millisecond units, and backward-compatible `watched_at`
- CLI/tool/event/health tests for permissions, bounds, and text/path non-leakage
- One backed-up explicit local canary using 6D-1/6D-2, followed by `npm run verify:live-dashboard`
