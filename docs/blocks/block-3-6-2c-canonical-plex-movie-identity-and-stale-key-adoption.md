# Block 3-6-2C: Canonical Plex Movie Identity And Stale-Key Adoption

> Status: Planned.
> Result: Not implemented.
> Notes: Corrective follow-on to 3-6-2A/2B; establish one local movie identity across exact Plex rating-key churn before broader Plex historical recovery in 3-6-4.

## Goal

Make every movie projection resilient to Plex rating-key churn. When multiple local rating keys represent the same movie through an exact non-empty Plex GUID, CoWatcher must preserve the source keys and historical observations while presenting one canonical movie identity for metadata, artwork, refresh, grouping, and detail navigation.

## Scope

- Inventory movie catalog, playback, and archive references that share an exact non-empty Plex GUID, with a dry-run report separating canonical candidates, stale aliases, unresolved identities, and ambiguous cases.
- Define or reuse a durable local canonical movie identity and alias relationship so old Plex rating keys remain queryable source evidence without becoming separate dashboard movies.
- Resolve the current Plex rating key through exact GUID evidence when a stale key is refreshed, and persist the returned metadata/artwork fingerprints and revision inputs so the displayed canonical identity changes when Plex artwork changes.
- Make dashboard media grouping, detail resolution, refresh, poster, and backdrop paths consume the canonical movie identity while retaining original rating keys for observation history and auditability.
- Add an explicit, idempotent local repair path with dry-run-by-default behavior; apply requires `--apply --confirm`, writes only CoWatcher's database, and reports repaired, already-canonical, unresolved, ambiguous, and failed outcomes.
- Preserve source-aware history and archive links without copying, deleting, or rewriting playback observations merely because rating keys converge.

## Out Of Scope

- Writing to Plex or Plex's SQLite database, deleting Plex rating keys, or asking Plex to rescan or change agent metadata.
- Title-only, fuzzy, year-only, or runtime-only identity promotion; media without exact identity evidence remains unresolved.
- Episode, audiobook, music, or photo identity repair unless a later block explicitly extends the same contract.
- Plex supplemental historical recovery, play reconstruction, replay/session fabrication, or changes to Tautulli ingestion completeness in 3-6-3/3-6-4.
- A dashboard-wide redesign unrelated to canonical identity, stale-key grouping, or artwork revision propagation.

## Likely Files Or Areas

- `src/db/` and a new additive migration if the existing archive alias model cannot represent catalog-facing movie aliases
- `src/service/metadataService.ts`, `src/service/dashboardDetailRefreshService.ts`, and `src/service/artworkService.ts`
- `src/service/dashboardService.ts` and the movie grouping/detail read models
- `src/adapters/plexAdapter.ts` for exact current-key recovery by Plex GUID
- `src/cli/cli.ts`, `docs/tool-manifest.yaml`, and `docs/tool-surface.md` for the repair/report command
- `tests/run-tests.mjs` and `tests/e2e/dashboard-regression.spec.mjs` for stale-key, refresh, revision, grouping, and idempotency coverage
- `docs/continue-here.md`, `docs/roadmap.md`, and `docs/blocks/README.md`

## Acceptance Criteria

- A fixture with one stale movie rating key and one current rating key sharing an exact Plex GUID resolves to one canonical movie projection; both original keys and their source observations remain queryable.
- Refreshing the stale-key detail resolves the current Plex key, updates the canonical metadata/artwork state, changes the displayed artwork revision when poster or backdrop sources change, and returns working poster and backdrop responses.
- Movie library/search/activity/detail projections do not create duplicate cards or duplicate history solely because Plex changed the rating key; exact-GUID history remains grouped with source-aware evidence.
- A dry-run reports all exact-GUID duplicate/stale candidates without changing catalog, alias, observation, archive, or audit data rows beyond permitted startup migrations; apply is explicit, idempotent, and retry-safe.
- Ambiguous, missing, or conflicting identities remain unresolved and are not promoted through title-only matching; no Plex or Tautulli source data is mutated.
- The repair and refresh contracts preserve privacy boundaries, structured errors, stable tool names, and the existing dashboard artwork cache/revision contract.

## Verification

- `npm run verify:block`
- Deterministic stale/current movie fixture covering exact-GUID canonical selection, alias preservation, refresh from the stale key, changed and unchanged poster/backdrop revisions, and no duplicate dashboard grouping.
- Idempotent dry-run/apply tests covering repaired, already-canonical, unresolved, ambiguous, and failed outcomes.
- Read-only live dry-run inventory confirming the current exact-GUID movie candidate count and no source-database writes.
- `npm run verify:live-dashboard` after any deployed rebuild or restart.
