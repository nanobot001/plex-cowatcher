# Continue Here

## 2026-07-15

Current state:
- Block 3-2n-6E-1 is implemented and verified, providing the canonical detail identity, workspace read contract, and lazy hierarchy route.
- Block 3-2n-6E-2 is implemented and verified. Every non-Progress detail caller now opens one URL-restorable `#detail-dialog` shell with explicit Movie, TV, Classic TV, Anime, and Audiobook presenters. A populated Classic TV review corrected the initial column hierarchy: the sticky left rail now holds artwork and compact summary metadata, while seasons/episodes/chapters use the wider primary column.
- Block 3-2n-6E-2A is implemented and verified. The shared non-Progress detail workspace now has a full-width private Plex backdrop hero, an honest Audiobook gradient/square-cover fallback, and unlabeled stable-ID watcher lanes ordered like People with hover/focus evidence and cross-row selection. Progress remains isolated for 6E-3.
- Block 3-2n-6E-2B is implemented and verified. Movie detail now uses the primary column for a source-backed viewing record with progress, playback, latest activity, visible participants, and evidence explanation instead of an empty hierarchy placeholder.
- Block 3-2n-6E-2C is fully implemented and verified through 6E-2C3. One canonical resolver owns private artwork identity and revisioning, and Movie detail now joins stale/current rating keys only through exact non-empty Plex GUID evidence, groups direct observations into household-local viewing days, and presents one bounded history surface.
- Block 3-2n-6E-2C3 added a lazy public-read media-bot exact-profile boundary with indexed exact identity, schema validation, output/timeout limits, a 15-minute CoWatcher cache, request coalescing, and failure backoff. The Movie About section degrades independently and cannot delay or blank household history.
- The final deterministic gate passed with 110 service/integration tests and 49 dashboard regression cases plus one intentional skip. The focused media-bot tool suite passed 81 tests, and ten warm exact-profile invocations measured p95 615 ms. After the production rebuild and PM2 restart, `npm run verify:live-dashboard` passed.
- The live Shang-Chi canary confirmed one stale-key `23917` observation plus two current-key `57417` observations under one exact Plex GUID, producing three completed viewing days for Tony, Garner, and Dorothy. The lazy profile returned the allowlisted 2021, 132-minute, PG-13 Marvel Studios result with MCU context and no private fields.
- Block 3-2n-6E-2D is implemented and verified. The shared detail hero now uses a lighter contrast treatment, top-anchored (`center top`) focal positioning, and responsive sizing across the required viewport matrix. Verified Audiobook detail summaries reuse the chapter-aware snapshot used by the expanded hierarchy, while unverified books retain explicit Plex track/file evidence.
- The 6E-2D gate passed with 110 service tests and 51 dashboard regression cases plus one intentional skip. The live verified Audiobook canary `audiobook:73` returned `34 of 62` chapters and matched 34 watched/repeated chapters in the expanded hierarchy. Production was restarted and `npm run verify:live-dashboard` passed.
- The 3-2n-5d-3 recurring-worker enablement decision remains separately pending; this detail-workspace work does not imply that automatic audiobook proof was enabled.
- Block 3-2n-6E-3 is implemented and verified. Progress now opens the canonical shared detail workspace; `#progress-dialog`, its duplicate renderer/CSS, and browser `/progress/expand` reads are retired. Canonical `detail` URLs are generated, legacy `progressDetail`/`selected` URLs still restore and normalize, and the deterministic/live gates passed.
- A new corrective block, **3-2n-6E-3A: Replay Semantics And Session Provenance** (`docs/blocks/block-3-2n-6e-3a-replay-semantics-and-session-provenance.md`), is now planned after 6E-3 and before 6D. It will stop raw same-day start/stop observations from being labeled `repeated`, distinguish sessions and local viewing days, and require genuine replay evidence.
- A follow-on corrective block, **3-2n-6E-3B: On-Demand Plex Metadata And Artwork Refresh** (`docs/blocks/block-3-2n-6e-3b-on-demand-plex-metadata-and-artwork-refresh.md`), is now planned after 6E-3A and before 6D. It will add a title-scoped shared-detail refresh from Plex so changed artwork/metadata becomes visible without restarting CoWatcher or refreshing an entire library.

Next step:
- Implement **Block 3-2n-6E-3A: Replay Semantics And Session Provenance** (`docs/blocks/block-3-2n-6e-3a-replay-semantics-and-session-provenance.md`) next, then **6E-3B: On-Demand Plex Metadata And Artwork Refresh** (`docs/blocks/block-3-2n-6e-3b-on-demand-plex-metadata-and-artwork-refresh.md`) before beginning 6D. Preserve the verified 6E-2D hero, Audiobook summary contract, and the shared 6E-3 detail presenter seam.

