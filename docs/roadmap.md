# Roadmap

This roadmap turns the project charter into implementation blocks. The MVP is **Phase 1**. Each old phase has been collapsed into a Phase 1 block so the project can move through `block-1-1`, `block-1-2`, and onward until MVP completion.

## Foundation: Scaffold Baseline

Status: mostly complete.

Purpose: make the project buildable, runnable, and tool-friendly before touching live Plex/Tautulli/Discord behavior.

Acceptance:

- TypeScript project builds with `npm run build`.
- Tests run with `npm test`.
- SQLite schema initializes with `npm run db:init`.
- Express exposes `/api/health`.
- CLI returns structured JSON.
- Browser shell opens at `http://localhost:8787`.
- Discord prompt builders and interaction handler call the shared service layer.
- Plex/Tautulli adapters exist with mock-safe seams.

## Phase 1: MVP

Phase 1 is complete when the service can perform both MVP workflows end to end:

- Discord co-watch confirmation from detected watch through audited prompt resolution.
- Preview-first history copy from source user to target user(s), with explicit apply and idempotent results.

### Block 1-1: Local Configuration And Health

Make the service honest about local readiness before real automation is enabled.

- Move from example-only user config to a local ignored config file such as `config/users.json`.
- Add config validation with clear startup errors for missing required values.
- Expand `/api/health` and `/api/status` to report database, Tautulli, Plex, Discord, watcher, and PM2-relevant state.
- Add a browser dashboard that shows health, configured users, pending prompts, and recent errors.

### Block 1-2: Tautulli Watch Detection

Reliably detect completed source-user watches without duplicate prompts.

- Implement Tautulli recent-history polling through `tautulliAdapter`.
- Normalize Tautulli rows into internal watch event inputs.
- Implement completion threshold logic and recent-window duplicate defense.
- Persist watch events in SQLite.
- Add tests with mocked Tautulli rows for movies and episodes.

### Block 1-3: Discord Co-Watch Flow

Make the Discord prompt workflow useful with mock Plex sync first, then verified live sync.

- Send a test prompt to the configured Discord channel.
- Send real prompts for pending watch events.
- Support typical co-watch users, everyone, no one, dismiss, and browser/admin link actions.
- Resolve prompts through `cowatchService.resolvePrompt`.
- Edit the Discord message with per-target sync results.

### Block 1-4: Plex Watched-State Verification

Prove or explicitly constrain the live Plex mutation path.

- Document the exact Plex account/token model used locally.
- Verify list-users, metadata lookup, watched-state check, and mark-watched behavior against the real setup.
- Keep `PLEX_MUTATION_MODE=mock` as the default until verification is complete.
- Add clear error codes for missing permissions, unavailable users, unmatched media, timeout, and already watched.

### Block 1-5: Preview-First History Copy

Make the browser and CLI copy workflow safe enough for real use.

- Add source user, target user, media type, show, season, library, watched-state, and date filters.
- Preview copy jobs from Tautulli/Plex history without mutating Plex state.
- Apply only an existing preview job with explicit confirmation.
- Skip already-watched or already-copied items.
- Store per-item status and failures.

### Block 1-6: MVP Operations And Acceptance

Make the MVP dependable enough for daily household use.

- Confirm PM2 runs exactly one forked instance.
- Document start, stop, restart, logs, status, and save commands.
- Choose and document Windows restart-after-reboot strategy.
- Add operational troubleshooting for Discord, Tautulli, Plex, SQLite, and port conflicts.
- Run the MVP manual acceptance checklist.

## Phase 2: Post-MVP Enhancements

- Richer browser UI with pagination, search, CSV export, and more review controls.
- Per-user Discord DM prompts.
- Daily or weekly household watch reports.
- Advanced matching across renamed or migrated libraries.
- Supervisor bot or MCP-style adapter.
- Multi-server support.
