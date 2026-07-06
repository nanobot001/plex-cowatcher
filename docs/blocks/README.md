# Block Implementation

Blocks are numbered, bounded AI-buildable tickets for code, logic, docs, folder structure, tests, workflows, assets, prompts, cleanup, and other project work.

## Active Phase

The project is currently in the Phase 3 refinement set. A live Playwright review found that the completed 3-2f redesign did not meet its intended usability, bounded-rendering, or responsive outcome. The immediate next selected block is:

- `block-3-2n-hierarchy-progress-workspace.md`

Phase 3 builds on the completed playback-intelligence foundation with domain-specific refinement, richer operator ergonomics, and reporting.
Blocks 3-2a through 3-2e form one sequential dashboard implementation path:

- 3-2a establishes the usable household overview and shared dashboard vocabulary.
- 3-2b adds the reusable layout system and chronological activity view.
- 3-2c adds media browsing and rich drill-downs.
- 3-2d adds the people and co-watching workspace.
- 3-2e adds progress, export, accessibility, and hardening.

Blocks 3-2a through 3-2f are implemented historical work. Blocks 3-2g through 3-2o are the corrective dashboard sequence and must be implemented strictly in order before Block 3-3.

Corrective sequence:

1. `block-3-2g-dashboard-contract-and-performance-baseline.md`
2. `block-3-2h-dashboard-shell-and-design-system.md`
3. `block-3-2i-overview-decision-surface.md`
4. `block-3-2j-library-category-browser.md`
5. `block-3-2j-1-cowatch-evidence-semantics.md`
6. `block-3-2k-rich-media-detail-workspace.md`
7. `completed/block-3-2l-daily-session-timeline.md`
8. `block-3-2m-people-and-cowatch-intelligence.md`
9. `block-3-2m-1-person-pairings-and-operations.md`
10. `block-3-2m-2-browser-cowatch-adjudication.md`
11. `block-3-2m-3-discord-cowatch-review.md`
12. `block-3-2m-4-people-cowatch-attribution.md`
13. `block-3-2n-hierarchy-progress-workspace.md`
14. `block-3-2o-dashboard-accessibility-and-regression-gate.md`

Do not implement a later corrective block until the previous block's exit gate is recorded as passing. A later block must not conceal, waive, or silently absorb a failed earlier acceptance criterion.

The full 3-2m sequence is implemented and verified: household profiles, person pairings/operations, browser adjudication, Discord review, and deduplicated confirmed co-watch attribution. Block 3-2n is the next corrective block.

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
- `block-1-6-mvp-operations-and-acceptance.md`
- `block-2-1-rich-playback-evidence-capture.md`
- `block-2-2-content-metadata-catalog.md`
- `block-2-3-watch-history-query-api.md`
- `block-2-4-watch-progress-summaries.md`
- `block-2-5-viewing-session-reconstruction.md`
- `block-2-6-cowatching-intelligence.md`
- `completed/block-3-1-audiobook-differentiation.md`
- `completed/block-3-2a-dashboard-mvp-foundation.md`
- `completed/block-3-2b-activity-timeline-layout-system.md`
- `completed/block-3-2c-media-explorer-drilldowns.md`
- `completed/block-3-2d-people-cowatching-workspace.md`
- `completed/block-3-2e-progress-export-hardening.md`
- `completed/block-3-2f-premium-dashboard-redesign.md`
- `completed/block-3-2l-daily-session-timeline.md`

- `completed/block-3-4-hierarchical-audiobook-series-modeling.md`
- `completed/block-3-5-proactive-audiobook-scanner.md`

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
