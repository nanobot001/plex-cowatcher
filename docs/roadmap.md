# Roadmap

This roadmap turns the project charter into implementation blocks. The MVP is **Phase 1**. Each old phase has been collapsed into a Phase 1 block so the project can move through `block-1-1`, `block-1-2`, and onward until MVP completion.

## Foundation: Scaffold Baseline

Status: mostly complete.

Purpose: make the project buildable, runnable, and tool-friendly before touching live Plex/Tautulli/Discord behavior.

Acceptance:

- TypeScript project builds with `npm run build`.
- Tests run with `npm test`.
- SQLite schema initializes with `npm run db:init`.
- Express exposes `/api/health`.
- CLI returns structured JSON.
- Browser shell opens at `http://localhost:8787`.
- Discord prompt builders and interaction handler call the shared service layer.
- Plex/Tautulli adapters exist with mock-safe seams.

## Phase 1: MVP

Phase 1 is complete when the service can perform both MVP workflows end to end:

- Discord co-watch confirmation from detected watch through audited prompt resolution.
- Preview-first history copy from source user to target user(s), with explicit apply and idempotent results.

### Block 1-1: Local Configuration And Health

Make the service honest about local readiness before real automation is enabled.

- Move from example-only user config to a local ignored config file such as `config/users.json`.
- Add config validation with clear startup errors for missing required values.
- Expand `/api/health` and `/api/status` to report database, Tautulli, Plex, Discord, watcher, and PM2-relevant state.
- Add a browser dashboard that shows health, configured users, pending prompts, and recent errors.

### Block 1-2: Tautulli Watch Detection

Reliably detect completed source-user watches without duplicate prompts.

- Implement Tautulli recent-history polling through `tautulliAdapter`.
- Normalize Tautulli rows into internal watch event inputs.
- Implement completion threshold logic and recent-window duplicate defense.
- Persist watch events in SQLite.
- Add tests with mocked Tautulli rows for movies and episodes.

### Block 1-3: Discord Co-Watch Flow

Make the Discord prompt workflow useful with mock Plex sync first, then verified live sync.

- Send a test prompt to the configured Discord channel.
- Send real prompts for pending watch events.
- Support typical co-watch users, everyone, no one, dismiss, and browser/admin link actions.
- Resolve prompts through `cowatchService.resolvePrompt`.
- Edit the Discord message with per-target sync results.

### Block 1-4: Plex Watched-State Verification

Prove or explicitly constrain the live Plex mutation path.

- Document the exact Plex account/token model used locally.
- Verify list-users, metadata lookup, watched-state check, and mark-watched behavior against the real setup.
- Keep `PLEX_MUTATION_MODE=mock` as the default until verification is complete.
- Add clear error codes for missing permissions, unavailable users, unmatched media, timeout, and already watched.

### Block 1-5: Preview-First History Copy

Make the browser and CLI copy workflow safe enough for real use.

- Add source user, target user, media type, show, season, library, watched-state, and date filters.
- Preview copy jobs from Tautulli/Plex history without mutating Plex state.
- Apply only an existing preview job with explicit confirmation.
- Skip already-watched or already-copied items.
- Store per-item status and failures.

### Block 1-6: MVP Operations And Acceptance

Superseded historical ticket. Its MVP-era goals were delivered incrementally by later blocks, so Phase 1 is treated as historically complete. The current expanded-system acceptance belongs to Block 3-7.

## Phase 2: Watch History Intelligence MVP

Phase 2 turns Plex CoWatcher into a durable, tool-friendly source of household watch-history intelligence. It captures richer playback evidence than Plex's current watched flag, supports composable queries, calculates progress, reconstructs sessions, and keeps confirmed participation separate from inference.

### Block 2-1: Rich Playback Evidence Capture

Persist completed and partial playback evidence for every enabled configured Plex user while preserving Phase 1 prompt behavior for source users.

### Block 2-2: Content Metadata Catalog

