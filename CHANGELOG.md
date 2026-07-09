# Changelog

## Unreleased

- Added audiobook folder-path parsing, canonical `audiobook_books` linking, conservative Audnexus/Google enrichment, a dry-run-first resumable `project.audiobook_backfill` CLI workflow, and live rollout cleanup including Wheel of Time series normalization. (2026-06-28)
- Refined the dashboard overview with collapsible summary cards, a desktop grid plus mobile carousel for in-progress media, and audiobook title normalization so `Cosmere Warbreaker` now displays as `Warbreaker`. (2026-06-30)
- Polished the dashboard overview with reordered filters, corrected watched-time totals, and compact shared-watch badges that can show multiple people without crowding the cards. (2026-07-01)
- Added the bounded Library category browser, corrected participant labels across cards and detail views, and introduced mandatory isolated Playwright regression and live dashboard verification gates for numbered blocks. (2026-07-03)
- Added People co-watch attribution so confirmed shared viewing contributes separate observed and attributed totals, with restorable 7/30/90-day, all-time, and custom date windows plus an accessible heatmap legend. (2026-07-05)
- Added planned dashboard follow-up blocks for audiobook progress correctness and compact lazy Progress evidence-map polish before the final accessibility/regression gate. (2026-07-09)

## [0.3.0] - 2026-06-27

### Added
- **Playback Evidence Ingestion (Block 2-1)**: Normalized history pagination from Tautulli, tracking user play history with idempotent insertions and provenance labels. (2026-06-27)
- **Metadata Catalog & Auto-Healing (Block 2-2)**: Created library metadata cache with background show auto-healing triggered by episode observation count discrepancies. (2026-06-27)
- **Watch History Query API (Block 2-3)**: Implemented QueryService and watch-history CLI/HTTP routes for advanced timezone-aware query logic. (2026-06-27)
- **Watch Progress Summaries (Block 2-4)**: Implemented SummaryService and watch-summary CLI/HTTP routes aggregating playback times and show completion progress. (2026-06-27)
- **Viewing Session Reconstruction (Block 2-5)**: Implemented SessionService and viewing-sessions CLI/HTTP routes grouping contiguous observations using a 2-hour inactivity gap and merging overlapping intervals. (2026-06-27)
- **Co-Watching Intelligence (Block 2-6)**: Implemented CowatchingIntelligenceService and cowatching CLI/HTTP routes to correlate multi-user playback times and explain time-based inference with timing reasons and bounded confidence. (2026-06-27)
- **Tautulli User Sync & `is_home_user` Flag**: Synchronizes both Plex Home users and Tautulli library streamers into the database, preserving a clear database-level division between home and non-home users, with a new `sync-users` CLI subcommand. (2026-06-27)
- **Tool Contract Verification**: Added verify:tools script ensuring CLI and HTTP endpoints conform to docs/tool-manifest.yaml. (2026-06-27)

### Fixed
- **Historical Backfill Discord Spam**: Prevented historical Tautulli play backfills from queueing and spamming thousands of Discord verification prompts by automatically dismissing prompts for events older than 48 hours. (2026-06-27)

## [0.2.0] - 2026-06-06

### Added
- **Selective History Sync**: Allows copying select watch history items from the copy job preview instead of copying all.
- **Interactive Row Selection**: Click on any eligible row to toggle selection status (soft blue background and bold left accent border).
- **Shift-Click Range Selection**: Hold `Shift` while clicking to select or deselect a contiguous range of rows.
- **Skipped Item Handling**: Marks deselected/unselected eligible items as `skipped` with the reason `deselected` upon applying.
- **Robust Integration Testing**: Added target-specific unit tests verifying selective copy application and database states.

## [0.1.0] - 2026-06-06

### Added
- Initial project scaffold with Plex, Tautulli, and Discord integrations.
