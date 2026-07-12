# Block 3-2n-5d: Automatic Audiobook Chapter Proof Handoff

> Status: Planned.
> Result: Not implemented.
> Notes: Umbrella only; do not implement directly. Implement 3-2n-5d-1, then 3-2n-5d-2, then 3-2n-5d-3 so revision integrity, the external-process boundary, and runtime rollout have independent exit gates.

## Child Block Sequence

1. `block-3-2n-5d-1-revision-manifest-and-safe-cache-activation.md`
2. `block-3-2n-5d-2-trusted-external-proof-adapter.md`
3. `block-3-2n-5d-3-durable-proof-worker-and-rollout.md`

The umbrella is complete only after all three child blocks pass `npm run verify:block`; 5D-3 also owns the staged live rollout and `npm run verify:live-dashboard`.

Locked split decisions:

- 5D-1 must persist immutable revision membership before any external proof work can run.
- 5D-2 treats the current unversioned external envelope as compatibility version 1, validates imported chapter fields strictly, and ignores only bounded harmless envelope metadata.
- Only clean embedded, high-confidence Audnexus, or Whisper-verified boundaries may become active chapter truth.
- 5D-3 processes at most one eligible job every 15 minutes and uses a disabled, backed-up, single-book canary before enabling recurring production work.

## Goal

Make verified audiobook chapter proof happen automatically after dependable discovery instead of relying on manual import. When CoWatcher first discovers an audiobook without verified cached chapters, it should invoke the separate `audiobook` project through a configured local contract, import sanitized chapter boundaries into the existing cache, and then use normal Plex/Tautulli listening offsets to map future listening progress against those cached chapters.

## Scope

- Consume the durable discovery outbox from 3-2n-5c and own a restart-safe `audiobook_chapter_proof_jobs` lifecycle: `pending`, `running`, `retry_wait`, `succeeded`, `failed_terminal`, and `unsupported_multi_file`.
- Deduplicate jobs by audiobook plus private media revision. "One-time proof" means once per unchanged media revision; failed work can retry with capped backoff and an expiring lease.
- Invoke the external `audiobook` project through a configured trusted local adapter rather than hardcoded repo paths. The adapter may receive a private local media path in-process, but must never log or return it.
- Call only the external project's read-only JSON commands: `inspect`, then `validate` for embedded chapters, and `resolve` only when embedded chapters are missing or unusable.
- Normalize its JSON envelope into a compatibility-versioned local import contract, translating `start_ms`/`end_ms`, source, confidence, duration, and safe warnings. Strictly reject unknown or ambiguous imported chapter fields and malformed, unordered, overlapping, out-of-range, single-chapter, or duration-mismatched results while ignoring bounded harmless envelope metadata.
- Preserve the one-time-proof model: after a validated source revision is active, future listening events reuse the cache rather than re-run proof on every play.
- Support a full-book single-file edition first. For multi-file editions, either build a deterministic book-global timeline with per-file cumulative offsets or mark the job `unsupported_multi_file` and retain Plex track/file fallback; never apply one file's offsets to the entire book.
- Record structured audit/state output for queued, running, succeeded, skipped, retried, and failed proof attempts.

## Out Of Scope

- Rebuilding the Progress mapping logic already implemented in 3-2n-5b.
- Re-running proof on every audiobook playback event.
- Broad media repair or writing chapters back into media files.
- Running ffprobe, silence detection, Whisper, or other chapter-analysis logic inside CoWatcher itself.
- Adding a public HTTP mutation route for chapter proof/import.

## Risk And Mitigation Plan