Create stable movie/show/season/episode identities and cache media type, genre, hierarchy, durations, and known episode totals.

### Block 2-3: Watch History Query API

Expose shared CLI and HTTP queries filterable by person, exact content or show, media type, genre, household-local day, range, and completion state.

### Block 2-4: Watch Progress Summaries

Provide per-show, per-person, and per-day summaries covering distinct and repeated plays, partial/completed viewing, time watched, and progress against known episode totals.

### Block 2-5: Viewing Session Reconstruction

Group playback observations into deterministic, explainable per-user viewing sessions with explicit interval quality and uncertainty.

### Block 2-6: Co-Watching Intelligence

Combine explicit Discord confirmation with cautious time-based session correlation, returning provenance, supporting evidence, and confidence without mutating Plex from inference.

## Phase 3: Post-MVP Features (Customization & Reporting)

Phase 3 introduces domain-specific features, system settings, and reporting to refine the user experience beyond the core watch history intelligence.

### Block 3-1: Audiobook Differentiation & Settings

Introduce robust heuristics and deep metadata parsing to classify audiobooks and separate them from standard music tracks. Implement a foundational application settings store to configure rules like disabling Discord prompts for solo audiobook sessions.

### Block 3-2 Umbrella Specification: Customizable Household Media Dashboard MVP

Implemented 2026-06-28 through Blocks 3-2a to 3-2e. Together, the completed children create a highly customizable, media-neutral window into what every configured user is consuming.

- **3-2a - Usable Dashboard MVP Foundation:** Real household overview, mixed-media activity, shared filters, initial drill-downs, safe Plex artwork, and saved display preferences.
- **3-2b - Activity Timeline And Layout System:** Persistent layout switching and a chronological, provenance-aware activity view.
- **3-2c - Media Explorer And Rich Drill-Downs:** Searchable artwork browsing plus media-, person-, session-, episodic-, and audiobook-aware detail.
- **3-2d - People And Co-Watching Workspace:** Per-person intelligence, Discord prompt lifecycle visibility, and safe audited co-watch actions.
- **3-2e - Progress, Export, Accessibility And Hardening:** Progress and collections, streamed CSV export, responsive accessibility, performance, and regression coverage.

### Blocks 3-2g Through 3-2o: Corrective Dashboard Redesign

A live Playwright review after 3-2f found that the dashboard had real data but failed its intended product outcome: primary layout navigation was effectively invisible, Overview hierarchy was cramped, Timeline rendered months of tiny fragments, Library was category-skewed, People exposed raw/duplicate identities, and Progress remained unresponsive beyond 30 seconds.

The corrective sequence is mandatory and ordered:

