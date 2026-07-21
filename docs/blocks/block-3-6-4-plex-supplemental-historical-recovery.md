# Block 3-6-4: Plex Supplemental Historical Recovery

> Status: Implemented on 2026-07-20.
> Result: Implemented.
> Verification: `npm run verify:block` passed: 124 service tests, 59 dashboard tests with one intentional narrow-viewport skip, JavaScript syntax, and tool contracts.
> Notes: The existing 3-2n-6E-3C movie backfill is now one archive-aware, best-effort recovery path for movies and episodes; no parallel backfill system was created. A read-only live episode canary found 104 pre-cutoff exact-GUID Plex-only candidates for `tonyhung`; the corresponding movie canary found 205 already-covered exact-GUID records and no importable candidates. No live apply or deployment restart was performed.

## Goal

Recover Plex-only historical evidence without pretending Plex can reconstruct the detailed history that Tautulli provides.

## Dependencies And Entry Gate

- 3-6-2A/2B/2C are the current archive, account, and exact Plex movie-identity contracts. Reuse their archive-owned database boundary, account-resolution rules, canonical movie identity, and alias resolution.
- 3-6-3 is the current Tautulli completeness/reconciliation contract. Reuse its durable run vocabulary and distinguish source absence from local ingestion failure; do not start a second Tautulli scan or alter its checkpoints.
- 3-2n-6E-3C is the existing movie recovery implementation. Generalize its service, persistence, CLI, and compatibility output in place rather than adding a second movie backfill command or service.
- 3-6-1 remains the authority for event time, last-view time, ingestion time, source provenance, confidence, and unknown semantics.

## Design Decisions

- Keep `playback_observations`, Tautulli ingestion rows, and Plex recovery snapshots/source evidence distinct. Reconciliation adds links or read-model state; it does not overwrite, copy, delete, or downgrade richer Tautulli observations.
- Preserve the existing `project.plex_historical_backfill` tool name and default movie behavior. Extend it with a bounded media scope such as `movie`, `episode`, or `all`; preserve existing structured fields while adding media-type and coverage fields. Do not expose a second public mutation route.
- Use a single generalized recovery service and one resumable run model. An additive migration may add a generic Plex recovery item ledger and episode identity columns while retaining the existing movie tables/columns as compatibility records; it must not fork movie and episode logic into unrelated persistence paths.
- Match only through exact non-empty Plex GUID/canonical identity plus exact configured user identity. Rating keys are retained as source aliases and may be refreshed through the existing exact-GUID current-key resolver. Title, year, runtime, season/episode number, or date alone never promotes identity.
- A valid Plex `lastViewedAt` proves at most one dated Plex last-view observation for that user/media identity. `viewCount` is aggregate supporting evidence only and never creates additional plays, sessions, replays, or co-watch events.
- Machine-readable source status is `unknown`, `plex_only`, `tautulli_backed`, or `reconciled`; display copy may use `Unknown`, `Plex-only`, `Tautulli-backed`, and `Reconciled`. `unknown` describes incomplete/non-salvageable coverage and never becomes a negative watched row.
- Reconciliation uses the existing exact-GUID, same-user, bounded event-time link contract. If the exact identity is shared but no defensible time relationship exists, retain separate source evidence rather than calling it reconciled.

## Scope

- Incorporate the existing 3-2n-6E-3C movie slice rather than creating a second backfill path.
- Generalize the existing movie recovery service into a shared movie/episode recovery coordinator with the current dry-run/apply/confirm safety, verified SQLite backup before apply, bounded per-user failure handling, and compatibility output for existing movie callers.
- Add a Plex adapter contract for per-user episode state that hydrates the exact show/season/episode hierarchy from Plex-visible libraries, retaining episode rating key, GUID, parent/grandparent keys, season/episode numbers, title/library snapshots, `viewCount`, and `lastViewedAt`. Enumeration must be key-based and bounded; the existing title-only `listShows` result is not sufficient identity evidence.
- Add an additive generic recovery ledger/run extension for media type, source row identity, exact identity, account/visibility outcome, cutoff classification, timestamp validity, imported observation link, and structured error code. Preserve existing movie snapshot rows and compatibility columns while routing movie and episode classification through the same idempotent persistence helper.
- Reuse exact configured-user/Plex-user attribution from 3-6-2B. Users not visible or not safely attributable through Plex receive `not_plex_visible`/`unknown_account` coverage outcomes; no date-based household assumption fills the gap.
- Apply one configurable cutoff policy (defaulting to the existing `2022-01-01T00:00:00.000Z` boundary). Import only a valid Plex last-view strictly before the cutoff; classify post-cutoff, missing, malformed, inaccessible, and ambiguous results without turning them into unwatched evidence.
- Materialize at most one Plex-derived historical observation per exact user/media identity and defensible last-view timestamp. Use the existing Plex provenance, leave Tautulli row identity absent, keep episode hierarchy fields populated, and ensure replay/session evaluators continue to exclude aggregate Plex recovery from fabricated sessions or replays.
- Reconcile Plex recovery with existing Tautulli observations and archive-owned source events by exact user/GUID and the bounded time-link contract. Expose `unknown`, `plex_only`, `tautulli_backed`, and `reconciled` in archive-aware read models and coverage reports while retaining each source's original timestamp and ingestion timestamp.
- Add coverage summaries by user, media type, source, and outcome, including Plex-visible, Plex-inaccessible, returned-but-not-stored, imported, already covered, post-cutoff, missing GUID, missing timestamp, ambiguous identity, not returned, and not salvageable. A completed scan is never presented as complete watch history.
- Keep all writes local to CoWatcher's SQLite database. Dry-run must not write recovery data rows; apply requires explicit confirmation, remains retry-safe, and never writes Plex, Tautulli, or the Plex library database.
- Add only the minimal source labels/read-model changes needed for Activity, Overview/People, and Movie/TV detail evidence. Keep archive evidence out of existing replay/session counts and avoid a dashboard redesign.

