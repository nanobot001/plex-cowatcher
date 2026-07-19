# Block 3-6-2A: Legacy Plex Identity Bridge And Archive-Owned View Recovery

> Status: Implemented on 2026-07-18.
> Result: The existing CoWatcher SQLite database now owns a source-aware external movie archive, with read-only Plex view import, exact stable-identity bridging, and explicit links back to canonical CoWatcher observations without copying them.
> Notes: The live Plex canary remains dry-run only. Rows without a verified stable identity, usable account, or exact mapping remain preserved as unresolved archive evidence; this block does not guess their media identity.

## Goal

Promote the existing CoWatcher SQLite database into the archive-owned boundary that preserves external watch evidence independently of Plex and Tautulli database shape. Add the missing canonical identity and source-event layers there, import Plex's durable local movie-view records, bridge legacy and current Plex identities when a stable external identity proves they refer to the same media, and link matching external records back to canonical CoWatcher observations without duplicating them.

## Dependencies And Entry Gate

- 3-6-1 archive evidence and provenance semantics are defined and accepted.
- 3-6-2 canonical media identity and alias semantics are defined and accepted.
- 3-2n-6E-3C remains the existing Plex supplemental movie slice; this block extends its data ownership rather than creating a second historical backfill path.

## Scope

- Extend the existing CoWatcher SQLite database with archive-owned tables for canonical media, source identity aliases, source watch records, ingest runs, and explicit reconciliation links. Plex and Tautulli remain read-only sources; do not create a second archive database in this block.
- Keep existing `playback_observations` and `plex_historical_movie_snapshots` as their own canonical CoWatcher/source-snapshot records; do not copy them into `archive_watch_events`.
- Add a read-only Plex library-database adapter for movie `metadata_item_views` records, retaining Plex account identity, source row identity, source GUID, title snapshot, event timestamp, and ingestion timestamp without exposing database paths or credentials.
- Bridge legacy and current Plex identities through verified stable identifiers such as IMDb/TMDb or an equivalent exact provider mapping. Store every old GUID/rating key as an alias of the canonical archive media identity with resolution method and confidence.
- Preserve Plex source events separately when Plex and CoWatcher describe the same viewing. Reconciliation links archive events to existing `playback_observations` through exact GUID, user, and bounded time-window evidence; it does not overwrite richer timing, fabricate plays from aggregate state, or erase the original source record.
- Represent unresolved, ambiguous, removed, and metadata-incomplete media as queryable archive records instead of falling back to `Unknown Media` or dropping the watch event.
- Add a dry-run/apply archive import operation with structured counts for imported, already-covered, reconciled, unresolved, ambiguous, and failed external records. Apply writes only external Plex rows and reconciliation links into the existing CoWatcher database and is idempotent.
- Add bounded additive read paths so the dashboard activity, Overview, People, and movie-detail contracts can show canonical titles with source-aware historical records, including legacy records that no longer have a current Plex item where exact current identity is still available.

## Out Of Scope

- Episode, audiobook, music, or photo identity recovery; those remain later archive slices.
- Fuzzy or title-only matching, including treating equal titles as proof of equal media.
- Writing to Plex, Tautulli, or Plex's SQLite database; repairing or mutating any source database.
- Reconstructing every play from Plex `viewCount`, `lastViewedAt`, or `metadata_item_views` when the source does not provide a defensible event.
- Replacing the resumable Tautulli completeness work in 3-6-3 or the broader Plex recovery work in 3-6-4.
- Achievements, exports, or a dashboard-wide redesign beyond the minimal canonical archive read contract.

## Likely Files Or Areas

- `src/archive/` or `src/service/` for archive-owned types, import, reconciliation, and query services
- `src/adapters/` for the read-only Plex library-database adapter and normalized source records
- `src/db/` and a new migration/schema for archive media, aliases, events, links, and ingest runs
- `src/db/` and runtime wiring for the existing CoWatcher database boundary
- `src/cli/cli.ts`, `docs/tool-manifest.yaml`, and `docs/tool-surface.md` for structured dry-run/apply tooling
- `src/service/dashboardService.ts` and shared detail read models for canonical archive projections
- `tests/run-tests.mjs`, `tests/e2e/dashboard-regression.spec.mjs`, and archive fixtures
- `docs/data/`, `docs/logic/`, `docs/architecture/`, and `docs/testing/` for durable archive contracts

