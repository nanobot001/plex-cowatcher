# Block Implementation

Blocks are numbered, bounded AI-buildable tickets for code, logic, docs, folder structure, tests, workflows, assets, prompts, cleanup, and other project work.

## Active Phase

The project is currently in the Phase 3 refinement set. The next planned blocks are:

- `block-3-2-richer-browser-ui.md`
- `block-3-3-household-watch-reports.md`
- `block-3-4-hierarchical-audiobook-series-modeling.md`

Phase 3 builds on the completed playback-intelligence foundation with domain-specific refinement, richer operator ergonomics, and reporting.

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
- `block-3-1-audiobook-differentiation.md`

Completed blocks remain as historical references. Verify current behavior from code and current docs, not from older block assumptions.

## One Block At A Time

When implementing a numbered block, use the global `implement-block` skill. Read this file first, then open only the selected block file. Do not read or implement later blocks unless the selected block explicitly requires it.

Before editing, briefly state:

- selected block
- files to inspect
- likely files to edit
- expected verification command

Make the smallest code/docs changes needed to satisfy the selected block acceptance criteria.

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
- `docs/production/` for deployment, runtime, release, and operations
- `docs/testing/` for test strategy and verification patterns
- `docs/decisions/` for important tradeoffs and settled choices

Do not create documentation churn for trivial changes.