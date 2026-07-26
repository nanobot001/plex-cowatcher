# Block 3-2n-5E: Multi-File Audiobook Timeline Proof

> Status: Implemented; live multi-file rollout pending.
> Result: Deterministically verified with production multi-file execution still disabled by `AUDIOBOOK_PROOF_MULTI_FILE_ENABLED=false`.
> Notes: Extend the completed 5D proof pipeline to all structurally provable multi-file audiobook editions. Wheel of Time and Discworld are representative live examples only; eligibility and behavior must never depend on title, author, series, or library-specific allowlists.

## Goal

Make retained listening history as complete and useful as its source evidence permits for audiobooks split across multiple physical files. Build a revision-bound, book-global chapter timeline from deterministically ordered file-local evidence, map both existing and future Plex/Tautulli playback observations through the correct file into that timeline, and preserve every unresolved observation with an explicit reason instead of discarding it or inventing chapter truth.

## Confirmed Baseline

- The current proof pipeline works automatically for one-track, one-file editions.
- A revision is currently classified `unsupported_multi_file` solely when it contains more than one distinct physical file; this label does not prove that the media is corrupt or unanalyzable.
- As of the 2026-07-25 planning audit, the live unsupported set includes structurally varied editions with 19 to 172 files. Beloved Wheel of Time and Discworld editions are useful canary candidates, but are not the feature boundary.
- The trusted adapter currently accepts one private media path and returns offsets local to that file.
- Verified Progress currently expects one book-global offset timeline, while unverified multi-file editions remain on source-honest Plex track/file fallback.
- Existing playback observations are valuable source records. Missing or unmappable evidence is unknown, not proof that listening did not occur.

## Dependencies And Entry Gate

- Blocks 3-2n-5D-1, 5D-2, 5D-2A, and 5D-3 remain implemented, verified, and authoritative for immutable manifests, trusted external proof, safe timeline normalization, durable work, and rollout controls.
- The configured `audiobook` JSON CLI remains the chapter-analysis authority. Reuse its existing per-file read-only contract where sufficient. If ordered multi-file input or book-global candidate validation requires a contract extension, make that extension explicit, versioned, read-only, and covered by contract fixtures; do not bypass the trusted adapter.
- Existing chapter activation remains revision-bound and atomic.
- Existing playback observations, source provenance, replay/session semantics, dashboard identity, PM2 single-process operation, and privacy boundaries must remain compatible.

## Scope

- Replace the blanket `file_count !== 1` rejection with capability-based multi-file eligibility. A book may proceed only when file membership, order, duration, and playback-to-file identity can be established deterministically.
- Preserve immutable per-revision file membership and sufficient stable identity to map a Plex/Tautulli observation to the exact manifest item that produced it. Rating-key churn must use existing exact identity/alias evidence where available; ambiguous matches remain unresolved.
- Define and persist explicit file-order evidence. Prefer authoritative Plex disc/track ordering when complete and unique; otherwise allow a tested natural-order fallback only when it is unambiguous. Lexicographic path order alone must not silently turn `1, 10, 2` into a false book sequence.
- Analyze each eligible file through the trusted read-only adapter, validate its duration and local chapter boundaries, and checkpoint the sanitized result per `(audiobook_id, media_revision, manifest_item)`.
- Resume large books without repeating successful unchanged file work. Use bounded batches, expiring leases, heartbeats, and durable per-file outcomes so editions with dozens or hundreds of files cannot be lost to one process timeout or restart.
- Assemble an atomic book-global candidate by adding the cumulative duration of preceding files to every validated file-local boundary. Validate ordering, continuity, overlap, duration tolerance, chapter indexes, source quality, and final book duration before activation.
- Keep source types honest. Multiple physical files, CD tracks, or Plex tracks must not automatically be relabeled as verified chapters. If a file boundary is shown as fallback evidence rather than a proved chapter boundary, preserve the `track_file` distinction.
- Map retained historical and future playback using the observation's exact file/track identity plus its file-local offset. Convert to a book-global offset only after the manifest item is known. Preserve completion, partial, repeat, session, and viewing-day provenance without multiplying one observation across unrelated files or chapters.
- Reproject existing retained observations after a multi-file timeline activates. Reprojection must be derived and idempotent: it must not rewrite, delete, merge, or fabricate the original Plex/Tautulli/archive evidence.
- Replace generic residual failure with privacy-safe capability reason codes such as ambiguous file order, missing duration, unmapped playback item, partial proof, source-quality rejection, or changed/superseded revision. Exact names may follow project conventions, but operators must be able to distinguish each condition.
- Add a privacy-safe read-only audit showing per revision: file count, proved/checkpointed/unresolved file counts, global-timeline eligibility, mapped/unmapped playback counts, terminal reason, and whether an active revision matches current media. Never expose private paths or raw external diagnostics.
- Add a dry-run-by-default, explicitly targeted operator path to re-evaluate current `unsupported_multi_file` jobs under the new capability rules. Preserve the existing one-book canary and recurring-worker rollout gates.
- After deterministic verification and a validated database backup, run disabled targeted canaries selected by media structure rather than title: at least one many-short-file edition and one many-long-file edition when safely eligible. Wheel of Time and Discworld may be used as representative examples, but no production rule may name them.

## Out Of Scope

