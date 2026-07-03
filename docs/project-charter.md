# Project Charter

This is the top-level authority and index for the project. Design, logic, architecture, data, process, production, testing, and block work should flow from this document.

## Purpose

Plex Co-Watch Sync is a Windows-friendly local service for a household Plex setup. It detects completed watches for a configured source user, asks in Discord whether others watched too, and safely records or applies watched-state syncs through a shared service layer.

## Audience / Users

The primary user is the household Plex administrator running a local Windows service. Secondary users are household co-watchers represented in Plex and Discord.

## Goals

- Detect completed watches for configured source Plex users through Tautulli/Plex without writing to Tautulli.
- Prompt in Discord for co-watch confirmation and resolve selected household viewers through the shared service layer.
- Mark selected target Plex users watched where live Plex support is verified, with mock/dry-run behavior before verification.
- Provide a localhost browser tool for preview-first history copy from one Plex user to one or more target users.
- Keep HTTP API, browser UI, Discord handlers, CLI commands, and future tool/supervisor callers on one shared service layer.
- Keep all write actions structured, auditable, idempotent, and safe to retry.
- Run as a single PM2-supervised Windows-local service.

## Non-Goals

- Do not modify Tautulli's database in the MVP.
- Do not delete watch history.
- Do not mark items unwatched.
- Do not expose the local admin API publicly.
- Do not treat Plex per-user watched-state mutation as complete until verified live.

## MVP Definition

The MVP is a local, single-process household co-watch assistant that can complete two practical workflows end to end:

1. **Discord co-watch confirmation:** when Tony or another configured source user completes a movie or episode, the service records a deduped watch event, posts a Discord prompt, accepts a household co-watcher selection, writes an audit trail, and marks the selected Plex user watched when live Plex mutation has been verified for that account.
2. **Preview-first history copy:** from the browser UI or CLI, the admin can choose a source user, target user(s), and basic filters, preview the items that would be copied, then explicitly apply the job. Apply must skip already-watched/already-copied items and record successes or failures.

The MVP is **Phase 1** of the roadmap. The current scaffold is the **foundation milestone**: it proves build/test, SQLite initialization, API health, CLI shape, browser shell, Discord prompt seams, and adapter boundaries. Phase 1 is complete when blocks `1-1` through `1-6` are implemented and the real local Plex/Tautulli/Discord loop is verified with safe defaults.

## Future Goals

- Retain richer playback evidence than Plex watched flags, including who watched, when, and how much.
- Let trusted local scripts query watch history by person, exact content, media type or genre, and household-local time.
- Calculate show progress without confusing repeated plays with distinct episodes watched.
- Reconstruct viewing sessions and distinguish explicit confirmation from co-watching inference.
- Better matching for renamed or migrated media.
- CSV export/import for history copy previews.
- Per-user Discord DM prompts.
- Household watch reports.
- Richer browser copy-history UI with search, pagination, and bulk review ergonomics.
- Restart-after-reboot documentation for Windows.
- Supervisor-bot or future MCP-style wrapper integration.

## Phase 2 MVP Definition

Phase 2 makes Plex CoWatcher a local watch-history intelligence service for other scripts. It is complete when blocks `2-1` through `2-6` are implemented and verified: rich playback evidence is captured for enabled configured users; content has stable queryable identity and classification; CLI and HTTP callers can combine person, exact content, type or genre, and household-local time filters; summaries explain how much was watched; viewing sessions are reproducible; and co-watching results clearly separate observed playback, human confirmation, synchronized Plex state, and inference.

Phase 2 remains read-oriented. Inferred participation must never trigger Plex watched-state mutation, and missing evidence must remain unknown rather than being converted into a confident fact.

## Success Criteria

### Foundation Milestone

- `npm run build` succeeds.
- `npm test` succeeds.
- `GET /api/health` returns structured service status.
- SQLite initializes with the MVP schema.
- CLI commands return structured JSON.
- Browser UI opens locally at `http://localhost:8787`.
- Discord prompt resolution calls `cowatchService.resolvePrompt`.

### MVP Complete

- Configured source and target users can be loaded without storing secrets in repo.
- Tautulli recent history polling can detect at least one completed watch for the source user.
- Duplicate prompts are prevented for the same source user, rating key, and watched timestamp.
- A Discord prompt can be sent to the configured channel and resolved through buttons/select menus.
- Prompt resolution records co-watch confirmations and per-target Plex sync results.
- Plex mark-watched has been verified live for the intended household account/token model, or remains explicitly disabled with clear UI/API messaging.
- Browser history copy can preview a filtered job and apply it only after confirmation.
- Re-running prompt resolution or copy apply does not duplicate work.
- Mutations write to `audit_log`.
- PM2 runs exactly one service instance and `/api/health` catches database, Discord, watcher, and adapter health problems.
- README documents setup, `.env`, PM2, Discord test prompt, browser UI, CLI, and known live-verification limits.

## Constraints

- Bind to localhost by default.
- Store secrets only in `.env`.
- Do not log tokens or API keys.
- PM2 must use one forked instance for MVP.
- Live Plex mutation must remain explicit and verified.
- Bulk history copy must preview before apply.
- Never modify Tautulli's database in MVP.
- Never delete history or mark items unwatched in MVP.

## Development Strategy

Blocks are the executable planning units for AI-assisted development. Every block should advance a goal, reduce a risk, validate an assumption, or prepare the foundation for later work.

Every numbered block must pass `npm run verify:block` before it is marked implemented. Dashboard deployments also require the separate read-only `npm run verify:live-dashboard` smoke check after rebuild or restart. The authoritative invariant and fixture rules live in `docs/testing/dashboard-regression-contract.md`.

When a block creates durable project knowledge, update the relevant docs area so future blocks inherit that context.

## Block Index And Next Steps

- Block index: `docs/blocks/README.md`
- Roadmap: `docs/roadmap.md`
- Project definition block: `docs/blocks/completed/block-00-project-definition.md`
- Next MVP block: `docs/blocks/block-1-4-plex-watched-state-verification.md`
- Phase 2 starts after Phase 1 acceptance with `docs/blocks/block-2-1-rich-playback-evidence-capture.md`.

## Document Map

- `docs/blocks/` contains AI-buildable tickets.
- `docs/roadmap.md` defines milestone order from scaffold to MVP and later enhancements.
- `docs/design/` records user-facing, domain, UX, and product behavior.
- `docs/logic/` records rules, algorithms, workflows, state machines, and system behavior.
- `docs/architecture/` records system structure, component boundaries, integrations, and data flow.
- `docs/data/` records schemas, contracts, payloads, storage rules, migrations, and sample data guidance.
- `docs/process/` records how work is planned, verified, reviewed, and shipped.
- `docs/production/` records deployment, runtime, release, operations, environments, and monitoring.
- `docs/testing/` records test strategy, verification commands, fixtures, and manual QA flows.
- `docs/decisions/` records important tradeoffs and settled choices.
