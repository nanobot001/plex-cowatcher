# Block 3-2n-5c: Reliable Audiobook Discovery Automation

> Status: Implemented on 2026-07-11.
> Result: Implemented.
> Verification: `npm run verify:block` and `npm run verify:live-dashboard` - passed.
> Notes: Added restart-safe automatic discovery, direct rich-metadata reconciliation, conservative identity/conflict handling, persisted enrichment cooldowns, media revisions, and a 5D discovery outbox. Live startup scanned 960 tracks successfully; the immediate rerun reported `booksNew = 0` and `outboxEnqueued = 0`.

## Goal

Make audiobook discovery and metadata reconciliation dependable in the normal PM2-hosted service workflow. Without manual CLI use, CoWatcher must discover the configured Plex Audiobooks library, preserve canonical book identity through rating-key and folder drift, repair stale or incomplete metadata, and publish one durable discovery event per successfully understood media revision for Block 3-2n-5d.

## Dependencies And Entry Gate

- Blocks 3-2n-5, 3-2n-5a, and 3-2n-5b remain the source-honesty, chapter-cache, and Progress contracts.
- Reuse `MetadataService`, `AudiobookCatalogService`, `AudiobookScannerService`, `AuditService`, the PM2 runtime, and existing SQLite migration conventions.
- Preserve the existing `scan-audiobooks` CLI command and Plex webhook path, but route CLI, webhook, startup, and interval triggers through one discovery coordinator.
- Before implementation, isolate or commit the existing uncommitted movie-poster fix so 5C does not mix unrelated source changes into its implementation commit.
- Block 3-2n-5d must consume the outbox contract defined here; 5C must not invoke the external `audiobook` project or write verified chapter boundaries.

## Scope

- Add an audiobook discovery runtime that starts whenever Plex is configured, independently of Tautulli and Discord.
- Run a full configured-library scan at startup only when the persisted successful-scan time is older than the scan interval, then continue on a completion-based schedule.
- Keep webhook item processing for low-latency awareness while retaining periodic full-library scans as the correctness path.
- Reconcile the rich metadata already returned by the Plex library listing directly instead of issuing a second Plex request for every track. Use targeted metadata requests only for incomplete or stale records.
- Recover stale rating keys in this order: current rating key, stored catalog GUID, then the latest playback-observation GUID. Confirm an active replacement key before persisting it, and retain the prior good metadata if recovery fails.
- Reconcile each track to a canonical audiobook with explicit identity, conflict, provenance, revision, and enrichment state.
- Cache and retry existing Audnexus/Google Books enrichment without adding a new provider.
- Persist restart-safe lease, scan-run, last-seen, enrichment-retry, media-revision, and discovery-outbox state through an additive migration.
- Preserve backward-compatible CLI/tool output while adding accurate book-level counts and bounded structured error details.
- Expose safe read-only discovery health for administrators without adding metadata repair actions to the household dashboard.

## Runtime Defaults

- `AUDIOBOOK_DISCOVERY_ENABLED`: enabled when a Plex token is configured; explicitly configurable off for troubleshooting.
- `AUDIOBOOK_LIBRARY`: `Audiobooks`; accept a Plex library name or key and resolve it once per scan.
- `AUDIOBOOK_SCAN_INTERVAL_MINUTES`: `360` with a minimum of `15`.
- Lease: `30` minutes, renewed every `60` seconds while work is active; expired leases are recoverable after restart.
- Plex fallback metadata retry cooldown: reuse the existing `15` minutes.
- External enrichment: at most `20` unique books per scan, concurrency `2`.
- Transient enrichment retry delays: `15` minutes, `1` hour, `6` hours, then `24` hours; confident no-match results retry after `7` days.
- A scan visits every track returned by the one library-list request, but external enrichment and concurrent work remain bounded. A run that cannot finish is `partial`, not successful.

## Identity And Metadata Contract

Apply identity evidence conservatively and never merge by title alone:

1. Derive the normalized local folder identity when a usable private media path exists.
2. Reuse an exact folder match.
3. Otherwise reuse an exact ASIN match only when it does not conflict with another local edition or existing GUID linkage.
4. Otherwise reuse an audiobook already linked through the same stable Plex track GUID.
5. When equally credible evidence points to different books, record `identity_conflict`, preserve both records, and publish no 5D work until later evidence resolves the conflict.
6. When no folder, exact ASIN, or stable GUID linkage is available, retain a discoverable pending record without inventing author, series, cover, or canonical identity.

Keep these states distinct:

- Discovery: the media was observed in the configured Plex library.
- Identity: `identified`, `pending`, or `conflict`, with bounded provenance such as `folder`, `asin`, or `plex_guid`.
- Metadata enrichment: `pending`, `retry_wait`, or `enriched`, retaining the existing provider provenance.
- Chapter proof: unchanged from 3-2n-5a/5b and owned by 5D; a Plex track count never becomes a verified chapter count.