1. **3-2g - Dashboard Contract And Performance Baseline:** Freeze vocabulary, bounds, response contracts, canonical poster/cover rules, dashboard user preference semantics, realistic fixtures, and measurable budgets.
2. **3-2h - Dashboard Shell And Design System:** Build visible navigation, shared filters, responsive shell, reusable accessible primitives, and Settings controls for dashboard user visibility and aliases.
3. **3-2i - Overview Decision Surface:** Deliver mixed-media summary, continue consumption, household activity, and evidence-backed attention work.
4. **3-2j - Library Category Browser:** Replace the undifferentiated alphabetical grid with bounded category-led consumed-title browsing.
5. **3-2j-1 - Co-Watch Evidence Semantics:** Separate title-level `Watched by` participation from human-confirmed `Together` and exact-item inferred `Likely together` before rich detail consumes relationship data.
6. **3-2k - Rich Media Detail Workspace:** Add one shared movie, episodic, and audiobook hierarchy/evidence detail system.
7. **3-2l - Daily Session Timeline:** Replace multi-month rendering with a bounded day/week investigation view and separate activity feed.
8. **3-2m - Household People Profiles:** Establish dashboard membership, identity status, aliases, and readable per-person activity without merging stored users.
9. **3-2m-1 - Person Pairings And Operations:** Replace category patterns with evidence-backed person pairings and resilient prompt/failure operations.
10. **3-2m-2 - Browser Co-Watch Adjudication:** Add bounded, reversible, audited Yes/No/Not sure decisions over exact-item pair inference.
11. **3-2m-3 - Discord Co-Watch Review:** Add an operator-triggered review-only Discord path that cannot invoke Plex sync or notification loops.
12. **3-2m-4 - People Co-Watch Attribution And Window Controls:** Count confirmed shared viewing in participant profiles with explicit provenance, deduplication, and selectable People periods.
13. **3-2m-5 - People Ordering And Heatmap Interaction:** Add browser-local People card ordering, accessible daily evidence popovers, Timeline drill-through, and a clearer Together marker.
14. **3-2n - Hierarchy Progress Workspace Umbrella:** Reviewed and split into smaller implementation blocks; do not implement directly.
15. **3-2n-1 - Progress Read Model Contract:** Stabilize typed, bounded progress summary groups, filters, repeat/unknown semantics, aliases, hidden-user exclusion, artwork identity, and fixtures.
16. **3-2n-2 - Progress Workspace Shell:** Replace the all-card Progress render with bounded Recently Active, Continue, and Recently Completed sections plus URL-restorable person/category controls.
17. **3-2n-3 - Progress Lazy Hierarchy Endpoints:** Add indexed, read-only hierarchy expansion endpoints for one TV/Classic TV/Anime/Audiobook identity at a time.
18. **3-2n-4 - Progress Hierarchy UI And Regression:** Implemented and verified; Progress lazily expands one URL-restorable hierarchy card at a time, reuses the shared detail workspace, and locks Progress interaction, DOM, payload, and viewport coverage.
19. **3-2n-5 - Audiobook Progress Source Honesty:** Implemented. Stop treating Plex track/file rows as verified chapters, expose progress source fields, and trigger lightweight audiobook metadata caching on watch ingestion.
20. **3-2n-5a - Audiobook Chapter Import And Cache:** Implemented. Add an explicit sanitized import/cache path for verified chapter boundaries produced by the separate `audiobook` tool.
21. **3-2n-5b - True Audiobook Chapter Progress:** Implemented. Map playback offsets and completion evidence onto cached verified chapter boundaries while preserving honest fallback behavior.
22. **3-2n-6 - Progress Evidence Map Polish:** Implemented 2026-07-09. Restore readable lazy evidence maps with accessible dots, compact legends, smoother expansion, and polished Progress typography without returning to all-dot first paint.
23. **3-2n-6a - Progress Watcher Coverage And Workspace Width:** Implemented 2026-07-09. Add visible completion coverage, on-demand watcher evidence, and a full-width Recently Completed workspace.
24. **3-2n-6b - Overview Session Feed De-duplication:** Implemented 2026-07-11. Group canonical-item playback into stable viewing sessions while preserving co-watch and participant evidence.
25. **3-2n-5c - Reliable Audiobook Discovery Automation:** Implemented 2026-07-11. Automatic PM2 discovery now reconciles metadata, survives restart/cooldown and key drift, and emits revision-deduplicated 5D outbox work.
26. **3-2n-5d - Automatic Audiobook Chapter Proof Handoff:** Implemented through 5D-3 and enabled in the recurring PM2 runtime on 2026-07-25.
    1. **3-2n-5d-1 - Revision Manifest And Safe Cache Activation:** Preserve the exact private file set behind each revision and make chapter activation revision-safe and backward compatible.
    2. **3-2n-5d-2 - Trusted External Proof Adapter:** Validate the configured read-only `audiobook` JSON boundary with strict quality, timeout, and privacy controls.
    3. **3-2n-5d-2A - Embedded Chapter Timeline Normalization:** Implemented 2026-07-12. Normalize valid embedded starts into duration-bounded ranges; the corrected Eric canary activated 57 revision-matched embedded chapters.
    4. **3-2n-5d-3 - Durable Proof Worker And Rollout:** Implemented and enabled 2026-07-25. Targeted canaries remain audiobook-scoped, ordinary work prioritizes recent playback, and the worker processes one durable job per 15-minute cycle.
