# Block 3-2n-5c: Reliable Audiobook Discovery Automation

> Status: Planned.
> Result: Not implemented.
> Notes: Follow-up to Blocks 3-2n-5a and 3-2n-5b. The current runtime can notice individual audiobook webhook items, but it does not reliably perform whole-library audiobook discovery unless the scan CLI is called externally.

## Goal

Make audiobook discovery dependable in the normal PM2-hosted service workflow, even when no one runs the CLI manually. CoWatcher should be able to keep the Audiobooks library discovery path alive on its own, detect newly added or still-undiscovered books through a real whole-library scan, and use that dependable discovery event as the trigger point for later verified-chapter automation with the separate `audiobook` project.

## Scope

- Add a service-local audiobook discovery trigger that can run whole-library scans without requiring manual CLI use.
- Preserve the existing `scan-audiobooks` CLI command as an operator/debug entrypoint while reusing the same underlying scan service.
- Make the normal runtime perform a bounded full-library audiobook scan on a configurable cadence and startup-safe schedule under PM2. On startup, scan only when the persisted successful-scan timestamp is outside the cooldown.
- Keep webhook item processing for fast per-item awareness, but do not treat it as the only reliable discovery path.
- Persist a restart-safe discovery lease and scan state: trigger reason, started/finished timestamps, cooldown decision, safe error summary, and result counts.
- Report book-level results (`booksNew`, `booksChanged`, `booksAlreadyKnown`) separately from track-level failures; a partial scan may publish only books whose discovery succeeded.
- Emit a deduplicated durable discovery outbox keyed by audiobook and media revision for Block 3-2n-5d; unvisited or failed tracks must not create proof work.

## Out Of Scope

- Implementing the external `audiobook` project invocation itself.
- Building a custom distributed scheduler or multi-process job system.
- Expanding discovery automation beyond the Plex Audiobooks library.
- Reworking dashboard Progress rendering or chapter math.
- Inventing a public HTTP mutation route for full-library scans.

## Risk And Mitigation Plan

- Risk: repeated whole-library scans create unnecessary Plex load.
- Mitigation: make cadence configurable, prevent overlapping runs, and keep an explicit minimum interval plus startup guard.
- Risk: PM2 restarts cause duplicate scans or scan storms.
- Mitigation: persist last-run timestamps/state plus a renewable lease in SQLite and skip scans that fall inside the cooldown window.
- Risk: webhook item ingestion and full scans race or duplicate work.
- Mitigation: make discovery idempotent at the audiobook/media-revision level and record bounded scan/job reasons such as `startup`, `interval`, `webhook-item`, or `manual`.
- Risk: future chapter automation is built on ambiguous discovery semantics.
- Mitigation: explicitly define that only whole-library scan completion or explicit item-level discovery success can enqueue the later chapter-proof handoff.

## Drift Controls

- Do not claim that webhook-only item enrichment is equivalent to a successful whole-library discovery scan.
- Do not require the operator to keep an external scheduled CLI task for discovery correctness.
- Do not remove the CLI scan path; it remains a safe manual/operator tool.
- Do not expose private file paths, Plex tokens, or raw adapter payloads in audit or tool-facing outputs.

## Dependency Plan

- Reuse `AudiobookScannerService` as the single whole-library scan implementation path.
- Reuse the existing PM2-hosted service runtime instead of adding a separate worker process.
- Prepare a stable local post-discovery hook for a later block that automates the `audiobook` project chapter-proof/import path.

## Likely Files Or Areas

- `src/server/app.ts`
- `src/service/audiobookScannerService.ts`
- `src/service/audiobookService.ts`
- `src/server/routes.ts`
- `src/cli/cli.ts`
- `src/db/schema.sql`
- `tests/run-tests.mjs`
- `docs/tool-surface.md`
- `docs/production/`

## Acceptance Criteria

- The running service can perform bounded full-library audiobook discovery without requiring a person or external scheduler to call the CLI.
- Discovery scans do not overlap, and PM2 restarts do not trigger repeated back-to-back scans inside the configured cooldown window.
- Webhook item processing remains available for fast single-item awareness, but full-library discovery correctness no longer depends on webhook luck.
- Structured audit/state output shows scan trigger reason, start/end time, outcome, counts, and last error summary when relevant.
- The scan result creates a deduplicated, durable discovery outbox keyed by audiobook/media revision, suitable for a later block to trigger chapter-proof automation.
- Existing CLI `scan-audiobooks` behavior still works and shares the same core scan logic.

## Verification

- `npm run verify:block`
- Restart the local PM2-hosted service and verify only one bounded audiobook discovery run happens inside the configured startup/cooldown rules.
- Simulate repeated triggers and verify overlapping or cooldown-violating scans are skipped with structured audit evidence.
