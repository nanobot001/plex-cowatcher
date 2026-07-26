# Block 3-2n-5E-A: Evidence-Based File-Boundary Chapters

> Status: Implemented and verified 2026-07-26.
> Result: Exact one-file-per-chapter editions can activate through the existing multi-file pipeline when their stored Plex/Audnexus track evidence agrees.
> Notes: Path of Daggers live-verified 32 revision-matched chapters without invoking the external analyzer. The recurring multi-file flag remains false; current Wheel of Time data is rollout evidence, never title-specific scope.

## Goal

Make the common one-file-per-chapter audiobook layout work automatically for existing and future media revisions without inventing chapter truth or replacing the durable 5E queue, checkpoint, global-offset, and activation machinery.

## Confirmed Live Evidence

- The current 15 multi-file revisions contain several distinct layouts. Path of Daggers has 32 unique files, a 32-track catalog aggregate, exact stored Audnexus-agent track identities 1 through 32, Prologue plus Chapter 1 through Chapter 31 titles, and a file-duration sum within 591 ms of the cached catalog duration.
- The current worker rejects Path of Daggers as `MULTI_FILE_INVALID_CHAPTERS` because it requires chapter markers inside each MP3 even though each MP3 is the chapter.
- A fresh manifest calculation already naturally orders Raising Steam 1 through 172; its stored current manifest predates that correction. Winter's Heart still requires its exact Audnexus track identity because natural path order places track 1 last.
- Knife of Dreams has a track/title gap at track 36 / Chapter 33. The Light Fantastic has generic repeated titles. Neither may be promoted by weakening evidence rules.
- A transient production SQLite lock was collapsed to `PROOF_WORKER_FAILURE`; later CLI startup reproduced `database is locked`.

## Scope

- Prefer one complete, unique, same-edition Audnexus GUID track-number sequence as the manifest order. Preserve the existing natural path ordering as fallback when that exact authority is unavailable.
- Add one strict file-boundary proof mode using existing revision items, `content_catalog`, and `audiobook_books` evidence. It may activate only when exact identities, positive durations, declared chapter/file count, total duration, exact ASIN/edition track identity, and a complete Prologue/Chapter/Epilogue title sequence agree.
- Checkpoint one sanitized full-file chapter candidate per existing file proof job, then reuse the existing atomic global timeline activation and exact file-local playback mapping.
- Apply the same path automatically to future discovery revisions. Existing matching `unsupported_multi_file` jobs and the observed legacy `MULTI_FILE_INVALID_CHAPTERS` terminal result may be reevaluated through the existing targeted dry-run/apply operation.
- Return privacy-safe reason codes for sequence gaps, count mismatch, unsupported titles, incomplete manifests, disabled rollout, and superseded revisions. Do not call a manifest-only result chapter-ready.
- Configure bounded SQLite busy waiting and retain an allowlisted `SQLITE_BUSY` worker outcome rather than collapsing a lock into generic failure.
- Preserve single-file proof, existing multi-file embedded/resolver proof, raw playback observations, revision identity, PM2 scheduling, dry-run/confirmation, and fallback Progress behavior.

## Out Of Scope

- New tables, queues, dependencies, public mutation routes, or title/author/series allowlists.
- Grouping multipart chapters such as `Prologue (Part 1-3)`.
- Promoting credits, generic repeated titles, provider-numbered segments, or count-mismatched/gapped media to chapters.
- Repairing or downloading a missing file, correcting broad metadata, rewriting media, or changing raw playback evidence.
- Enabling recurring multi-file production processing before the corrected targeted canary and live verification pass.

## Likely Files Or Areas

- `src/service/audiobookRevisionService.ts`
- `src/service/audiobookMultiFileService.ts`
- `src/service/audiobookProofWorkerService.ts`
- `src/db/database.ts`
- `tests/run-tests.mjs`
- `docs/tool-surface.md`
- `docs/event-log-schema.md`

## Acceptance Criteria

- A Path-of-Daggers-shaped fixture with one Prologue file and consecutive Chapter 1 through N files uses file boundaries to activate one revision-matched global timeline without invoking the external per-file analyzer.
- The strict path is capability-based: exact same-edition Audnexus track identities are unique and consecutive, file count equals declared chapter count, all durations are positive, total duration is within tolerance, and titles form one complete supported sequence.
- A multipart title, generic title set, missing track, duplicate track, mixed edition identity, chapter-count mismatch, or duration mismatch never activates file-boundary chapters and returns a specific privacy-safe reason.
- Exact Audnexus track order wins over a conflicting filename/path order; the current natural path fallback still orders ordinary numeric paths such as `1, 2, 10`.
- Each worker cycle checkpoints at most one file, successful unchanged checkpoints are reused, and final activation remains atomic.
- A matching future discovery revision automatically materializes and processes through the normal worker without manual `reevaluate`; an unchanged rescan creates no duplicate revision or job.
- Targeted reevaluation can recover the current exact legacy `MULTI_FILE_INVALID_CHAPTERS` state but cannot broadly revive unrelated terminal failures.
- A SQLite lock produces bounded retry state and an allowlisted `SQLITE_BUSY` result; public/tool output and audit events contain no raw exception, path, title, or analyzer payload.
- Existing single-file proof, multi-file embedded/resolver proof, fallback Progress, replay/session projection, manual import, tool names, and PM2 behavior remain compatible.
- No database migration or dependency change is introduced.

## Verification

- Focused service tests derived from the observed exact-chapter, authoritative-order, multipart, generic, gap, mixed-edition, duration-mismatch, future-discovery, rescan, and SQLite-lock shapes.
- `npm run verify:block`
- Before live apply: create and quick-check a fresh SQLite backup and record raw observation, active chapter, revision, and proof-job baselines.
- Run only the corrected targeted Path of Daggers canary with recurring multi-file execution disabled; verify 32 revision-matched chapters, mapped progress, unchanged raw evidence counts, and no abandoned lease.
- After deploying/restarting only `plex-cowatch-service`, run `npm run verify:live-dashboard`.

## Implementation And Verification

- Exact complete same-edition Audnexus-agent GUID sequences now override conflicting filename order; ordinary media retains natural numeric path order.
- Strict file-boundary proof requires exact ASIN/edition identity, consecutive stored track numbers, positive durations, matching catalog/revision counts and duration aggregates, and a complete Prologue/Chapter/Epilogue sequence. Subtitles after a colon are retained; multipart, generic, gapped, mixed-edition, and mismatched layouts remain fallback evidence.
- Existing file proof jobs checkpoint one full-file chapter per cycle and reuse the 5E global timeline and playback mapper. Future discovery uses the same path automatically.
- Targeted reevaluation recovered only the exact legacy `MULTI_FILE_INVALID_CHAPTERS` job. SQLite connections now use a bounded five-second busy timeout, and worker locks are reported as `SQLITE_BUSY`.
- `npm run verify:block` passed with 141 service/integration tests, 63 dashboard regressions and one intentional skip, dashboard syntax validation, and tool contracts.
- A fresh `pre-file-boundary-proof-2026-07-26T12-19-44-128Z.sqlite` backup passed `PRAGMA quick_check`.
- The targeted Path of Daggers canary activated 32 chapters from offset 0 through 83,882,591 ms under source `multi_file_audnexus_track`; all 32 file jobs succeeded, the 40 raw playback observations remained unchanged, no lease remained, and Progress reports verified chapter mode with 32 chapters.
- Only `plex-cowatch-service` was restarted. Recurring multi-file execution remains disabled, and `npm run verify:live-dashboard` passed.