27. **3-2n-5E - Multi-File Audiobook Timeline Proof:** Implemented and deterministically verified. Replace blanket multi-file rejection with capability-based, resumable book-global proof and map retained historical playback through exact file-local offsets without title-specific rules or invented evidence; keep live execution gated until canary rollout evidence is recorded.
    1. **3-2n-5E-A - Evidence-Based File-Boundary Chapters:** Implemented and live-verified 2026-07-26. Reuses 5E infrastructure to recognize strict exact one-file-per-chapter evidence for existing and future revisions, prefer authoritative Audnexus track order, preserve honest fallback for multipart/generic/gapped layouts, and report bounded SQLite locks safely.
    2. **3-2n-5E-B - Audnexus Sentinel And Title Compatibility:** Implemented and live-verified 2026-07-26. Accepts only the observed exact `-1` edition sentinel and hyphen subtitle separator while preserving every 5E-A proof gate and keeping recurring multi-file execution disabled.
    3. **3-2n-5E-C - Deferred Multi-File Layouts:** Deferred planning inventory. Multipart chapters, named nonstandard sections, count/track defects, and generic files require separate evidence-first child blocks.
28. **3-2n-6C - Visible Progress And Enriched Detail:** Implemented 2026-07-12. Progress cards expose explicit completed/total/percentage summaries, and the larger lazy modal adds source, activity, and participant context without weakening unknown-total honesty.
29. **3-2n-6E - Universal Detail Workspace Alignment:** Planned umbrella inserted before 6D implementation to correct the separate Overview/Progress detail paths while preserving the already-published 6D numbering; do not implement the umbrella directly.
    1. **3-2n-6E-1 - Canonical Detail Contract And Entry Resolution:** Implemented 2026-07-13. Added one typed identity resolver and bounded additive workspace read contract while preserving existing UI/endpoints.
    2. **3-2n-6E-2 - Shared Detail Shell And Category Presenters:** Implemented 2026-07-14. Added one content-first accessible shell, explicit media-category presenters, and canonical routing for all non-Progress callers.
    3. **3-2n-6E-2A - Rich Detail Hero And Watcher Lanes:** Implemented 2026-07-14. Added distinct private poster/backdrop handling, honest Audiobook fallback treatment, and ordered interactive watcher lanes before 6E-3 inherits the shell.
    4. **3-2n-6E-2B - Movie Detail Presenter:** Implemented 2026-07-14. Added a source-backed Movie viewing record, progress meter, playback facts, latest activity, participants, and evidence explanation without changing artwork or Progress semantics.
    5. **3-2n-6E-2C - Canonical Artwork Freshness And Adoption:** Implemented and verified through 6E-2C3. Canonical artwork adoption and the corrective Movie history/enrichment sequence are complete.
       1. **3-2n-6E-2C1 - Canonical Artwork Resolver And Proxy Freshness:** Implemented 2026-07-14. Added media-wide stale-identity recovery, authoritative Audiobook covers, revision-aware private proxying, bounded caching, and proxy safety.
       2. **3-2n-6E-2C2 - Dashboard-Wide Artwork Adoption And Compatibility:** Implemented 2026-07-14. Migrated every current artwork consumer to the canonical descriptor while preserving `artworkUrl` compatibility and deterministic reload behavior.
       3. **3-2n-6E-2C3 - Canonical Movie History And Enriched Detail:** Implemented 2026-07-15. Added exact-GUID stale-key Movie history, household-local viewing-day semantics, complete visible People attribution, a de-duplicated Movie presenter, and bounded lazy exact-profile enrichment.
    6. **3-2n-6E-2D - Detail Presentation And Summary Parity:** Implemented 2026-07-15. Improved hero readability and responsive crop safety, and aligned verified Audiobook read-through summaries with the expanded chapter state.
    7. **3-2n-6E-3 - Progress Migration And Cross-Surface Regression:** Implemented 2026-07-16. Progress now uses the shared canonical detail workspace, preserves legacy URL restoration, and has cross-surface parity/lazy-loading coverage.
    8. **3-2n-6E-3A - Replay Semantics And Session Provenance:** Implemented 2026-07-16. Raw observations, reconstructed sessions, household-local viewing days, and evidence-backed replays are separate across all replay-facing Progress and shared-detail projections.
    9. **3-2n-6E-3B - On-Demand Plex Metadata And Artwork Refresh:** Implemented 2026-07-17. Added confirmed title-scoped shared-detail refresh from Plex with exact identity/GUID targeting, stable artwork revisions, privacy-safe failure handling, and no restart or whole-library refresh requirement.
    10. **3-2n-6E-3C - Plex Historical Movie Backfill:** Implemented 2026-07-18. Added per-user Plex movie last-view recovery before the 2022 cutoff with exact-GUID identity, durable raw snapshots, source-labeled derived observations, dry-run/apply confirmation, idempotent reruns, and no replay inflation.
