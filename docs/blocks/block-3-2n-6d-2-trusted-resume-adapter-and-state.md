# Block 3-2n-6D-2: Trusted Resume Adapter And State

> Status: Planned.
> Result: Not implemented.
> Notes: Second child of 3-2n-6D. Validate the 6D-1 external transcription contract and establish revision-safe durable state without connecting it to ingestion, a recurring worker, or the dashboard.

## Goal

Give CoWatcher a private, bounded adapter and an independently testable resume-context state machine before any automatic background execution is enabled.

## Scope

- Add a dedicated `AudiobookResumeAdapter` that invokes only the versioned `transcribe-window` command from 6D-1.
- Reuse a narrowly extracted content-agnostic child-process runner only if `AudiobookProofAdapter` behavior, limits, types, and tests remain unchanged.
- Accept an in-process private file path plus validated start/end offsets, but never return or log that path.
- Enforce 6D-1 contract version, command identity, 60-second maximum window, output/segment/text limits, timeout, process-tree termination, safe error allowlist, one-thread/one-worker CPU-int8 policy, below-normal priority, and local-model-only result claims.
- Reject malformed, oversized, path-bearing, resource-policy-violating, unsupported-version, or raw-error envelopes.
- Add additive SQLite state for resume jobs/results with lifecycle states equivalent to `pending`, `running`, `retry_wait`, `succeeded`, `superseded`, `failed_terminal`, and `unsupported`.
- Store listener ID, audiobook ID, media revision, source observation ID, optional verified chapter index, exact validated stop offset, 30-second dedupe bucket, state/lease/retry fields, safe result code, bounded excerpt/provenance fields, and timestamps.
- Enforce one logical job per listener, audiobook, revision, chapter identity, and offset bucket. Provide transactional service methods to enqueue idempotently, supersede pending work, claim one job, renew/recover leases, complete safely, retry, and reject stale activation.
- Resolve no private path in state methods. Jobs reference immutable revision identity; 6D-3 resolves the path only at execution time.
- Define deterministic excerpt selection over sanitized fake segments: sufficiently speech-like segments only, prefer the last complete sentence(s), otherwise the last eligible segment, preserve ordering, cap at 20 words/characters, and persist no more text than displayed.
- Store no full transcript, segment array, private path, temporary path, raw stderr, or child diagnostics.
- Add schema, migration, adapter, and state-machine tests with fake child processes and synthetic text.
- Update durable architecture/data/privacy documentation for the new private state and trusted boundary.

## Out Of Scope

- Tautulli `stopped_at` ingestion, candidate publication, reconciliation scans, recurring timers, PM2 rollout, CLI operations, health integration, or a real Whisper canary.
- Dashboard/API fields or rendering.
- Paraphrased summaries, LLMs, cloud APIs, transcript archives/search, multi-file mapping, or media mutation.

## Likely Files Or Areas

- `src/service/audiobookResumeAdapter.ts`
- `src/service/audiobookResumeContextService.ts`
- a narrowly shared bounded process runner only if justified by tests
- `src/db/schema.sql`
- `src/db/database.ts`
- new additive migration
- `tests/run-tests.mjs`
- 6D-1 sanitized fixtures
- `docs/architecture/README.md`
- `docs/data/README.md`
- `docs/tool-adapter-memory.md`
- `docs/permissions.md`
- `docs/event-log-schema.md`

## Risks And Drift Controls

- **Proof regression:** Resume/proof domain types stay separate; shared runner extraction cannot change proof command order, limits, timeout, privacy, or result semantics.
- **Private-path leakage:** Tests inject sentinel paths and assert absence from results, errors, database rows, events, and logs.
- **Unbounded text:** Adapter rejects or deterministically bounds external text; state persists only the final excerpt.
- **State complexity:** One job table and one bounded result representation are preferred. Add another table only if atomic current-result replacement cannot otherwise be expressed clearly.
- **Stale activation:** Completion requires the expected job lease, listener/book/revision/offset identity, and non-superseded state.
- **Reversibility:** Migration is additive; no existing observation, chapter, proof, or catalog row changes meaning.
- **Overengineering:** No generic transcription framework, plugin system, scheduler, public route, or operator UI.

## Acceptance Criteria

- Valid version-1 synthetic output becomes a sanitized adapter result; unsupported versions and every malformed/resource-policy-violating case fail with allowlisted safe codes.
- Adapter timeout/output limits terminate the complete child process tree and never expose paths, transcript content, stderr, stack traces, or environment details in errors.
- Existing `AudiobookProofAdapter` tests and behavior remain unchanged after any shared-runner refactor.
- Additive migration succeeds from the current schema and preserves all existing data/contracts.
- Repeated enqueue of the same logical stop returns one job; a different bucket can supersede older pending work transactionally.
- Lease claim/recovery, bounded retry, terminal failure, unsupported classification, and stale completion are deterministic under a fake clock.
- A successful fake completion stores at most one 20-word excerpt plus safe provenance and stores no full transcript/segments/path.
- No recurring timer, ingestion hook, external real process, CLI operation, or dashboard projection exists in this child.
- `npm run verify:block` passes before the block is marked implemented.

## Verification

- `npm run verify:block`
- Adapter contract tests for versioning, output limits, resource policy, timeout, process-tree termination, and path/text non-leakage
- Migration/state tests for uniqueness, supersession, lease recovery, retries, stale activation, excerpt bounds, and current-result selection
- Existing proof adapter regression tests
