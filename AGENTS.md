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

## Dashboard & UI Design Standards

All dashboard and web UI changes must follow these layout and spacing principles. Treat violations as bugs, not style preferences.

### Spacing & Negative Space

- **Balanced padding**: Every container, card, and section must have enough internal padding that text never touches the edge. Minimum `12px` on small containers, `16px–24px` on cards and modals.
- **No excessive negative space**: Modals and panels must size to their content. Use `max-height` (not fixed `height`) for containers whose content length varies. Empty space > 25% of a container's visible area is a defect.
- **Element separation**: Adjacent text elements (badges, names, dates, labels) must have at least `8px` gap or margin between them. Crowded or touching elements are a defect.

### Overflow & Scrolling

- **No horizontal scroll**: Content must never overflow its container horizontally. Use `min-width: 0` on grid/flex children, proportional column sizing (`auto`, `1fr`), and `overflow: hidden; text-overflow: ellipsis` on text that might be long.
- **Vertical scroll only where intended**: Only explicitly scrollable regions (e.g. `.detail-scroll-container`) should scroll. The outer dialog or page should not scroll if an inner region already handles it.
- **Thin, subtle scrollbars**: Use `scrollbar-width: thin` and semi-transparent custom scrollbar styling. Never leave default OS scrollbars on dark-themed containers.

### Grid & Table Layouts

- **Proportional columns**: Prefer `auto` and `1fr` grid columns over fixed pixel widths. Fixed widths break at different viewport sizes and content lengths.
- **Aligned columns across rows**: When multiple rows display the same data shape (badge + name + date), they must use a shared grid or table layout so columns align vertically across all rows.
- **Text truncation**: Long text in constrained columns must truncate with ellipsis rather than expanding the column or wrapping unpredictably.

### Cards & Modals

- **Content-first sizing**: Modals shrink to fit short content and grow (up to a max) for long content.
- **Fixed reference elements**: In two-column detail layouts, the reference column (poster, artwork) stays fixed or sticky while the content column scrolls.
- **Hierarchy placement**: TV season/chapter hierarchies belong in the poster column (left), not in the scrolling content column.

### Responsive Behavior

- **Mobile-first flex, desktop grid**: Use `flex-direction: column` as the base layout and switch to `grid` at `min-width: 768px` breakpoints.
- **No viewport assumptions**: Never assume a specific modal or container width. Test that layouts work from 320px to 1440px without horizontal overflow.