## 2026-07-12

Current state:
- Blocks 3-2n-5d-1, 3-2n-5d-2, and the code portion of 3-2n-5d-3 are implemented and passed `npm run verify:block`.
- The production SQLite database was backed up, the trusted adapter was configured, and automatic proof remains disabled.
- The first live canary targeted audiobook ID 34 (`Eric`) and exposed an embedded end-metadata normalization gap. Block 3-2n-5d-2A corrected it and passed `npm run verify:block` with 103 service tests and 36 dashboard regressions.
- The corrected disabled Eric canary succeeded with 57 active revision-matched embedded chapters. A second disabled canary proved the current Warbreaker edition with 62 chapters and current playback at Chapter 24 (36%).
- Block 3-2n-6C now renders Warbreaker as `24 of 62 chapters · 36%`; the expanded modal marks Chapters 1-23 as completed/repeated, Chapter 24 as the current partial chapter, and Chapters 25-62 as unknown. The corrective block and live dashboard gates passed. Automatic proof remains disabled.

Next step:
- Resume the explicit recurring-worker enablement portion of **Block 3-2n-5d-3: Durable Proof Worker And Rollout** (`docs/blocks/block-3-2n-5d-3-durable-proof-worker-and-rollout.md`). Review the remaining pending and unsupported jobs, then enable only with an explicit rollout decision and rerun the live smoke gate.
- After that rollout gate passes, implement **Block 3-2n-6E** children 6E-1 through 6E-3 first, beginning with **6E-1: Canonical Detail Contract And Entry Resolution** (`docs/blocks/completed/block-3-2n-6e-1-canonical-detail-contract-and-entry-resolution.md`). The umbrella is `docs/blocks/block-3-2n-6e-universal-detail-workspace-alignment.md`, and the review is `docs/process/block-3-2n-6e-design-review.md`.
- After 6E-3 passes, implement the planned **Block 3-2n-6D** children in order, beginning with **6D-1: Bounded Resume Transcription Contract** (`docs/blocks/block-3-2n-6d-1-bounded-resume-transcription-contract.md`). The umbrella is `docs/blocks/block-3-2n-6d-audiobook-resume-context.md`, and the pre-implementation review is `docs/process/block-3-2n-6d-design-review.md`. 6D-4 extends the shared 6E Audiobook presenter. The first release provides a private stopping-point excerpt plus chapter/position context; a true paraphrased summary remains a separately gated model/provider decision because Whisper alone cannot generate one.

## 2026-07-11

Current state:
- Blocks 3-2n-6, 3-2n-6a, 3-2n-6b, and 3-2n-5c are implemented and verified. The latest 5C verification passed both `npm run verify:block` and `npm run verify:live-dashboard`.
- Automatic audiobook discovery now runs independently under PM2, reconciles rich Plex metadata, persists restart/cooldown state, and emits one outbox event per stable media revision. A live 960-track scan succeeded, and its immediate rerun was idempotent.

Next step:
- Implement **Block 3-2n-5d-1: Revision Manifest And Safe Cache Activation** (`docs/blocks/completed/block-3-2n-5d-1-revision-manifest-and-safe-cache-activation.md`), then 5D-2 and 5D-3 before 3-2o. The original 5D file is now an umbrella only.

## 2026-07-09

Current state:
- Block 3-2n-5 (Audiobook Progress Source Honesty) is completed and verified. The dashboard endpoints and UI now explicitly expose progress unit, label, and source metadata, and set `totalKnown = false` for unverified audiobooks to avoid rendering incorrect percentages.
- Block 3-2n-5a (Audiobook Chapter Import and Cache) is completed and verified. We created SQLite schemas for chapter sources and boundaries, implemented the CLI import command with dry-run support, and updated dashboard endpoints to expose verified chapter availability.
- Block 3-2n-5b (True Audiobook Chapter Progress) is completed and verified. Progress now maps playback offsets and book-completion evidence onto cached verified audiobook chapter boundaries, while unverified audiobooks stay on source-honest Plex track/file fallback copy.
- We identified a real audiobook automation gap: the current service runtime only processes qualifying webhook items opportunistically and does not reliably perform whole-library audiobook discovery unless the scan CLI is called externally. The completed follow-up block `completed/block-3-2n-5c-reliable-audiobook-discovery-automation.md` captures the fix.
- We also split the second missing step into `block-3-2n-5d-automatic-audiobook-chapter-proof-handoff.md`: once discovery is reliable, unresolved audiobooks should automatically trigger the separate `audiobook` project once, cache verified chapters locally, and let future Plex listening offsets reuse that cache.
- Verification passed: `npm run verify:block` (79/79 service tests, 30/30 Playwright E2E tests, dashboard syntax, and tool contracts).

