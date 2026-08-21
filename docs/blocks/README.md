# Block Implementation

Blocks are numbered, bounded AI-buildable tickets for code, logic, docs, folder structure, tests, workflows, assets, prompts, cleanup, and other project work.

## Active Phase

The project is currently in the Phase 3 refinement set. The canonical audiobook progress sequence through 3-2n-6J-B is implemented and live, and the remaining planning inventory has been reconciled against the larger current system. The selected next implementation block is:

- **3-2n-6F-A: TV And Anime Session Episode Progress.** Add only the source-honest per-episode partial/completed/unknown projection to expanded TV, Anime, and Classic TV Overview sessions. Keep ingestion, persistence, historical fabrication, audiobook progress, and broader dashboard redesign out of this block.

Phase 3 builds on the completed playback-intelligence foundation with domain-specific refinement, richer operator ergonomics, and reporting.
Blocks 3-2a through 3-2e form one sequential dashboard implementation path:

- 3-2a establishes the usable household overview and shared dashboard vocabulary.
- 3-2b adds the reusable layout system and chronological activity view.
- 3-2c adds media browsing and rich drill-downs.
- 3-2d adds the people and co-watching workspace.
- 3-2e adds progress, export, accessibility, and hardening.

Blocks 3-2a through 3-2f are implemented historical work. Blocks 3-2g through 3-2o are the corrective dashboard sequence and must be implemented strictly in order before Block 3-3.

Corrective sequence:

1. `completed/block-3-2g-dashboard-contract-and-performance-baseline.md`
2. `completed/block-3-2h-dashboard-shell-and-design-system.md`
3. `completed/block-3-2i-overview-decision-surface.md`
4. `completed/block-3-2j-library-category-browser.md`
5. `completed/block-3-2j-1-cowatch-evidence-semantics.md`
6. `completed/block-3-2k-rich-media-detail-workspace.md`
7. `completed/block-3-2l-daily-session-timeline.md`
8. `completed/block-3-2m-people-and-cowatch-intelligence.md`
9. `completed/block-3-2m-1-person-pairings-and-operations.md`
10. `completed/block-3-2m-2-browser-cowatch-adjudication.md`
11. `completed/block-3-2m-3-discord-cowatch-review.md`
12. `completed/block-3-2m-4-people-cowatch-attribution.md`
13. `completed/block-3-2m-5-people-ordering-and-heatmap-interaction.md`
14. `block-3-2n-hierarchy-progress-workspace.md` - umbrella only; do not implement directly.
15. `completed/block-3-2n-1-progress-read-model-contract.md`
16. `completed/block-3-2n-2-progress-workspace-shell.md`
17. `completed/block-3-2n-3-progress-lazy-hierarchy-endpoints.md`
18. `completed/block-3-2n-4-progress-hierarchy-ui-regression.md`
19. `completed/block-3-2n-5-audiobook-progress-contract.md` - implemented historical reference.
20. `completed/block-3-2n-5a-audiobook-chapter-import-cache.md` - implemented historical reference.
21. `completed/block-3-2n-5b-true-audiobook-chapter-progress.md` - implemented historical reference.
22. `completed/block-3-2n-6-progress-evidence-map-polish.md` - implemented historical reference.
23. `completed/block-3-2n-6a-progress-watcher-coverage-and-workspace-width.md` - implemented historical reference.
24. `completed/block-3-2n-6b-overview-session-feed-deduplication.md` - implemented historical reference.
25. `completed/block-3-2n-5c-reliable-audiobook-discovery-automation.md` - implemented historical reference.
26. `block-3-2n-5d-automatic-audiobook-chapter-proof-handoff.md` - umbrella only; do not implement directly.
   1. `completed/block-3-2n-5d-1-revision-manifest-and-safe-cache-activation.md` - implemented and verified.
   2. `completed/block-3-2n-5d-2-trusted-external-proof-adapter.md` - implemented and verified.
   3. `completed/block-3-2n-5d-2a-embedded-chapter-timeline-normalization.md` - implemented, verified, and passed the corrected Eric canary.
   4. `block-3-2n-5d-3-durable-proof-worker-and-rollout.md` - implemented, verified, and enabled in the recurring PM2 runtime.
