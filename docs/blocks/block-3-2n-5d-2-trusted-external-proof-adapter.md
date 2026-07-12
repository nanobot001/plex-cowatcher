# Block 3-2n-5d-2: Trusted External Proof Adapter

> Status: Planned.
> Result: Not implemented.
> Notes: Second child of the 3-2n-5d umbrella. Build and verify the read-only external-process boundary after 5D-1 provides immutable manifests and atomic activation.

## Goal

Safely call the separate `audiobook` project's read-only JSON commands for one manifest-backed single-file edition, normalize only trusted chapter evidence, and reject uncertain or unsafe output before it can reach chapter activation.

## Dependencies And Entry Gate

- Block 3-2n-5d-1 is implemented and verified.
- The local `audiobook` project exposes `inspect`, `validate`, and `resolve` JSON commands.
- Tests must use injected fakes and must not require the real project, ffmpeg, network access, or private media.

## Scope

- Add an injectable adapter using `spawn` with argument arrays and `shell: false`.
- Configure executable and script paths without hardcoded repository locations; derive the working directory from the script.
- Run `inspect`, validate embedded chapters when present, and call `resolve` only when embedded chapters are missing or unusable.
- Treat the current unversioned envelope as compatibility contract version 1, inspect its `ok` field independently of process exit status, and reject unsupported explicit versions.
- Strictly validate required imported fields while ignoring bounded harmless envelope metadata. Never persist raw tags or raw external payloads.
- Bound stdout to 2 MiB and stderr to 64 KiB, enforce a 30-minute timeout, and terminate the full child process tree including ffmpeg descendants on Windows.
- Validate ASIN format before passing it to the child process.
- Return a sanitized candidate to the 5D-1 activation seam only for clean embedded chapters, high-confidence Audnexus results, or Whisper-verified results.
- Retain medium/low-confidence results as non-active safe diagnostics; Whisper remains opt-in.

## Out Of Scope

- Polling the discovery outbox or creating durable proof jobs.
- Scheduling, retries, leases, PM2 runtime behavior, health summaries, or operator requeue.
- Writing chapters to media files or exposing a public HTTP mutation route.
- Supporting multi-file timelines.

## Validation And Security Contract

- Require at least two finite, ordered, positive, non-overlapping chapter ranges.
- Reject out-of-range boundaries and an absolute duration mismatch greater than 10 seconds.
- Reject malformed envelopes, error envelopes, unsupported versions, oversized output, timeout, and low-confidence candidates with allowlisted safe codes.
- Do not return or log private paths, raw stdout/stderr, authenticated URLs, tags, tokens, or unbounded messages.

## Likely Files Or Areas

- A focused external audiobook adapter/service
- `src/utils/config.ts` and `.env.example`
- Deterministic adapter and privacy tests

## Acceptance Criteria

- Command ordering is deterministic and `resolve` is skipped for valid embedded chapters.
- `ok: false` is handled as failure even when the process exits successfully.
- Unsupported explicit contract versions fail safely while compatibility version 1 remains usable.
- Only approved high-confidence evidence reaches the activation seam.
- Malformed, overlapping, out-of-range, single-chapter, duration-mismatched, and uncertain output cannot activate chapters.
- Output limits, timeout, and Windows process-tree termination are covered through injected process fakes.
- Private paths and raw child output are absent from structured results, audits, and logs.

## Verification

- `npm run verify:block`
- Deterministic fake-process tests for success, error envelopes, output bounds, timeout/termination, redaction, and every quality rejection path.
