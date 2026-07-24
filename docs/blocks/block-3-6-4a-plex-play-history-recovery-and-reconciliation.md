# Block 3-6-4A: Plex Play-History Recovery And Reconciliation

> Status: Implemented; live rollout pending.
> Result: Deterministically verified on 2026-07-21.
> Notes: Corrective child block for 3-6-4 after live validation showed that Plex exposes multiple dated play-history rows that the aggregate `lastViewedAt` recovery path does not ingest. The projection remains disabled by default and no live apply, PM2 restart, or deployed-dashboard change was performed.

## Goal

Recover and display the dated Plex play-history rows for configured users across movies and TV episodes, preserving multiple plays per exact media identity and reconciling overlapping Tautulli evidence without overwriting either source or fabricating history.

## Dependencies And Entry Gate

- 3-6-1 remains authoritative for source provenance, event time, ingestion time, confidence, unknown semantics, and conflict handling.
- 3-6-2/2C provide exact Plex identity, stale rating-key alias, and canonical media rules. Do not use title-only or guessed episode identity.
- 3-6-3 provides the existing resumable Tautulli ingestion and reconciliation vocabulary. Do not replace its checkpoints or mutate Tautulli.
- 3-6-4 provides the compatibility CLI, aggregate Plex recovery tables, episode hierarchy fields, dry-run/apply confirmation, and archive-aware read-model seam. Extend those seams rather than creating a second public backfill command.
- The live source contract must be revalidated with a read-only canary before implementation: Plex `/status/sessions/history/all` filtered by `metadataItemID` and/or `accountID` must return the expected dated rows for one known episode and one movie.

## Scope

- Add a Plex play-history adapter contract for paginated `/status/sessions/history/all` reads. Normalize `historyKey`, local Plex account ID, rating key, media type, hierarchy, viewed timestamp, and source metadata without exposing tokens or private paths.
- Resolve configured users to the Plex server's local account IDs through the existing account/user contract. Do not confuse Plex cloud user IDs with the server-local `accountID` required by play history.
- Persist each returned Plex history row as an additive source observation or source-ledger row with a stable source record key. Allow multiple rows for one user/media identity; reruns must be idempotent.
- Resolve current/stale rating keys to exact non-empty GUID identity when available. If a historical row cannot be safely resolved, retain it as unknown source evidence rather than dropping it or joining by title.
- Reconcile Plex play-history rows with Tautulli observations by exact user/media identity and a documented source-time relationship. Preserve both source timestamps and source record IDs; link one real play without counting the same play twice, while retaining genuinely separate plays.
- Extend the existing `project.plex_historical_backfill` contract with an explicit play-history mode and bounded date/media/user filters. History mode must not silently discard valid returned dates because of the legacy pre-2022 aggregate cutoff; aggregate fallback behavior remains compatibility-controlled.
- Update watch-history, TV hierarchy, episode lazy history, and relevant detail/read models to show every distinct recovered play with an explicit source label such as Plex play history, Tautulli, or reconciled.
- Keep dry-run as the default, require explicit apply confirmation, write only to CoWatcher's local SQLite database, and record structured run/outcome/audit state.

## Out Of Scope

- Writing to Plex, Tautulli, the Plex library database, or Plex account watch state.
- Replacing the existing Tautulli ingestion worker, checkpoints, or source rows.
- Treating `viewCount` or aggregate `lastViewedAt` as multiple plays when play-history rows are unavailable.
- Title-only, fuzzy, year-only, runtime-only, or guessed season/episode joins.
- A recurring automatic Plex history worker; scheduling remains a later operational decision.
- Archive export/backup work from 3-6-5 or achievements work from 3-6-6.

## Likely Files Or Areas

- `src/adapters/plexAdapter.ts` and `src/types/index.ts` for the paginated Plex history contract, account mapping, and normalized source rows.
- `src/service/plexHistoricalMovieBackfillService.ts` or a narrowly extracted shared coordinator for dry-run/apply, idempotency, identity resolution, source linking, and compatibility output.
- `src/db/schema.sql` plus an additive migration after version 24 for source history keys, source account IDs, source-row links, and any bounded reconciliation state.
- `src/service/queryService.ts`, `src/service/dashboardService.ts`, and `src/web/static/dashboard.js` for per-play source-aware read models and TV episode history presentation.
- `src/service/tautulliBackfillService.ts` or shared provenance helpers only if Tautulli source interval fields are required to make reconciliation auditable.
- `docs/tool-surface.md`, `docs/tool-manifest.yaml`, and relevant archive/provenance documentation for the stable structured contract.
- `tests/run-tests.mjs` and `tests/e2e/dashboard-regression.spec.mjs` for exact multi-play, reconciliation, dry-run purity, idempotency, and visible TV-detail coverage.