- Risk: the external `audiobook` project is unavailable or slow.
- Mitigation: process proof asynchronously, use timeouts and bounded retries, and keep Progress on honest fallback behavior when proof is still missing.
- Risk: the same audiobook is queued repeatedly from scans, webhooks, or playback evidence.
- Mitigation: dedupe by audiobook plus private media revision; jobs use leases, capped backoff, and a structured operator requeue path.
- Risk: contract drift between CoWatcher and `audiobook` breaks imports.
- Mitigation: define a versioned normalization adapter with source allowlists, field translation, duration and boundary validation, and structured errors that leave the prior active revision intact.
- Risk: a low-quality resolver result is presented as verified chapter truth.
- Mitigation: activate only valid embedded or policy-approved resolved boundaries. Candidate or uncertain results retain source/confidence/warnings and leave Progress on Plex fallback copy.
- Risk: an edition is replaced or its file order changes.
- Mitigation: persist a private media fingerprint, total duration, chapter-set digest, contract/resolver version, and safe warnings; discovery requeues only when the media revision changes.
- Risk: private paths or raw external details leak through the integration.
- Mitigation: pass only sanitized identifiers/metadata, store only safe chapter/cache fields, and keep tool-facing outputs privacy-safe.

## Drift Controls

- Do not require a human to manually run `import-audiobook-chapters` for normal first-time audiobook proof.
- Do not make verified chapter proof a prerequisite for storing playback evidence or discovering audiobooks.
- Do not re-run chapter proof automatically for an unchanged, already-verified media revision.
- Do not overwrite an active chapter revision until the replacement has passed validation and commits atomically.
- Do not bypass the local sanitized import/cache seam; all verified chapter writes should still flow through it.

## Dependency Plan

- Depends on Block 3-2n-5c for reliable service-local audiobook discovery.
- Reuse the chapter-cache/import contract from `block-3-2n-5a-audiobook-chapter-import-cache.md`.
- Feed the cached verified boundaries already consumed by `block-3-2n-5b-true-audiobook-chapter-progress.md`.
- Extend the cache schema so chapter rows belong to a source revision; source records retain media fingerprint, duration, chapter digest, contract/resolver version, safe warnings, and activation/invalidation status.

## Likely Files Or Areas

- `src/service/audiobookService.ts`
- `src/service/audiobookScannerService.ts`
- `src/server/app.ts`
- `src/cli/cli.ts`
- `src/db/schema.sql`
- `src/db/database.ts`
- `tests/run-tests.mjs`
- `docs/tool-surface.md`
- `docs/event-log-schema.md`
- `docs/production/`

## Acceptance Criteria

- When reliable discovery finds a new or changed media revision without verified boundaries, CoWatcher creates exactly one pending proof job for that revision.
- The running service processes proof jobs asynchronously with an expiring lease, capped retries, safe structured errors, and an operator requeue path.
- The trusted adapter calls `audiobook inspect/validate/resolve --json` in the defined order and never leaks local file paths.
- Valid external JSON is normalized, source-qualified, and imported as a new cache revision. Chapter rows are tied to that source revision, and activation is atomic.
- Invalid external output, low-quality candidate output, timeouts, or failures preserve a prior active revision and otherwise leave Progress on source-honest fallback behavior.
- Books with an already-verified unchanged media revision are skipped automatically and are not re-proved on each playback event; a changed fingerprint can requeue proof.
- Multi-file editions either produce deterministic book-global offsets or record `unsupported_multi_file` and retain fallback behavior.
- Invalid external output, timeouts, or failures return structured errors, preserve existing data, and leave Progress on source-honest fallback behavior.
- Successful proof/import is visible through structured audit/state output and enables the already-built Progress chapter mapper to use cached chapter boundaries on later listening evidence.
- Existing manual CLI import remains available as an operator/debug fallback but is no longer required for the normal first-time proof path.

## Verification

- `npm run verify:block`
- Deterministic tests that mock the external `audiobook` contract and prove restart recovery, one-time revision queueing, schema translation, source-quality rejection, atomic activation, changed-media requeueing, retry behavior, verified-book skip behavior, and multi-file fallback/timeline behavior.
- A local service run that discovers an unresolved audiobook, processes one proof job, and then shows persisted chapter-cache rows for that audiobook.