27. `block-3-2n-5e-multi-file-audiobook-timeline-proof.md` - implemented and deterministically verified; live multi-file rollout remains gated by `AUDIOBOOK_PROOF_MULTI_FILE_ENABLED`.
   1. `block-3-2n-5e-a-evidence-based-file-boundary-chapters.md` - implemented, deterministically verified, and live-verified with a targeted Path of Daggers canary; recurring multi-file execution remains disabled.
   2. `block-3-2n-5e-b-audnexus-sentinel-and-title-compatibility.md` - implemented, deterministically verified, and live-verified for exact `-1` Audnexus sentinel and hyphenated chapter-title variants.
   3. `block-3-2n-5e-c-deferred-multi-file-layouts.md` - deferred evidence inventory; multipart, named-section, damaged, and generic layouts must be split before implementation.
28. `completed/block-3-2n-6c-visible-progress-and-enriched-detail.md` - implemented and verified.
29. `block-3-2n-6e-universal-detail-workspace-alignment.md` - planned umbrella; do not implement directly. Restore one canonical detail identity, read contract, shell, and route across every dashboard entry surface before adding resume UI.
   1. `completed/block-3-2n-6e-1-canonical-detail-contract-and-entry-resolution.md` - implemented and verified; adds the canonical detail identity/resolver and bounded additive workspace read contract.
   2. `completed/block-3-2n-6e-2-shared-detail-shell-and-category-presenters.md` - implemented and verified; all non-Progress callers use the shared shell and explicit category presenters.
   3. `completed/block-3-2n-6e-2a-rich-detail-hero-and-watcher-lanes.md` - implemented and verified; adds the rich detail hero, honest Audiobook fallback, ordered watcher lanes, and accessible evidence interaction.
   4. `completed/block-3-2n-6e-2b-movie-detail-presenter.md` - implemented and verified; fills the Movie primary column with source-backed viewing detail without changing Progress or artwork semantics.
   5. `completed/block-3-2n-6e-2c-artwork-freshness-and-stale-identity-recovery.md` - implemented and verified through 6E-2C3; canonical artwork adoption and the corrective Movie history/enrichment sequence are complete.
      1. `completed/block-3-2n-6e-2c1-canonical-artwork-resolver-and-proxy-freshness.md` - implemented and verified; adds canonical identity recovery, source authority, revision-aware private proxying, bounded caching, and proxy safety.
      2. `completed/block-3-2n-6e-2c2-dashboard-wide-artwork-adoption-and-compatibility.md` - implemented and verified; adopts the canonical descriptor across every current artwork consumer with compatibility and reload regression coverage.
      3. `completed/block-3-2n-6e-2c3-canonical-movie-history-and-enriched-detail.md` - implemented and verified; joins exact-GUID stale-key Movie history, uses viewing-day evidence, de-duplicates Movie detail, and adds bounded lazy About enrichment.
   6. `completed/block-3-2n-6e-2d-detail-presentation-and-summary-parity.md` - implemented and verified; improves hero readability/responsive crop safety and aligns verified Audiobook summaries with the expanded chapter state.
   7. `completed/block-3-2n-6e-3-progress-migration-and-regression.md` - implemented and verified; Progress now uses the shared canonical detail workspace with legacy URL compatibility and parity coverage.
   8. `completed/block-3-2n-6e-3a-replay-semantics-and-session-provenance.md` - implemented and verified; separates raw observations, reconstructed sessions, household-local viewing days, and evidence-backed replays across Progress and shared detail.
   9. `completed/block-3-2n-6e-3b-on-demand-plex-metadata-and-artwork-refresh.md` - implemented and verified; adds confirmed title-scoped Plex metadata/artwork refresh from the shared detail workspace with stable revisions, privacy-safe errors, and regression coverage.
   10. `block-3-2n-6e-3c-plex-historical-movie-backfill.md` - implemented and verified; supplements post-2022 Tautulli history with exact-GUID, explicitly labeled pre-2022 Plex movie evidence, durable raw snapshots, and idempotent CLI apply.