30. **3-2n-6F - Overview Playback Digest Cards:** Implemented 2026-07-26. Added compact category-aware Overview digests: per-user audiobook book/day cards with verified session chapter summaries, movie/day digests, and show/day digests with episode rows and artwork while preserving raw observations and the existing session projection.
    1. **3-2n-6F-A - TV And Anime Session Episode Progress:** Planned corrective child. Add per-session episode progress to TV, Anime, and Classic TV Overview digests so explicit completion renders as a full bar, source percentages render as approximate partial bars, and missing evidence remains unknown without changing ingestion or persistence.
31. **3-2n-6G - Audiobook Progress Evidence Repair And Retroactive Rebuild:** Implemented 2026-07-26. Validates `view_offset`, canonical Tautulli `play_duration`, and `percent_complete`; assigns explicit verified, approximate, stale, and unavailable quality states; handles cumulative-duration reset rows with a high-water mark; and rebuilds Overview, Progress, and detail without rewriting raw observations.
32. **3-2n-6H - Canonical Audiobook Progress Timeline And Rewind Semantics:** Implemented 2026-08-15. One revision-safe evaluator now separates current position, furthest attainment, session movement, rewind/revisit state, chapter history, and uncertainty without rewriting raw observations.
33. **3-2n-6I - Exact Audiobook Position Evidence Capture:** Implemented and live 2026-08-20. Exact future stop offsets are captured additively with explicit units, identity, provenance, dedupe, and disabled behavior.
34. **3-2n-6J - Project-Wide Audiobook Progress Projection Adoption:** Implemented umbrella 2026-08-20.
    1. **3-2n-6J-A - Service And API Progress Projection Adoption:** Implemented 2026-08-20. Typed canonical current/furthest/session/chapter projections are adopted across service/API consumers while raw exports and mutation isolation remain intact.
    2. **3-2n-6J-B - Browser Progress Presentation And Regression:** Implemented and live 2026-08-20 across Overview, Progress/shared detail, Media Explorer/Continue Consuming, Timeline, and People.
35. **3-2n-6D - Whisper-Assisted Audiobook Resume Context:** Planned umbrella. Reuse 6I exact position evidence to convert source-backed audiobook stops into private bounded transcript context and a useful resume modal after the canonical progress sequence; do not implement the umbrella directly.
    1. **3-2n-6D-1 - Resume Transcription Contract:** Planned split umbrella; do not implement directly.
       1. **3-2n-6D-1A - Audiobook transcribe-window Command And Runtime Proof:** Implement in the sibling audiobook repository with separate branch and verification.
       2. **3-2n-6D-1B - CoWatcher Transcription Contract Fixtures:** Add sanitized versioned fixtures and boundary documentation only.
    2. **3-2n-6D-2 - Trusted Resume Adapter And State:** Revised. Key revision-safe jobs/results directly to durable 6I `audiobook_position_evidence`.
    3. **3-2n-6D-3 - Stable-Stop Reconciliation Worker And Rollout:** Revised. Reconcile durable 6I evidence into a disabled bounded worker; live enablement remains separately authorized.
    4. **3-2n-6D-4 - Audiobook Stopping-Point Excerpt Extension:** Narrowed. Add only optional private excerpt context to the existing canonical 6J-B detail UI.