Provider or Plex failure must not replace better existing values with placeholders. Missing data remains null or uses safe existing dashboard fallback copy.

## Media Revision And Outbox Contract

- Calculate a private SHA-256 media revision from the sorted track set for one audiobook.
- For each track, use its stable Plex GUID when available; otherwise use a hash of its normalized private file path. Include duration and deterministic track order.
- Exclude rating keys, title, author, cover, and other mutable display metadata so ordinary metadata refreshes do not trigger chapter re-proof.
- If stable revision evidence is incomplete, discovery may succeed but must not publish 5D work.
- Persist the current revision and observed track count on the canonical audiobook.
- Create `audiobook_discovery_outbox` with audiobook ID, media revision, trigger reason, created timestamp, consumed timestamp, and a unique constraint on `(audiobook_id, media_revision)`.
- Publish only after the book and all successfully visited tracks for that book commit transactionally. Partial or failed books do not publish.
- A changed revision creates one new event. An unchanged revision creates none, regardless of startup, interval, webhook, or CLI trigger count.

## Persistence And Result Contract

Use additive, transactional migration changes only:

- Discovery singleton state: lease owner/expiry, heartbeat, last attempt, last success, current run, and next scheduled run.
- Discovery runs: trigger (`startup`, `interval`, `webhook-item`, or `manual`), status (`running`, `succeeded`, `partial`, `failed`, or `skipped`), timestamps, safe error code, and result counts.
- Catalog last-seen state and a non-unique index on Plex GUID. Never make GUID unique because stale rating-key rows may share it.
- Canonical audiobook identity status/provenance, current private media revision, and revision timestamp.
- Enrichment last attempt, next attempt, attempt count, and safe error code.
- Discovery outbox as defined above.

Return accurate counts:

- `tracksVisited`, `trackFailures`
- `booksNew`, `booksChanged`, `booksAlreadyKnown`
- `booksPendingIdentity`, `booksPendingEnrichment`, `identityConflicts`
- `outboxEnqueued`

Preserve existing CLI fields where callers may depend on them, but stop treating every linked track as an added book. Add structured fields rather than renaming or removing published fields.

## Partial Scan And Removal Rules

- A failed library listing produces a failed run and changes no last-seen or outbox state.
- A track failure produces a partial run; successful books may publish, but failed or unvisited books may not.
- Only a fully successful whole-library scan may mark previously known tracks as not seen in the current revision.
- Never delete historical catalog, playback, audiobook, chapter, or audit rows automatically.
- Missing media remains historical and cannot trigger new 5D work until observed successfully again.

## Risk And Mitigation Plan

- Plex load or long scans: consume the rich list response directly, avoid per-track refetches, limit external enrichment, and prevent overlap with the lease.
- PM2 restart storms: persist last success and a renewable lease; skip startup scans inside the interval and recover expired leases.
- CLI/webhook/scheduler drift: use one coordinator and one result contract for every trigger.
- Folder moves or rating-key churn: use folder/ASIN/GUID reconciliation, preserve historical links, and exclude rating keys from media revisions.
- Incorrect merges: prohibit title-only matching, reject conflicting identity evidence, and retain separate records instead of guessing.
- Provider outages and rate limits: persist cooldown/backoff state, cap enrichment work, and keep books discoverable with honest pending status.
- Partial scans mistaken for removals: update absence state only after complete success and never delete history.
- Raw error or path leakage: store allowlisted error codes and bounded summaries; never expose file paths, tokens, authenticated URLs, or raw adapter payloads.
- 5D contract drift: version the outbox shape in durable documentation and test unchanged/changed media revision behavior before 5D begins.
- Timer and test leakage: make the coordinator expose explicit `start`, `stop`, and `runOnce` seams with injectable clock/lease timing for deterministic tests.

## Opportunities To Use

- Eliminate the scanner's current N+1 metadata lookup by persisting the rich library-list records directly.
- Turn each successful scan into an integrity pass that repairs stale keys, covers, catalog links, and canonical audiobook associations.
- Consolidate startup, interval, webhook, and CLI behavior into one coordinator, reducing duplicate logic and expanding test reuse.
- Reuse the existing 15-minute metadata cooldown, 20-item repair batch, audit service, canonical audiobook registry, and chapter cache.
- Give 5D a stable outbox so chapter proof does not need to rediscover identity, media changes, or deduplication rules.
- Add safe operational measures—last success, changed books, pending enrichment, conflicts, and retry state—without returning manual metadata repair to the household dashboard.
- Preserve explicit discovery, identity, enrichment, and chapter-proof states so later UI and reporting work can explain metadata truth without another vocabulary reset.