30. `block-3-2n-6f-overview-playback-digest-cards.md` - implemented Overview QOL follow-up; preserves the existing session-level projection and raw evidence.
   1. `block-3-2n-6f-a-tv-and-anime-session-episode-progress.md` - planned corrective child; adds source-honest per-episode partial/completed progress to expanded TV, Anime, and Classic TV Overview sessions without changing ingestion or persistence.
31. `block-3-2n-6g-audiobook-progress-evidence-repair-and-retroactive-rebuild.md` - implemented audiobook-only corrective block; validates progress evidence, handles cumulative-duration resets with a high-water mark, and rebuilds derived progress without rewriting raw observations.
32. `block-3-2n-6h-canonical-audiobook-progress-timeline-and-rewind-semantics.md` - implemented and verified; canonical evaluator separates current, furthest, session movement, rewind/revisit, chapter state, and uncertainty.
33. `block-3-2n-6i-exact-audiobook-position-evidence-capture.md` - implemented, verified, and live; future exact stop evidence is stored additively in `audiobook_position_evidence`.
34. `block-3-2n-6j-project-wide-audiobook-progress-projection-adoption.md` - implemented umbrella; children completed in order.
   1. `block-3-2n-6j-a-service-and-api-progress-projection-adoption.md` - implemented and verified; typed canonical projections adopted across service/API consumers.
   2. `block-3-2n-6j-b-browser-progress-presentation-and-regression.md` - implemented, verified, and live across visible dashboard surfaces.
35. `block-3-2n-6d-audiobook-resume-context.md` - planned umbrella; do not implement directly. Reuse the exact position evidence from 6I to turn source-backed audiobook stops into private bounded transcript context and a useful resume modal.
   1. `block-3-2n-6d-1-bounded-resume-transcription-contract.md` - split umbrella; do not implement directly.
      1. `block-3-2n-6d-1a-audiobook-transcribe-window-command-and-runtime-proof.md` - cross-repository audiobook command/runtime proof dependency.
      2. `block-3-2n-6d-1b-cowatcher-transcription-contract-fixtures.md` - sanitized CoWatcher fixtures and boundary contract.
   2. `block-3-2n-6d-2-trusted-resume-adapter-and-state.md` - revised to key jobs/results directly to durable 6I evidence.
   3. `block-3-2n-6d-3-stable-stop-worker-and-rollout.md` - revised as bounded reconciliation over durable 6I evidence with separate live enablement.
   4. `block-3-2n-6d-4-audiobook-resume-modal.md` - narrowed to the private stopping-point excerpt extension; canonical progress/chapter UI already exists.
36. `block-3-2o-dashboard-accessibility-and-regression-gate.md` - rewritten as the final semantic/geometry release audit after 6F-A; optional 6D is excluded.

Do not implement a later corrective block until the previous block's exit gate is recorded as passing. A later block must not conceal, waive, or silently absorb a failed earlier acceptance criterion.

The full 3-2m sequence, the 6E shared-detail sequence, 6F/6G, and the canonical audiobook progress sequence 6H/6I/6J-A/6J-B are implemented and verified. Implement 6F-A next. Then complete the narrow 3-6-1 provenance closure and modern Block 3-7 operations acceptance before using 3-2o as the final dashboard release audit. The optional 6D children remain separately selectable and must reuse durable 6I evidence rather than duplicate capture. The pre-implementation reviews are `docs/process/block-3-2n-6e-design-review.md` and `docs/process/block-3-2n-6d-design-review.md`.

## Umbrella Specifications

- `block-3-2-richer-browser-ui.md` - product contract and sequencing for Blocks 3-2a through 3-2e; do not implement directly.

## Completed And Historical Blocks

