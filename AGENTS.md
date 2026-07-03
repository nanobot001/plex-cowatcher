# Agent Instructions

Use `docs/project-charter.md` as the top-level project authority. Use `docs/blocks/` for scoped AI-buildable tickets and implement one selected block at a time.

When implementing a block, update project docs only when the work creates or changes durable knowledge future blocks need. Use the relevant docs area and avoid documentation churn for trivial edits.

For numbered block work, use the global `implement-block` skill. Do not create project-specific local skills unless a repeated workflow becomes too specialized for this file and the project docs.

## Mandatory Block Verification

- Before marking any numbered block implemented, run `npm run verify:block`; individual build or test commands do not substitute for this gate.
- Dashboard changes must extend `tests/e2e/dashboard-regression.spec.mjs` when they add or alter a durable cross-surface invariant.
- The deterministic block gate must use its isolated fixture database and test-owned port. It must never depend on PM2, the live SQLite database, or external services.
- After rebuilding or restarting the deployed dashboard, run `npm run verify:live-dashboard` as the separate read-only live smoke gate.
- Follow `docs/testing/dashboard-regression-contract.md` for selector, fixture, and anti-drift rules.

## Tool-Friendly Project Rules

This project may be called by another program, bot, supervisor, CLI wrapper, local HTTP API, or future MCP-style wrapper.

Before changing worker behavior, state persistence, tool outputs, permissions, or adapter routes, read:

- `docs/tool-adapter-memory.md`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`
- `docs/permissions.md`
- `docs/event-log-schema.md`

Rules:

- Preserve structured JSON outputs for tool-facing commands.
- Do not remove dry-run behavior from write/admin/destructive tools.
- Do not expose secrets, private paths, API keys, tokens, or sensitive local details in public-read tools.
- Do not treat human text logs as the source of truth if structured state exists.
- Keep tool names stable once published.
- Record meaningful domain events in the local state layer.
- Record structured errors.
- Keep a cheap verification command for the tool contract.
- Preserve the project's normal runtime model, including PM2, cron, Task Scheduler, Docker Compose, or systemd if used.
- **Safe File Editing**: Never use the `write_to_file` tool to overwrite an existing file. Always use targeted `replace_file_content` or `multi_replace_file_content` tools to prevent accidental full-file deletions or destructive overwrites.