- Hard-coded handling, allowlists, metadata rules, or success criteria for Wheel of Time, Discworld, or any other title, author, series, folder, or library.
- Inventing missing playback events, inferring that an absent observation means unwatched/unheard, or claiming recovery from Plex/Tautulli data that was never retained.
- Treating every file or Plex track as a verified chapter without chapter-quality evidence.
- Rewriting, retagging, combining, splitting, embedding chapters into, or otherwise mutating audiobook media.
- Broad metadata correction, including the separate Way of Kings stored-title defect.
- Whisper resume excerpts, transcript storage, or the 3-2n-6D resume-context sequence.
- Unbounded parallel media analysis, cloud APIs, public mutation routes, or exposing local file paths.

## Likely Files Or Areas

- `src/service/audiobookRevisionService.ts`
- `src/service/audiobookProofWorkerService.ts`
- `src/service/audiobookProofAdapter.ts`
- `src/service/audiobookChapterActivationService.ts`
- `src/service/dashboardService.ts`
- `src/service/audiobookScannerService.ts`
- `src/cli/cli.ts`
- `src/db/schema.sql`
- `src/db/migrations/`
- `src/types/api.ts`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`
- `docs/event-log-schema.md`
- The configured sibling `audiobook` JSON contract and fixtures, only if the existing read-only per-file commands cannot safely express the required evidence.

## Acceptance Criteria

- A deterministic three-file fixture with chapters in more than one file produces one revision-matched global timeline with correctly shifted offsets and no gaps, overlaps, duplicate indexes, or duration drift.
- Playback partway through the second fixture file maps to the correct global chapter and chapter-relative percentage; the same numeric local offset in the first and final files maps to different correct global positions.
- Existing retained observations are reprojected idempotently after activation. Raw observation counts, timestamps, users, rating keys, and provenance remain unchanged; underlying reconstructed-session identities and source replay counts are not duplicated, while derived chapter labels may become more specific.
- File identity and order tests cover authoritative ordering, natural numeric ordering (`1, 2, 10`), multiple discs, duplicate/missing indexes, renamed or stale rating keys, unknown durations, zero-length files, changed revisions, and ambiguous order. Ambiguous cases remain fallback evidence with a specific safe reason.
- Per-file proof tests cover embedded chapters, resolver candidates, source-quality rejection, duration mismatch, transient failure, terminal failure, process restart, lease expiry, and successful checkpoint reuse without re-running unchanged files.
- A partially proved book never activates a partial global timeline. The prior active revision remains intact, and fallback Progress remains available.
- The privacy-safe audit accounts for every current multi-file revision and every retained playback observation as mapped or unresolved with a reason; it exposes no private path or raw analyzer output.
- Existing `unsupported_multi_file` jobs can be reevaluated through a dry run and explicitly targeted apply. Every current revision becomes either safely eligible/requeued or remains unresolved for a concrete capability reason; file count alone is no longer the reason.
- Disabled live canaries prove at least two structurally different eligible multi-file editions end to end. Selection is capability-based; current Wheel of Time and Discworld books may serve as examples but are not required by name. If the current set yields fewer than two safely eligible structures, stop the rollout and report the evidence instead of weakening the criteria or adding title-specific exceptions.
- After explicit rollout approval, eligible current multi-file jobs drain through the recurring worker without starving new single-file books. Status exposes file-level progress for long-running editions, normal completion, retry timing, timeout, and terminal reasons.
- A successful live canary shows revision-matched verified chapter progress for historical and current playback in the shared audiobook detail workspace. Unmapped observations remain visible as source-honest fallback rather than disappearing.
- Existing single-file proof, manual import, non-audiobook Progress, archive/history retention, tool contracts, and PM2 behavior remain compatible.

## Verification

- Focused deterministic service tests for multi-file ordering, checkpointing, timeline assembly, observation mapping, reprojection, failure recovery, and single-file compatibility.
- Dashboard regression coverage for verified multi-file chapter progress, residual track/file fallback, current position, repeat/session provenance, and no horizontal overflow at required viewports.
- Privacy/tool contract fixtures for status, audit, dry-run, apply confirmation, and structured safe errors.
- `npm run verify:block`
- Before any live apply: create a fresh SQLite backup, verify `PRAGMA quick_check`, record pre-canary job/observation/chapter counts, and keep recurring multi-file processing disabled.
- Run one targeted dry run and disabled canary at a time; verify exact audiobook/revision identity, global duration, mapped/unmapped observation accounting, active chapter revision, and unchanged raw evidence counts.
- After explicit recurring rollout and PM2 restart, run `npm run verify:live-dashboard` and confirm bounded automatic progress without unstable restarts or an abandoned lease.

## Implementation Handoff (2026-07-25)

- Added immutable manifest identity fields, natural numeric path ordering, additive migration 26, and durable per-file proof jobs with checkpoint, retry, lease recovery, and privacy-safe progress.
- Added atomic cumulative global timeline assembly and exact rating-key/GUID file-local playback mapping. Stale historical audiobook observations can be recovered through the retained revision manifest without rewriting raw evidence.
- Added the explicit `AUDIOBOOK_PROOF_MULTI_FILE_ENABLED` rollout flag, defaulting to false, so the existing multi-file fallback remains unchanged until operators select and verify live canaries.
- Deterministic verification passes: `npm test` (135/135) and `npm run test:dashboard-regression` (63 passed, 1 intentional skip). The remaining acceptance items are live backup, disabled canary, targeted re-evaluation, and explicit recurring rollout evidence; those are deliberately not claimed here.