- `completed/block-00-project-definition.md`
- `completed/block-01-first-verifiable-step.md`
- `completed/block-1-1-local-configuration-and-health.md`
- `completed/block-1-2-tautulli-watch-detection.md`
- `completed/block-1-3-discord-cowatch-flow.md`
- `completed/block-1-4-plex-watched-state-verification.md`
- `completed/block-1-5-preview-first-history-copy.md`
- `block-1-6-mvp-operations-and-acceptance.md` - superseded historical record; current successor is Block 3-7.
- `completed/block-2-1-rich-playback-evidence-capture.md`
- `completed/block-2-2-content-metadata-catalog.md`
- `completed/block-2-3-watch-history-query-api.md`
- `completed/block-2-4-watch-progress-summaries.md`
- `completed/block-2-5-viewing-session-reconstruction.md`
- `completed/block-2-6-cowatching-intelligence.md`
- `completed/block-3-1-audiobook-differentiation.md`
- `completed/block-3-2a-dashboard-mvp-foundation.md`
- `completed/block-3-2b-activity-timeline-layout-system.md`
- `completed/block-3-2c-media-explorer-drilldowns.md`
- `completed/block-3-2d-people-cowatching-workspace.md`
- `completed/block-3-2e-progress-export-hardening.md`
- `completed/block-3-2f-premium-dashboard-redesign.md`
- `completed/block-3-2l-daily-session-timeline.md`
- `completed/block-3-2m-people-and-cowatch-intelligence.md`
- `completed/block-3-2m-1-person-pairings-and-operations.md`
- `completed/block-3-2m-2-browser-cowatch-adjudication.md`
- `completed/block-3-2m-3-discord-cowatch-review.md`
- `completed/block-3-2m-4-people-cowatch-attribution.md`
- `completed/block-3-2m-5-people-ordering-and-heatmap-interaction.md`
- `completed/block-3-2n-1-progress-read-model-contract.md`
- `completed/block-3-2n-2-progress-workspace-shell.md`
- `completed/block-3-2n-3-progress-lazy-hierarchy-endpoints.md`
- `completed/block-3-2n-4-progress-hierarchy-ui-regression.md`

- `completed/block-3-4-hierarchical-audiobook-series-modeling.md`
- `completed/block-3-5-proactive-audiobook-scanner.md`
- `completed/block-3-2n-5c-reliable-audiobook-discovery-automation.md` - implemented historical reference.

## Planned Historical Archive Initiative

- `block-3-6-historical-watch-archive.md` - umbrella only; establish the durable watch archive before achievements.
  1. `block-3-6-1-archive-evidence-and-provenance-contract.md` - revised provenance contract closure; do not recreate the archive.
  2. `block-3-6-2-canonical-media-identity-and-alias-registry.md` - superseded by the delivered identity/recovery children.
   3. `block-3-6-2a-legacy-plex-identity-bridge-and-archive-owned-view-recovery.md`
   4. `block-3-6-2b-archive-identity-review-and-account-context.md`
   5. `block-3-6-2c-canonical-plex-movie-identity-and-stale-key-adoption.md` - implemented 2026-07-19; live apply remains intentionally deferred.
   6. `block-3-6-3-tautulli-ingestion-completeness-and-reconciliation.md` - implemented 2026-07-19.
   7. `block-3-6-4-plex-supplemental-historical-recovery.md` - implemented 2026-07-20; live apply remains intentionally deferred.
   7a. `block-3-6-4a-plex-play-history-recovery-and-reconciliation.md` - implemented and deterministically verified 2026-07-21; controlled live apply and projection enablement completed 2026-07-23.
   8. `block-3-6-5-archive-query-export-and-backup.md` - planned umbrella; implement 3-6-5A/B/C in order.
      1. `block-3-6-5a-versioned-archive-query-contract.md`
      2. `block-3-6-5b-canonical-json-csv-export.md`
      3. `block-3-6-5c-verified-backup-restore-and-disaster-recovery.md`
   9. `block-3-6-6-achievements-engine-v1.md` - planned umbrella; implement 3-6-6A/B before evidence-eligible rule families.
      1. `block-3-6-6a-achievement-evidence-and-versioned-rule-contract.md`
      2. `block-3-6-6b-deterministic-engine-persistence-and-recalculation.md`
      3. `block-3-6-6c-first-watch-and-watch-count-rules.md`
      4. `block-3-6-6d-rewatch-and-confirmed-cowatch-rules.md`
      5. `block-3-6-6e-series-genre-and-library-completion-rules.md` - deferred pending denominator/classification evidence.
