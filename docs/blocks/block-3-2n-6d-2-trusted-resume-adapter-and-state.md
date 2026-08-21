# Block 3-2n-6D-2: Trusted Resume Adapter And State

> Status: Planned, revised after 6I.
> Result: Not implemented.
> Notes: Key durable resume work directly to the implemented `audiobook_position_evidence` contract. Do not create a second stop-capture or candidate-source schema.

## Goal

Give CoWatcher a bounded private transcription adapter and revision-safe resume job/result state whose identity is derived directly from durable exact 6I position evidence.

## Scope

- Validate only the versioned 6D-1B sanitized contract and invoke only the proven 6D-1A `transcribe-window` command.
- Add additive resume job/result state keyed to the source `audiobook_position_evidence` row, listener, audiobook, media revision, and bounded offset bucket.
- Store lifecycle/lease/retry fields, safe result codes, at most one 20-word excerpt, and safe provenance. Store no full transcript, segments, paths, stderr, or child diagnostics.
- Enforce one logical job per eligible evidence identity; provide transactional claim, lease recovery, retry, supersession, and stale-completion rejection.
- Keep automatic discovery/execution, recurring timers, CLI operations, health integration, and dashboard reads disconnected until 6D-3/6D-4.
- Reuse a content-agnostic bounded child-process runner only if existing chapter-proof behavior and tests remain unchanged.

## Out Of Scope

- Capturing, copying, or reclassifying exact position evidence.
- Candidate scans, automatic execution, PM2 rollout, live Whisper canary, or UI.
- Multi-file mapping, transcript search/archive, cloud APIs, summaries, or media mutation.

## Likely Files Or Areas

- focused resume adapter/service/types
- additive SQLite migration and database methods
- 6D-1B fixtures and service tests
- architecture/data/privacy documentation

## Acceptance Criteria

- Valid fake output becomes a bounded sanitized result; malformed, oversized, path-bearing, resource-policy-violating, and unsupported-version envelopes fail with safe codes.
- Repeated creation from the same 6I evidence identity produces one logical job; a newer eligible evidence row may supersede older pending work without changing the source row.
- Lease/retry/recovery and stale completion are deterministic under a fake clock.
- Database rows, errors, events, and logs contain no private path or transcript beyond the final bounded excerpt.
- No recurring timer, ingestion hook, real process, public route, or dashboard projection exists.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Adapter fixture, process-bound, path/text non-leakage, migration, uniqueness, lease, retry, supersession, and stale-activation tests
- Existing audiobook proof adapter regression tests
