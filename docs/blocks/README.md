# Block Implementation

Blocks are numbered, bounded AI-buildable tickets for code, logic, docs, folder structure, tests, workflows, assets, prompts, cleanup, and other project work.

## Active Phase

The MVP is **Phase 1**. Implement the Phase 1 blocks in order:

- `block-1-6-mvp-operations-and-acceptance.md`

Phase 1 is complete when both MVP workflows are verified end to end: Discord co-watch confirmation and preview-first history copy.

## Completed And Historical Blocks

- `completed/block-00-project-definition.md`
- `completed/block-01-first-verifiable-step.md`
- `completed/block-1-1-local-configuration-and-health.md`
- `completed/block-1-2-tautulli-watch-detection.md`
- `completed/block-1-3-discord-cowatch-flow.md`
- `completed/block-1-4-plex-watched-state-verification.md`
- `completed/block-1-5-preview-first-history-copy.md`

Completed and seed-era blocks remain as context in `docs/blocks/completed/`. New MVP implementation work should use the planned block files that remain directly under `docs/blocks/`.

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