- `block-3-2n-5d-automatic-audiobook-chapter-proof-handoff.md` - planned umbrella.
- `completed/block-3-2n-5d-1-revision-manifest-and-safe-cache-activation.md` - implemented historical reference.
- `completed/block-3-2n-5d-2-trusted-external-proof-adapter.md` - implemented historical reference.
- `completed/block-3-2n-5d-2a-embedded-chapter-timeline-normalization.md` - implemented historical reference.
- `block-3-2n-5d-3-durable-proof-worker-and-rollout.md` - implemented historical reference; recurring proof enabled 2026-07-25.
- `block-3-2n-5e-multi-file-audiobook-timeline-proof.md` - implemented multi-file proof and historical playback mapping; live rollout remains gated.
- `block-3-2n-5e-a-evidence-based-file-boundary-chapters.md` - implemented historical reference for exact one-file-per-chapter evidence, future discovery, and targeted legacy reevaluation.
- `block-3-2n-5e-b-audnexus-sentinel-and-title-compatibility.md` - implemented historical reference; three targeted exact file-boundary editions activated while recurring execution remained disabled.
- `block-3-2n-5e-c-deferred-multi-file-layouts.md` - deferred planning inventory; do not implement directly without reviewed child scope.

## Planned Reports And Operations

- `block-3-3-household-watch-reports.md` - planned umbrella; implement children in order.
  1. `block-3-3a-household-report-contract-and-preview.md`
  2. `block-3-3b-discord-delivery-and-idempotency.md`
  3. `block-3-3c-scheduled-runtime-and-rollout.md`
- `block-3-7-operations-readiness-recovery-and-windows-reboot-acceptance.md` - modern replacement for superseded Block 1-6.

Completed blocks remain as historical references. Verify current behavior from code and current docs, not from older block assumptions.

## One Block At A Time

When implementing a numbered block, use the global `implement-block` skill. Read this file first, then open only the selected block file. Do not read or implement later blocks unless the selected block explicitly requires it.

Before editing, briefly state:

- selected block
- files to inspect
- likely files to edit
- expected verification command

Make the smallest code/docs changes needed to satisfy the selected block acceptance criteria.

## Shared Regression Gate

- Every numbered block must run `npm run verify:block` before its status becomes Implemented.
- This command includes compilation, the full service suite, deterministic desktop/narrow Playwright regression coverage, static dashboard syntax, and tool-contract verification.
- Do not replace the shared command with a subset of its component commands.
- UI blocks must add or update semantic regression assertions when they change a durable invariant; do not use broad pixel snapshots to freeze design.
- After a deployed dashboard rebuild or PM2 restart, run the separate read-only `npm run verify:live-dashboard` gate.
- See `docs/testing/dashboard-regression-contract.md` for the authoritative fixture, isolation, and anti-drift contract.

## Block Shape

Each block should include:

- goal
- scope
- out of scope
- likely files or areas
- acceptance criteria
- verification

## Documentation Updates During Blocks

When implementing a block, update project docs only when the work creates or changes durable knowledge future blocks need.

Use:

- `docs/design/` for user-facing, domain, UX, and product behavior
- `docs/logic/` for rules, algorithms, workflows, state machines, and system behavior
- `docs/architecture/` for system structure, component boundaries, integrations, and data flow
- `docs/data/` for schemas, contracts, payloads, storage rules, migrations, and sample data guidance
- `docs/process/` for workflow, verification, review, and development process
- `docs/production/` for deployment, runtime, release, operations, and monitoring
- `docs/testing/` for test strategy, verification commands, fixtures, and manual QA flows
- `docs/decisions/` for important tradeoffs and settled choices

Do not create documentation churn for trivial changes.
