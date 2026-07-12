# Block 3-2n-5d-1: Revision Manifest And Safe Cache Activation

> Status: Planned.
> Result: Not implemented.
> Notes: First child of the 3-2n-5d umbrella. Establish the immutable media-revision and chapter-activation contracts before any external process or worker is introduced.

## Goal

Make each audiobook media revision reproducible and make verified chapter activation revision-safe. Discovery must preserve the exact ordered file set that produced an outbox revision, while Progress must use verified chapters only when their source revision matches the currently discovered media.

## Dependencies And Entry Gate

- Block 3-2n-5c is implemented and remains authoritative for identity and media-revision calculation.
- Blocks 3-2n-5a and 3-2n-5b remain authoritative for manual chapter import and source-honest Progress fallback.
- Implement this block before 3-2n-5d-2 or 3-2n-5d-3.

## Scope

- Add an immutable private manifest for each `(audiobook_id, media_revision)` containing the ordered stable identity, duration, private file path, and path hash used by the existing revision calculation.
- Persist the manifest and discovery outbox event in one transaction. Repeated scans may confirm an existing manifest but must never rewrite it.
- Add deterministic reconciliation for pre-manifest outbox rows: reconstruct only when current catalog evidence reproduces the exact hash, classify older revisions as `SUPERSEDED_REVISION`, and classify unreconstructable current revisions as `MANIFEST_UNAVAILABLE` without external invocation.
- Add revision/history tables for chapter sources and revision-bound chapter rows without rebuilding or removing the existing v13 active-cache tables.
- Implement one atomic activation service that writes revision history and refreshes the existing chapter tables as a backward-compatible active projection.
- Route `import-audiobook-chapters` through the activation service while preserving its dry-run/apply behavior and published JSON fields.
- Make Progress accept verified chapters only when the active source revision exactly matches `audiobook_books.current_media_revision`; otherwise retain current track/file fallback.
- Record multi-file manifests but classify them as unsupported for automatic single-file proof.

## Out Of Scope

- Invoking the external `audiobook` project.
- Adding proof jobs, timers, leases, retries, requeue commands, or PM2 runtime behavior.
- Constructing book-global chapter offsets for multi-file editions.
- Adding dashboard repair actions, public mutation routes, file writes, or chapter embedding.

## Data And Privacy Contract

- Manifest file paths remain private SQLite state and must never appear in CLI/API/health/audit output.
- Existing chapter cache tables remain readable after rollback; new revision tables are additive and transactional.
- Historical chapter revisions remain stored but become ineligible when their media revision differs from the current book revision.
- Legacy manual imports remain usable. When a current media revision exists, new imports bind to it; otherwise they remain explicitly legacy-scoped.

## Likely Files Or Areas

- `src/service/audiobookScannerService.ts`
- `src/service/audiobookService.ts` and Progress chapter-source reads
- SQLite schema/migrations and deterministic service/dashboard tests

## Acceptance Criteria

- A successful discovered revision commits one immutable manifest and one outbox event transactionally.
- Rating-key churn, metadata refresh, and later scans cannot change an existing revision manifest.
- Repeated unchanged scans create no duplicate manifest or outbox rows.
- Pre-manifest events are reconstructed only after exact revision-hash reproduction; superseded or unavailable events never trigger proof work.
- Chapter activation is atomic, revision-bound, and leaves the prior active projection unchanged on validation or transaction failure.
- Changed media makes stale verified chapters ineligible while retaining their historical source revision.
- Manual import remains dry-run by default and preserves its current structured result fields.
- Multi-file manifests remain on source-honest track/file fallback.
- Dashboard regression coverage proves stale-revision fallback without adding repair UI.

## Verification

- `npm run verify:block`
- Deterministic migration, manifest immutability, pre-manifest reconciliation, activation rollback, manual-import compatibility, and stale-Progress tests using the isolated fixture database.