36. **3-2o - Dashboard Accessibility And Regression Release Gate:** Rewritten. After 6F-A, audit all dashboard surfaces at 320/390/768/1024/1440 with semantic/geometry assertions and no broad screenshot snapshots. Optional 6D is excluded.

Each block, including every 3-2m sub-block, must pass its own exit gate before the next begins. Block 3-3 is paused until 3-2o completes.

### Block 3-3: Household Watch Reports

Planned umbrella; implement these children in order:

1. **3-3A - Household Report Contract And Preview:** Source-honest household-local aggregation and bounded read-only preview.
2. **3-3B - Discord Delivery And Idempotency:** Manually confirmed, privacy-safe delivery with durable period/channel/revision dedupe.
3. **3-3C - Scheduled Runtime And Rollout:** Timezone/DST/catch-up/restart-safe scheduling with controlled live canary.

### Block 3-4: Hierarchical Audiobook Series Modeling

Extend the audiobook catalog so top-level series and subseries can be represented separately, backfilled safely, and surfaced through existing tool-friendly service layers without breaking current audiobook workflows.

### Block 3-5: Proactive Audiobook Scanner & Webhook Trigger

Implemented on 2026-06-28. Added the full-library audiobook scanner service, CLI entrypoint, and webhook item-ingestion path.

### Block 3-6 Umbrella: Historical Watch Archive

Planned product foundation. Preserve the household memory of who saw what and when independently of current Plex library membership, then derive explainable achievements from the archive.

1. **3-6-1 - Archive Provenance Contract Closure:** Planned corrective closure. Fix remaining missing/conflicting timestamp semantics and define downstream evidence eligibility without rebuilding the archive.
2. **3-6-2 - Canonical Media Identity And Alias Registry:** Superseded by 3-6-2A/B/C and 3-6-4/4A; retain only as a historical parent.
3. **3-6-2A - Legacy Plex Identity Bridge And Archive-Owned View Recovery:** Implemented 2026-07-18. Import external Plex view rows into CoWatcher's archive tables, bridge legacy/current identities, and link exact matches back to canonical CoWatcher observations without duplicating them.
4. **3-6-2B - Archive Identity Review And Account Context:** Implemented 2026-07-19. Automate exact account attribution and add a compact, reversible identity-review overlay for uncertain archive media without mutating source evidence.
5. **3-6-2C - Canonical Plex Movie Identity And Stale-Key Adoption:** Implemented 2026-07-19. Use exact Plex GUIDs to preserve stale rating keys as aliases while making movie grouping, refresh, poster, and backdrop resolution canonical and revision-safe. The local repair CLI is dry-run by default; live apply remains deferred for operator review.
6. **3-6-3 - Tautulli Ingestion Completeness And Reconciliation:** Implemented 2026-07-19. Durable per-user Tautulli backfill checkpoints, bounded retries, source-row outcomes, and exact-identity reconciliation distinguish source absence from local ingestion failure.
7. **3-6-4 - Plex Supplemental Historical Recovery:** Implemented 2026-07-20 for aggregate movie/episode last-view recovery; live apply remains operator-controlled.
8. **3-6-4A - Plex Play-History Recovery And Reconciliation:** Implemented 2026-07-21 and rolled out 2026-07-23. Paginated dated movie/episode rows are retained additively, exact interval overlaps reconcile without source loss, and the deployed dashboard projection is enabled. Profiles without an exact Plex local-account mapping remain unknown and untouched.
9. **3-6-5 - Archive Query, Export, And Backup:** Planned umbrella.
    1. **3-6-5A - Versioned Archive Query Contract**
    2. **3-6-5B - Canonical JSON/CSV Export**
    3. **3-6-5C - Verified Backup, Restore, And Disaster Recovery**