Next step:
- Implement **Block 3-2n-6: Progress Evidence Map Polish** (`docs/blocks/completed/block-3-2n-6-progress-evidence-map-polish.md`) before starting 3-2o.

## 2026-07-08

Current state:
- Block 3-2n-4 (Progress Hierarchy UI & Regression) is completed and verified. Progress cards now lazily expand one URL-restorable hierarchy at a time, cache fetched expansion responses, preserve filters/pagination/history state, keep Movies non-expandable, and drill through to the shared detail workspace. See `docs/blocks/completed/block-3-2n-4-progress-hierarchy-ui-regression.md`.
- The deterministic dashboard fixture now covers TV, Classic TV, Anime, Audiobook, and Movie Progress behavior.
- Verification passed: `npm run verify:block` (77/77 service tests, 30/30 Playwright E2E tests, dashboard syntax, and tool contracts).
- Follow-up planning identified that the 3-2n-4 outcome is technically safe but not yet acceptable for audiobook correctness or Progress readability. Source review corrected the next step: current audiobook totals are linked Plex track/file evidence, not verified chapter truth, so Progress must first expose source honesty before any true chapter progress or dot-map polish.

Next step:
- Implement **Block 3-2n-5: Audiobook Progress Source Honesty** (`docs/blocks/completed/block-3-2n-5-audiobook-progress-contract.md`), then **Block 3-2n-5a: Audiobook Chapter Import And Cache** (`docs/blocks/completed/block-3-2n-5a-audiobook-chapter-import-cache.md`), then **Block 3-2n-5b: True Audiobook Chapter Progress** (`docs/blocks/completed/block-3-2n-5b-true-audiobook-chapter-progress.md`), then **Block 3-2n-6: Progress Evidence Map Polish** (`docs/blocks/completed/block-3-2n-6-progress-evidence-map-polish.md`) before starting 3-2o.

## 2026-07-06

Current state:
- Block 3-2n-1, Block 3-2n-2, and Block 3-2n-3 (Progress Lazy Hierarchy Endpoints) are completed and verified. The backend features a dedicated read-only expansion endpoint `/api/dashboard/progress/expand/:groupKey` with optimized queries using database indexes on content catalog lookups. See the completed block records under `docs/blocks/completed/`.
- Verification passed: `npm run verify:block` (77/77 unit tests, 28/28 Playwright E2E tests, syntax and tool contracts).

Next step:
- Implement **Block 3-2n-4: Progress Hierarchy UI & Regression** (`docs/blocks/completed/block-3-2n-4-progress-hierarchy-ui-regression.md`).

## 2026-07-05

Current state:
- Block 3-2l (Daily Session Timeline) is completed, verified, and merged.
- Blocks 3-2m through 3-2m-3 are implemented and passed their mandatory gates: household profiles, person pairings/operations, browser adjudication, and review-only Discord prompting.
- Block 3-2m-4 is implemented and verified. Confirmed shared viewing now contributes to People totals as attributed evidence, matching direct playback is deduplicated, and People supports restorable 7/30/90-day, all-time, and custom periods.
- The dashboard timeline has been refactored from a multi-month Gantt chart to a bounded, single-day workspace with previous/next navigation, date picker, lanes grouped by user, and active-user filters.
- A co-watching moments section was added below the lanes chart.
- The chronological Activity Feed has been relocated below the chart with independent pagination.
- Fixed layout wrapping bug where play lists in detail views truncated multi-person viewer lists.
- Verification passed: `npm run verify:block` (73/73 service tests, 20/20 E2E Playwright tests, dashboard syntax, and tool contracts) plus `npm run verify:live-dashboard` at 1440px and 390px.
- Block 3-2m-4 verification passed: `npm run verify:block` (75/75 service tests, 22/22 E2E Playwright tests, dashboard syntax, and tool contracts) plus `npm run verify:live-dashboard` after PM2 restart.
- Block 3-2m-5 verification passed: `npm run verify:block` (75/75 service tests, 24/24 E2E Playwright tests, dashboard syntax, and tool contracts).
- Block 3-2n was reviewed for risk, drift, dependencies, and opportunities, then split into four smaller implementation blocks: 3-2n-1 through 3-2n-4.

Next step:
- Implement **Block 3-2n-1: Progress Read Model Contract** (`docs/blocks/completed/block-3-2n-1-progress-read-model-contract.md`).

## 2026-07-04