## Acceptance Criteria

- A deterministic fixture with two Plex history rows for one episode and one matching Tautulli observation produces two distinct canonical plays, one auditable source link for the overlapping play, and no duplicate count.
- A deterministic fixture with two genuinely separate Plex plays for the same user/episode preserves both dates and reports the episode as repeated without multiplying either row through `viewCount`.
- Movies and episodes use the same paginated history coordinator, while episode show/season/episode hierarchy and exact identity remain populated.
- Play-history pagination resumes safely, handles an empty page and a bounded API failure structurally, and never treats an incomplete scan as complete history.
- A stale rating key with exact GUID evidence resolves through the existing alias/canonical identity path; a missing or conflicting identity remains unknown and is not title-matched.
- Re-running apply with the same Plex `historyKey` imports no duplicate source row and does not alter existing Tautulli observations. Dry-run leaves recovery/source rows unchanged.
- The CLI/API output reports returned, imported, already-present, linked, unresolved, unknown, and failed outcomes by user and media type, without leaking tokens, raw upstream URLs containing secrets, or private filesystem paths.
- Watch-history and TV detail surfaces show every distinct recovered play for the fixture, include source provenance, and keep aggregate Plex evidence out of fabricated sessions/co-watch events unless the source rows satisfy the existing replay/session contract.
- A read-only live canary for one known movie and one known TV episode confirms exact account filtering, returned history rows, source timestamps, reconciliation candidates, and zero external writes before any apply is considered.
- The implementation passes `npm run verify:block`; if the deployed dashboard is rebuilt or restarted, `npm run verify:live-dashboard` also passes.

## Verification

- `npm run build`
- `npm test`
- `npm run test:dashboard-regression`
- `npm run verify:tools`
- `npm run verify:block`
- Read-only live canary using one known movie and one known TV episode, including paginated Plex history and exact account filtering.
- After any deployed dashboard rebuild/restart: `npm run verify:live-dashboard`.

## Completion Note (2026-07-21)

Implemented the approved A1/A2/A3 slices within this corrective block:

- A1 adds migration 25, paginated local-account Plex play-history reads, dry-run/apply confirmation, a consistent SQLite backup, durable run/user/page/source-row state, bounded retries, source-drift detection, safe resume, exact source-record idempotency, and unresolved retention when exact identity is unavailable.
- A2 preserves Tautulli session start/stop timestamps and links a Plex point play only when exact user, media type, non-empty GUID, and one interval within the documented 120-second tolerance agree. Source events and timestamps remain separate; links suppress duplicate projection without overwriting Tautulli.
- A3 extends the existing `project.plex_historical_backfill` command with `--history-source play-history`, adds bounded user/media/date/page/run/report controls, and projects completed runs into history, activity, People, and TV hierarchy/detail only when `PLEX_PLAY_HISTORY_PROJECTION_ENABLED=true`. Point plays may prove a different-day replay but never fabricate sessions or co-watch evidence.

Deterministic evidence:

- `npm run verify:block` passed with 128/128 service/integration tests.
- Dashboard regression passed with 61 tests and one intentional narrow-project skip, including desktop and 320px TV episode provenance coverage.
- JavaScript syntax and tool-contract verification passed.
- The 500-row Overview load check measured 169 ms against its 300 ms budget in the authoritative gate.

Rollout boundary:

- The implementation turn did not perform live writes. The separate operator-controlled rollout completed on 2026-07-23 after known-movie and known-episode canaries, copied-database validation, a verified production backup, Tautulli interval enrichment, dry runs, and mapped-account applies.
- Production retained 4,748 distinct Plex source events: 4,099 episode plays and 649 movie plays. Ten configured accounts mapped exactly; three profiles without an exact Plex local-account match were left untouched and remain unknown.
- Projection is enabled in the deployed local runtime. The live Cheers pilot proof returns both dated plays, two viewing days, one replay, and separate `Plex + Tautulli` and `Plex play history` provenance.
- Live verification exposed and corrected projection performance, optional-catalog fallback, and the former 200-play TV hierarchy sampling gap. `npm run verify:block` passes with 130/130 service tests and 61 browser regressions with one intentional skip; `npm run verify:live-dashboard` passes after the final CoWatcher-only restart.
- Legacy rows ingested before migration 25 have no reconstructable Tautulli stop time. Play-history output therefore reports interval readiness explicitly; rerun the existing confirmed Tautulli backfill for selected users before Plex apply when readiness is `missing` or `partial`. Do not weaken reconciliation to timestamp proximity.
