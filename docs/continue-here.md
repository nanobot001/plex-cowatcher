# Continue Here

## 2026-07-12

Current state:
- Blocks 3-2n-5d-1, 3-2n-5d-2, and the code portion of 3-2n-5d-3 are implemented and passed `npm run verify:block`.
- The production SQLite database was backed up, the trusted adapter was configured, and automatic proof remains disabled.
- The first live canary targeted audiobook ID 34 (`Eric`) and exposed an embedded end-metadata normalization gap. Block 3-2n-5d-2A corrected it and passed `npm run verify:block` with 103 service tests and 36 dashboard regressions.
- The corrected disabled canary succeeded with 57 active revision-matched embedded chapters, verified chapter Progress, path-safe audits, and a passing `npm run verify:live-dashboard`. Automatic proof remains disabled.

Next step:
- Resume the explicit recurring-worker enablement portion of **Block 3-2n-5d-3: Durable Proof Worker And Rollout** (`docs/blocks/block-3-2n-5d-3-durable-proof-worker-and-rollout.md`). Review the 54 pending and 15 unsupported jobs, then enable only with an explicit rollout decision and rerun the live smoke gate.

## 2026-07-11

Current state:
- Blocks 3-2n-6, 3-2n-6a, 3-2n-6b, and 3-2n-5c are implemented and verified. The latest 5C verification passed both `npm run verify:block` and `npm run verify:live-dashboard`.
- Automatic audiobook discovery now runs independently under PM2, reconciles rich Plex metadata, persists restart/cooldown state, and emits one outbox event per stable media revision. A live 960-track scan succeeded, and its immediate rerun was idempotent.

Next step:
- Implement **Block 3-2n-5d-1: Revision Manifest And Safe Cache Activation** (`docs/blocks/block-3-2n-5d-1-revision-manifest-and-safe-cache-activation.md`), then 5D-2 and 5D-3 before 3-2o. The original 5D file is now an umbrella only.

## 2026-07-09

Current state:
- Block 3-2n-5 (Audiobook Progress Source Honesty) is completed and verified. The dashboard endpoints and UI now explicitly expose progress unit, label, and source metadata, and set `totalKnown = false` for unverified audiobooks to avoid rendering incorrect percentages.
- Block 3-2n-5a (Audiobook Chapter Import and Cache) is completed and verified. We created SQLite schemas for chapter sources and boundaries, implemented the CLI import command with dry-run support, and updated dashboard endpoints to expose verified chapter availability.
- Block 3-2n-5b (True Audiobook Chapter Progress) is completed and verified. Progress now maps playback offsets and book-completion evidence onto cached verified audiobook chapter boundaries, while unverified audiobooks stay on source-honest Plex track/file fallback copy.
- We identified a real audiobook automation gap: the current service runtime only processes qualifying webhook items opportunistically and does not reliably perform whole-library audiobook discovery unless the scan CLI is called externally. Planned follow-up block `block-3-2n-5c-reliable-audiobook-discovery-automation.md` now captures the fix.
- We also split the second missing step into `block-3-2n-5d-automatic-audiobook-chapter-proof-handoff.md`: once discovery is reliable, unresolved audiobooks should automatically trigger the separate `audiobook` project once, cache verified chapters locally, and let future Plex listening offsets reuse that cache.
- Verification passed: `npm run verify:block` (79/79 service tests, 30/30 Playwright E2E tests, dashboard syntax, and tool contracts).

Next step:
- Implement **Block 3-2n-6: Progress Evidence Map Polish** (`docs/blocks/block-3-2n-6-progress-evidence-map-polish.md`) before starting 3-2o.

## 2026-07-08

Current state:
- Block 3-2n-4 (Progress Hierarchy UI & Regression) is completed and verified. Progress cards now lazily expand one URL-restorable hierarchy at a time, cache fetched expansion responses, preserve filters/pagination/history state, keep Movies non-expandable, and drill through to the shared detail workspace.
- The deterministic dashboard fixture now covers TV, Classic TV, Anime, Audiobook, and Movie Progress behavior.
- Verification passed: `npm run verify:block` (77/77 service tests, 30/30 Playwright E2E tests, dashboard syntax, and tool contracts).
- Follow-up planning identified that the 3-2n-4 outcome is technically safe but not yet acceptable for audiobook correctness or Progress readability. Source review corrected the next step: current audiobook totals are linked Plex track/file evidence, not verified chapter truth, so Progress must first expose source honesty before any true chapter progress or dot-map polish.

Next step:
- Implement **Block 3-2n-5: Audiobook Progress Source Honesty** (`docs/blocks/block-3-2n-5-audiobook-progress-contract.md`), then **Block 3-2n-5a: Audiobook Chapter Import And Cache** (`docs/blocks/block-3-2n-5a-audiobook-chapter-import-cache.md`), then **Block 3-2n-5b: True Audiobook Chapter Progress** (`docs/blocks/block-3-2n-5b-true-audiobook-chapter-progress.md`), then **Block 3-2n-6: Progress Evidence Map Polish** (`docs/blocks/block-3-2n-6-progress-evidence-map-polish.md`) before starting 3-2o.

## 2026-07-06

Current state:
- Block 3-2n-1, Block 3-2n-2, and Block 3-2n-3 (Progress Lazy Hierarchy Endpoints) are completed and verified. The backend features a dedicated read-only expansion endpoint `/api/dashboard/progress/expand/:groupKey` with optimized queries using database indexes on content catalog lookups.
- Verification passed: `npm run verify:block` (77/77 unit tests, 28/28 Playwright E2E tests, syntax and tool contracts).

Next step:
- Implement **Block 3-2n-4: Progress Hierarchy UI & Regression** (`docs/blocks/block-3-2n-4-progress-hierarchy-ui-regression.md`).

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
- Implement **Block 3-2n-1: Progress Read Model Contract** (`docs/blocks/block-3-2n-1-progress-read-model-contract.md`).

## 2026-07-04

Current state:
- Block 3-2j-1 (Co-Watch Evidence Semantics) is completed, committed, and pushed to `main`.
- The dashboard successfully distinguishes between `Together` (human confirmed), `Likely together` (start time aligned and overlapped plays), and `Watched by` (default fallback and library summaries).
- Aggregated Media Explorer cards filter names by selected user and default to `"Watched by"` instead of claiming simultaneity.
- Verification passed: `npm run verify:block` (65/65 unit, 6/6 E2E Playwright tests, syntax and tool verifications).

Next step:
- Implement **Block 3-2k: Rich Media Detail Workspace** (`docs/blocks/block-3-2k-rich-media-detail-workspace.md`).

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
- Implement **Block 3-2j-1: Co-Watch Evidence Semantics** (`docs/blocks/block-3-2j-1-cowatch-evidence-semantics.md`) before 3-2k.

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