## Drift Controls

- Do not equate webhook success with a complete library scan.
- Do not require an external scheduled CLI task for discovery correctness.
- Do not remove or fork the CLI scan behavior.
- Do not classify arbitrary long tracks outside the configured Audiobooks library as discovered audiobooks.
- Do not merge by title, author/title similarity, or track count.
- Do not describe Plex tracks/files as verified chapters.
- Do not make metadata enrichment or chapter proof a prerequisite for retaining playback evidence.
- Do not create household-facing metadata repair issues or buttons.
- Do not add a new external metadata provider, public scan mutation endpoint, separate worker process, or distributed scheduler.
- Do not delete historical data or overwrite good metadata with failed-refresh placeholders.
- Do not expose private paths, credentials, tokens, or raw provider/Plex payloads.

## Out Of Scope

- Invoking the external `audiobook` project or processing 5D proof jobs.
- Importing, validating, or activating chapter boundaries.
- Reworking Progress chapter math or dashboard layout.
- Automatically repairing media files or writing metadata back to Plex/media.
- Extending discovery beyond the configured Plex Audiobooks library.
- Solving low-confidence title similarity or arbitrary franchise taxonomy.

## Likely Files Or Areas

- `src/service/audiobookScannerService.ts` and a focused discovery coordinator
- `src/service/metadataService.ts` and `src/service/audiobookService.ts`
- `src/server/app.ts`, webhook routing, CLI/config seams
- SQLite schema/migrations and audit/state contracts
- `tests/run-tests.mjs` plus tool/production documentation affected by actual interfaces

## Implementation Sequence

1. Define typed trigger, run-result, identity-state, media-revision, and outbox contracts.
2. Add the additive migration and repeatable fresh-schema support.
3. Add a direct rich-metadata persistence seam and remove scanner per-track refetches.
4. Implement identity reconciliation, conflict handling, last-seen state, revision calculation, and safe metadata preservation.
5. Add persisted enrichment cooldown/backoff and bounded enrichment processing.
6. Implement the transactional discovery coordinator and outbox publication.
7. Route CLI and webhook triggers through the coordinator without breaking existing response fields.
8. Add the independent PM2 startup/interval runtime with lease, heartbeat, cooldown, and stop/test seams.
9. Add safe health/audit output and durable contract documentation.
10. Add deterministic regression coverage, run the block gate, deploy/restart, and run the live smoke gate.

## Acceptance Criteria

- The PM2 service discovers the configured Audiobooks library without Tautulli, Discord, manual CLI use, or an external scheduler.
- Startup, interval, webhook, and CLI triggers share one coordinator, one lease, one identity path, and one result contract.
- Repeated or overlapping triggers are skipped or deduplicated; PM2 restart does not create a scan storm.
- The library list is not followed by one redundant Plex metadata request per healthy track.
- Stale rating keys recover through saved GUID evidence while failed refreshes preserve better existing metadata and covers.
- Identity follows the defined folder, exact-ASIN, then GUID-linkage rules; title-only merges never occur and conflicts remain visible in safe admin state.
- Provider retries are cached, bounded, and persisted; outages leave discoverable pending records and no household repair action.
- Scan counts distinguish tracks from books and distinguish new, changed, known, pending, conflicting, and failed outcomes.
- A second unchanged scan reports zero new books and zero new outbox events.
- A changed stable media revision creates exactly one new outbox event; incomplete, failed, conflicting, missing, or unchanged books create none.
- Partial scans do not mark unvisited media missing and never delete historical evidence.
- Existing CLI/tool consumers remain compatible, and public/admin output remains privacy-safe.
- 5D can consume the documented outbox without redefining discovery, identity, revision, or deduplication semantics.

## Verification

- Run `npm run verify:block` using the isolated fixture database and test-owned port.
- Deterministically test startup cooldown, lease contention, expiry recovery, heartbeat, explicit stop, and restart behavior without real-time waits.
- Test healthy direct ingestion, stale-key GUID recovery, folder/ASIN/GUID precedence, identity conflicts, folder moves, rating-key churn, and missing stable revision evidence.
- Test provider timeout, rate-limit, no-match, retry schedule, enrichment cap, and preservation of prior good metadata.
- Test full-success, partial, failed, repeated, and changed-revision scans plus transactional outbox deduplication.
- Test CLI and webhook compatibility and structured privacy-safe errors.
- Before first live rollout, back up the SQLite database, rebuild/restart PM2, verify exactly one eligible scan, and inspect safe scan/outbox counts.
- Re-run discovery and verify idempotency: `booksNew = 0` and `outboxEnqueued = 0` for unchanged media.
- Run `npm run verify:live-dashboard` after restart and confirm audiobook cards retain covers/fallback metadata without adding metadata repair actions.
