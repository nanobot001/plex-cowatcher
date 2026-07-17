# Block 3-2n-6E-3C: Plex Historical Movie Backfill

> Status: Planned.
> Result: Not implemented.
> Notes: Corrective data-completeness block after 6E-3B. Supplement detailed post-2022 Tautulli history with explicit pre-2022 Plex last-view evidence, beginning with movies.

## Goal

Recover defensible historical movie evidence that exists in Plex but is absent from the imported Tautulli history. The default source boundary is `2022-01-01T00:00:00.000Z`: Tautulli remains the detailed playback source on and after that boundary, while Plex may contribute one explicitly labeled historical last-view observation before it. This is best-effort additive recovery: some users will not be visible or salvageable through Plex, and Plex may be less complete than the Tautulli history already captured. The result must improve coverage without presenting Plex aggregate state as a complete play-by-play history or treating Plex absence as proof that a watch never occurred.

## Dependencies And Entry Gate

- 3-2n-6E-3A replay/session provenance remains implemented and verified.
- 3-2n-6E-3B title-scoped Plex identity/metadata refresh is implemented, or its exact-GUID resolution seam is reused without duplicating refresh behavior.
- The existing Plex user-token path and exact GUID stale-rating-key recovery remain the source of truth for direct Plex reads.

## Scope

- Add a read-only, dry-run-first Plex historical movie backfill operation that enumerates Plex-visible users and movie libraries, then reads per-user movie metadata through Plex user context.
- Persist a durable raw Plex watch-state snapshot or equivalent provenance-safe record containing user identity, exact Plex GUID, current rating key, `viewCount`, `lastViewedAt`, query time, and outcome/error status without storing tokens or private upstream URLs.
- Materialize at most one historical `playback_observations` row per user/title when Plex returns a valid `lastViewedAt` strictly before the cutoff. Mark it as Plex-derived historical evidence, leave `tautulli_row_id` empty, and do not invent individual plays from `viewCount`.
- Preserve all existing Tautulli observations as-is. Plex backfill is additive only: it must never overwrite, delete, downgrade, or replace richer Tautulli evidence, even when Plex returns a lower view count or an older/incomplete state.
- Resolve stale CoWatcher rating keys by exact non-empty Plex GUID before inserting; never use title matching or fuzzy matching for historical recovery.
- Merge the Plex-derived pre-cutoff projection with Tautulli-derived observations on/after the cutoff without duplicating an exact user/GUID/time observation or weakening existing replay/session semantics.
- Expose structured CLI output for dry-run, apply, skipped/ambiguous items, inaccessible/deleted items, and rerun counts. Apply must remain local SQLite-only and must never write to Plex or Tautulli.
- Make reruns idempotent and bounded, with an operator-visible summary of what Plex could prove, what it could not prove, and what was intentionally not imported.
- Report coverage per configured user, including Plex-visible, Plex-inaccessible, no defensible timestamp, imported, duplicate/already-covered, and not-salvageable outcomes. Do not label a user or title historically complete merely because a Plex scan finished.
- Add read-surface/source labeling so historical Plex evidence is distinguishable from detailed Tautulli playback history in watch-history and shared detail responses where it appears.

## Out Of Scope

- Reconstructing every historical play, exact replay count, session, or co-watch relationship from Plex `viewCount` and `lastViewedAt`.
- Treating Plex as a complete replacement for Tautulli or assuming all configured users can be recovered through Plex.
- Inferring a pre-2022 watch when Plex only returns a post-cutoff `lastViewedAt`, a missing timestamp, or an aggregate count without a defensible date.
- Backfilling episodes, audiobooks, music tracks, or removed media in this first movie slice.
- Querying Plex users who are not visible/accessible through the configured Plex account and server-sharing model.
- Replacing Tautulli polling/backfill for current history or changing Tautulli data.
- Any Plex mutation, library refresh, artwork edit, or automatic recurring worker in this block.

## Likely Files Or Areas

- `src/adapters/plexAdapter.ts`
- `src/service/` (new Plex historical backfill service and shared provenance types)
- `src/db/schema.sql` and a new migration for raw Plex snapshot/source fields
- `src/cli/cli.ts`
- `src/service/queryService.ts` and affected dashboard/detail read models
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs` if source labeling changes a durable dashboard contract
- `docs/data/`, `docs/logic/`, and `docs/testing/` for the source-boundary and fixture contract

## Acceptance Criteria

- A dry-run against fixtures discovers per-user movie state, resolves a stale rating key to the current key by exact GUID, and reports candidate/importable/skipped counts without changing SQLite.
- Apply imports a pre-cutoff Plex last-view record as one explicitly labeled historical observation, preserves the source user and canonical GUID, and leaves Tautulli row identity absent.
- The Civil War-shaped fixture proves a Plex 2020 last-view record can coexist with a Tautulli 2022+ record for the same user/title without duplicate exact-time rows or false replay inflation.
- Plex `viewCount > 1` does not create multiple fabricated playback rows; the stored record clearly communicates that Plex supplied aggregate count plus last-view evidence only.
- Missing timestamps, post-cutoff timestamps, inaccessible media, deleted media, users outside the Plex-visible set, and ambiguous identity matches are skipped with structured reasons and remain auditable.
- A second identical apply produces zero new observations and no duplicate raw snapshots beyond the defined idempotent snapshot policy.
- Existing Tautulli observations remain unchanged when Plex has no matching row, a lower/incomplete count, or a conflicting source result; query filters, session reconstruction, replay semantics, and Plex mutation paths remain behaviorally compatible.
- The run summary distinguishes “not found in Plex” from “confirmed not watched”; no missing Plex result is rendered as negative viewing evidence.
- No token, private Plex URL, local path, raw upstream error, or sensitive credential crosses the CLI/public response boundary.
- `npm run verify:block` passes before the block is marked implemented. If the deployed service is rebuilt or restarted, `npm run verify:live-dashboard` also passes.

## Verification

- `npm run verify:block`
- Focused service tests for per-user Plex reads, exact-GUID stale-key recovery, cutoff handling, provenance, idempotency, dry-run/apply separation, and failure classification.
- Fixture/database assertions showing Tautulli post-2022 observations and Plex pre-2022 evidence coexist without fabricated replay/session claims.
- Read-only live canary for one known movie and one known Plex-visible user, confirming current rating-key resolution and returned `viewCount`/`lastViewedAt` are stored with explicit source labels.
- `npm run verify:live-dashboard` after any production rebuild/restart.