Current state:
- Block 3-2j-1 (Co-Watch Evidence Semantics) is completed, committed, and pushed to `main`; see `docs/blocks/completed/block-3-2j-1-cowatch-evidence-semantics.md`.
- The dashboard successfully distinguishes between `Together` (human confirmed), `Likely together` (start time aligned and overlapped plays), and `Watched by` (default fallback and library summaries).
- Aggregated Media Explorer cards filter names by selected user and default to `"Watched by"` instead of claiming simultaneity.
- Verification passed: `npm run verify:block` (65/65 unit, 6/6 E2E Playwright tests, syntax and tool verifications).

Next step:
- Implement **Block 3-2k: Rich Media Detail Workspace** (`docs/blocks/completed/block-3-2k-rich-media-detail-workspace.md`).

Do-not-forget checks:
- Keep the 3-2 corrective blocks sequential.
- Run `npm run verify:block` before marking any block as completed.
- Run `npm run verify:live-dashboard` after starting the live deployment service.

## 2026-07-02

Current state:
- Blocks 3-2g through 3-2j are complete, including the 3-2j participant-label, visual viewer-badge, and card-detail consistency corrections.
- All future numbered blocks now have a mandatory shared `npm run verify:block` gate, backed by an isolated temporary SQLite fixture and deterministic desktop/narrow Playwright coverage. The separate read-only deployment gate is `npm run verify:live-dashboard`.
- The corrective dashboard sequence is still being followed in order.
- Corrected 3-2j verification passed: `npm run build`, `npm test` (64/64), static syntax checks, and desktop/narrow-width Playwright walkthroughs. Live checks found 24 badges on 24 Overview cards and 36 badges on 36 Library cards, verified multi-viewer and `+N more` labels, confirmed the opened detail `People` list matches the card, and found no narrow-width overflow or page errors.
- Shared regression rollout verification passed: `npm run verify:block` (64/64 service tests, 6/6 deterministic Playwright tests, dashboard syntax, and tool contracts) plus `npm run verify:live-dashboard`.
- Block 3-2j-1 is next to make `Watched by`, `Together`, and `Likely together` authoritative before 3-2k consumes relationship evidence.

Next step:
- Implement **Block 3-2j-1: Co-Watch Evidence Semantics** (`docs/blocks/completed/block-3-2j-1-cowatch-evidence-semantics.md`) before 3-2k.

Do-not-forget checks:
- Keep the 3-2 corrective blocks sequential.
- Do not start a later corrective block until the current block's exit gate passes.
- Do not mark any numbered block implemented without `npm run verify:block`; after a dashboard rebuild or restart, also run `npm run verify:live-dashboard`.

## Current State

- **Block 3-2f (Premium Dashboard Redesign)**: Implemented historically, but a later live Playwright audit found major product-outcome gaps: invisible primary navigation, weak Overview hierarchy, unbounded Timeline rendering, skewed Library ordering, raw/duplicate People identities, and an unresponsive Progress view.
- **Corrective sequence planned**: Blocks 3-2g through 3-2o now define a strict, dependency-locked dashboard recovery path with per-block performance, browser, accessibility, and regression exit gates.
- **Backend Testing & Build**: TypeScript compilation is clean, and the latest full suite passed 64/64 tests after the participant-badge regression correction. The service is supervised by PM2 and runs with zero issues.
- **Previous Blocks**: Blocks 3-1, 3-4, and 3-5 are fully implemented, providing robust audiobook folder-path ingestion, hierarchical series modeling, and a proactive Plex library scanner.

## Key Links

- Project charter: [project-charter.md](file:///c:/Users/antho/Code/plex-cowatcher/docs/project-charter.md)
- Roadmap: [roadmap.md](file:///c:/Users/antho/Code/plex-cowatcher/docs/roadmap.md)
- Block index: [README.md](file:///c:/Users/antho/Code/plex-cowatcher/docs/blocks/README.md)
- Completed block: [block-3-2f-premium-dashboard-redesign.md](file:///c:/Users/antho/Code/plex-cowatcher/docs/blocks/completed/block-3-2f-premium-dashboard-redesign.md)

## Next Recommended Step

- Start with **Block 3-2n-5: Audiobook Progress Source Honesty**.
- Then implement **Block 3-2n-5a: Audiobook Chapter Import And Cache**, **Block 3-2n-5b: True Audiobook Chapter Progress**, and **Block 3-2n-6: Progress Evidence Map Polish** before starting 3-2o.
- Implement only one corrective block at a time and do not begin the next block until the current block's exit gate is recorded as passing.
- Resume Block 3-3 only after Block 3-2o completes the final dashboard release gate.