## Acceptance Criteria

- An Ant-Man-shaped fixture containing a 2018 legacy IMDb GUID and 2020 current Plex GUID resolves to one canonical archive media identity through a verified stable identifier; both Plex viewing records remain queryable with their original source GUIDs and dates, while the existing CoWatcher observation remains in `playback_observations` and links to the matching Plex event.
- A source record whose current metadata is unavailable remains queryable with its raw title/GUID snapshot and an explicit unresolved or metadata-incomplete status; it is never rendered as an unqualified `Unknown Media` event or silently discarded.
- Plex database view rows are imported read-only, account-aware, and idempotently; rerunning the same import creates no duplicate archive events and does not alter Plex or Tautulli.
- Existing CoWatcher observations and Plex-derived archive observations remain source-distinct without duplicate CoWatcher rows. A reconciliation link can explain that records refer to the same canonical media/event without downgrading detailed timing or inventing precision.
- Ambiguous aliases, missing stable identifiers, duplicate source rows, deleted media, and unavailable accounts receive structured outcomes and remain auditable.
- Archive queries return canonical title, person, event time, source event time, source, original identity, resolution method, confidence/unknown state, and ingestion time without requiring the media to remain in Plex.
- A dry-run reports proposed external changes without archive data-row writes (startup may apply idempotent schema migrations); apply is explicit, backed up according to the archive policy, and safe to retry.
- No source database path, token, private upstream URL, or raw sensitive diagnostic crosses the public CLI/HTTP response boundary.
- `npm run verify:block` passes before the block is marked implemented. If the deployed dashboard or service is rebuilt/restarted, `npm run verify:live-dashboard` also passes.

## Verification

- `npm run verify:block`
- Deterministic archive fixtures for legacy/current GUID bridging, exact stable-ID matching, ambiguity, removed media, source coexistence, dry-run purity, idempotency, and unknown-state preservation.
- Read-only live canary against Plex's local database for Ant-Man and another known title, confirming that legacy and current view rows are imported into the archive without source mutation.
- Archive query assertion showing the 2018 Ant-Man record and the 2020 current-identity record under one canonical media identity while retaining separate provenance.
- `npm run verify:live-dashboard` after any production rebuild/restart.

## Completion Note

- Added schema/migration versions 19-20 for canonical archive media, identity aliases, external source watch events, archive ingest runs, and links back to existing `playback_observations`.
- Added `project.archive_plex_view_recovery` with explicit dry-run/apply/confirm behavior and a read-only Plex SQLite adapter for movie `metadata_item_views`.
- Existing CoWatcher playback observations and historical snapshot records remain canonical in their existing tables; the importer no longer copies them into `archive_watch_events`.
- Plex legacy/current GUIDs bridge through exact provider IDs or explicit mapping rows, and matching Plex events link to existing CoWatcher observations through `archive_observation_links` without collapsing source records.
- Corrected account classification to prefer an existing local `userId` while retaining numeric Plex account IDs as raw provenance.
- The shared dashboard read model now includes resolved archive-only Plex events in activity/Overview and People, while movie detail history continues to show source-aware records. Exact linked overlaps are suppressed from the additive activity projection, archive-only rows are labeled `plex_archive_recovery`, and historical archive evidence remains out of replay/session fabrication.
- Deterministic verification passed: `npm run verify:block` (118 service/integration tests, 57 dashboard regression tests, one intentional narrow viewport skip, syntax, and tool contracts). The live dashboard smoke passed.
- A read-only live Plex dry-run reported 820 external Plex rows: 140 importable, 680 unresolved, one genuinely unmatched account, and 250 proposed links to existing CoWatcher observations. Existing CoWatcher observations are not counted as archive imports; no archive data rows were written to CoWatcher or Plex.