## Out Of Scope

- Claiming complete play-by-play history from `viewCount` and `lastViewedAt`.
- Backfilling media that neither source can identify safely.
- Automatically marking Plex items watched or changing Tautulli.
- Replacing the resumable Tautulli ingestion/reconciliation operation or introducing a second archive database/backfill coordinator.
- Treating a missing Plex row, missing `lastViewedAt`, `viewCount = 0`, or an inaccessible account as proof that the item was not watched.
- Hydrating episodes through title-only show lookup, fuzzy matching, or guessed season/episode identity.

## Likely Files Or Areas

- `src/adapters/plexAdapter.ts` and `src/types/index.ts` for the per-user episode-state contract, exact hierarchy fields, and bounded Plex errors
- `src/service/plexHistoricalMovieBackfillService.ts` (generalized in place, with a compatibility export) and related shared archive/reconciliation helpers
- `src/db/schema.sql` plus an additive migration after version 23 for generic recovery items/counts and episode identity fields; retain existing movie snapshot compatibility
- `src/service/dashboardService.ts`, archive read/projection services, and replay/session evaluators for source-status labels and no-false-replay behavior
- `src/cli/cli.ts`, `docs/tool-surface.md`, and `docs/tool-manifest.yaml` for the extended structured CLI contract and stable tool name
- `tests/run-tests.mjs` for deterministic movie/episode fixtures, dry-run purity, idempotency, coverage outcomes, exact identity, and source reconciliation
- `tests/e2e/dashboard-regression.spec.mjs` if source-status or episode-detail presentation creates a durable cross-surface invariant
- `docs/logic/`, `docs/data/`, `docs/testing/`, and `docs/continue-here.md` for cutoff, evidence-status, fixture, and operational handoff contracts

## Acceptance Criteria

- The Civil War fixture recovers a Plex-only pre-cutoff record while preserving later Tautulli observations.
- The Sentenced-to-Be-a-Hero fixture hydrates all 12 episodes and can recover Plex-only episodes 11-12 without title-only joins or marking unrecoverable episodes unwatched.
- Users unavailable through Plex and media without defensible dates receive structured non-salvageable outcomes.
- Repeated runs are idempotent and produce coverage reports by user, media type, source, and outcome.
- A mixed movie/episode run reports coverage separately by user and media type, preserves source-specific timestamps, and emits the four source-status values without collapsing distinct source rows.
- A Plex row with a shared exact GUID but no defensible event-time relationship to Tautulli remains source-distinct and is not labeled reconciled; a matching user/GUID/time-window pair creates an auditable link without changing either source row.
- A missing Plex account, inaccessible library, missing GUID, missing/malformed `lastViewedAt`, post-cutoff timestamp, and failed persistence each produce a structured non-salvageable/unknown outcome; none creates negative viewing evidence.
- Existing Tautulli observations remain unchanged when Plex has no matching row, a lower/incomplete count, or a conflicting source result; query filters, session reconstruction, replay semantics, and Plex mutation paths remain behaviorally compatible.
- No token, private Plex URL, local path, raw upstream error, or sensitive credential crosses the CLI/public response boundary.

## Verification

- `npm run verify:block`
- Deterministic Civil War and Sentenced-to-Be-a-Hero fixtures covering stale/current exact GUIDs, all 12 episode hydration, Plex-only episodes 11-12, Tautulli-backed rows, reconciled links, unknown outcomes, duplicate safety, and dry-run database immutability.
- Focused adapter tests for user visibility, bounded show/season/episode traversal, malformed timestamps, missing GUIDs, inaccessible libraries, and privacy-safe error mapping.
- Focused service tests proving `viewCount` never multiplies observations and recovered Plex evidence remains outside replay/session fabrication.
- CLI/tool-contract tests proving stable `project.plex_historical_backfill` output, explicit apply confirmation, coverage counts, and no token/path/raw-upstream leakage.
- Read-only live canaries for one movie and one episode family after deployment.

## Implementation Sequence

1. Confirm the current schema/version and fixture contracts from 3-6-2A/2B/2C/3-6-3, then add the migration and shared types without changing existing source rows.
2. Add the bounded per-user episode adapter/read contract and MockPlex fixtures for one 12-episode family, including incomplete and inaccessible responses.
3. Extract the existing 6E-3C classification/persistence logic into the shared movie/episode coordinator; keep movie defaults, provenance, backup behavior, and existing CLI fields compatible.
4. Add generic run/item coverage persistence and exact-GUID/user reconciliation against Tautulli observations and archive links. Verify unknown and non-salvageable states remain additive read evidence, never negative rows.
5. Extend archive/dashboard read models with source-status and source-label fields only where the evidence already appears; add regression coverage for no duplicate rows, no false replay/session counts, and required viewport/overflow invariants if UI changes.
6. Run the deterministic fixture suite and `npm run verify:block`; only after that, rebuild/restart if needed and run `npm run verify:live-dashboard`.
7. Perform bounded read-only live canaries for one known movie and one 12-episode family. Record returned coverage, unresolved/unknown outcomes, exact identity evidence, and whether any source writes occurred; do not enable an automatic recurring worker in this block.