10. **3-6-6 - Achievements Engine v1:** Planned umbrella.
    1. **3-6-6A - Achievement Evidence And Versioned Rule Contract**
    2. **3-6-6B - Deterministic Engine, Persistence, And Recalculation**
    3. **3-6-6C - First-Watch And Watch-Count Rules**
    4. **3-6-6D - Rewatch And Confirmed Co-Watch Rules**
    5. **3-6-6E - Series, Genre, And Library Completion Rules:** Deferred until trustworthy denominator/classification evidence exists.

### Block 3-2n-5c: Reliable Audiobook Discovery Automation

Implemented on 2026-07-11. Whole-library discovery now runs on a persisted PM2 cadence/cooldown, shares one coordinator with CLI and webhook item awareness, reconciles rich Plex metadata without per-track refetches, and emits one durable event per stable audiobook media revision for 5D.

### Block 3-2n-5d: Automatic Audiobook Chapter Proof Handoff

Umbrella only. Blocks 5D-1, 5D-2, 5D-2A, and 5D-3 are implemented and verified. The recurring proof worker was enabled on 2026-07-25 after a fresh database backup, a targeted Way of Kings canary activated 88 revision-matched embedded chapters, and the next automatic cycle activated 72 embedded chapters for Monstrous Regiment without Whisper or media rewriting.

### Block 3-2n-5E: Multi-File Audiobook Timeline Proof

Implemented and deterministically verified. Extends the verified chapter pipeline to any deterministically ordered multi-file edition through resumable per-file proof, atomic book-global timeline assembly, and exact file-local playback mapping. `AUDIOBOOK_PROOF_MULTI_FILE_ENABLED` remains false until the documented backup, disabled canary, targeted re-evaluation, and explicit recurring rollout gates pass. Current Wheel of Time and Discworld editions are representative canary candidates only; behavior remains capability-based and preserves unresolved history as source-honest fallback.

### Block 3-2n-5E-A: Evidence-Based File-Boundary Chapters

Implemented and verified. The first live enabled 5E canary proved that common multi-file editions may encode one chapter per physical file rather than internal chapter markers. The correction adds only the strict evidence-based file-boundary path, authoritative track order, future automatic discovery behavior, targeted legacy recovery, and bounded lock reporting. A backed-up targeted Path of Daggers canary activated 32 revision-matched chapters without changing 40 raw playback observations; recurring multi-file execution remains disabled. Multipart grouping and generic segment interpretation remain deferred.

### Block 3-2n-5E-B: Audnexus Sentinel And Title Compatibility

Implemented and verified. The strict file-boundary evidence parser now accepts only the live-observed Audnexus `-1` edition sentinel and ` - ` chapter subtitle separator. Backed-up targeted operations activated 57 chapters for The Fires of Heaven, 59 for Towers of Midnight, and 58 for The Shadow Rising without changing their 71, 65, and 80 raw playback observations. No multipart, named-section, repair, or recurring rollout scope was included.

### Block 3-2n-5E-C: Deferred Multi-File Layouts

Deferred planning inventory. Eleven current multi-file jobs remain in source-honest fallback. Record and later split the materially different layouts: multipart chapters; Foreword, credits, and numbered sections; track/count defects; and generic repeated titles. Do not implement this umbrella directly.

### Block 3-7: Operations Readiness, Recovery, And Windows Reboot Acceptance

Planned modern successor to superseded Block 1-6. Audit the current expanded Windows/PM2 system, reconcile operator documentation and truthful readiness, prove backup/recovery responsibilities, and run a separately authorized Windows reboot acceptance without adding product features.

### Deferred Beyond The Phase 3 MVP

- Per-user Discord DM prompts.
- Advanced matching across renamed or migrated libraries.
- Natural-language query parsing or recommendation features (e.g., dedicated Media Bot).
- Multi-server support.
