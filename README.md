# Plex Co-Watch Sync

Tool-friendly Windows-local service for Plex household co-watch workflows. It watches configured Plex/Tautulli history, prompts in Discord when a source user finishes media, and provides a browser UI, HTTP API, and CLI for previewing or applying watched-history copy jobs.

The MVP intentionally does not modify Tautulli's database, delete history, or mark items unwatched. Plex watched-state writes are adapter-backed and default to mock mode until live per-user mutation is verified against the local Plex setup.

## Setup

```powershell
npm install
Copy-Item .env.example .env
npm run db:init
npm run build
npm test
```

Edit `.env` with Plex, Tautulli, Discord, and SQLite settings. Keep `PLEX_MUTATION_MODE=mock` until live Plex watched-state behavior is verified.

Create local household user config from the checked-in template:

```powershell
Copy-Item config/users.example.json config/users.json
```

Edit `config/users.json` with local Plex usernames, optional Plex user IDs, and optional Discord user IDs. `config/users.json` is ignored by Git; keep real household values there and keep `config/users.example.json` generic.

## Run Locally

```powershell
npm run dev
```

Open:

```text
http://localhost:8787
```

Go to `/copy` for the history copy utility:

```text
http://localhost:8787/copy
```

### Dashboard Overview
- The `/` dashboard now opens with an overview surface that emphasizes recent playback, household summary cards, and operational status.
- Filter controls are ordered by category, user, then search so browsing starts with media type first.
- Recent playback cards compactly show shared watches when multiple people are involved, while keeping single-user cards simple.

### History Copy UI Features
- **Interactive Preview Grid**: Lists all history items for the copy job, including status (eligible, already watched, already copied, restricted, or no matching media).
- **Selective Sync Highlight**: Click on any eligible row to toggle its selection status. Only highlighted rows will be copied.
- **Shift-Click Range Selection**: Click on a starting row, then hold `Shift` and click on another row to select/deselect a range of rows.
- **Skipped Item Handling**: Deselected eligible items are marked as `skipped` in the database with the reason `deselected` when the copy is applied.

Health endpoint:

```text
GET http://localhost:8787/api/health
```

`/api/health` and `/api/status` return the same structured readiness summary for `database`, `plex`, `tautulli`, `discord`, `watcher`, and `plexMutation`. Public health output reports only non-sensitive status and messages.

Readiness states:

- `healthy`: the subsystem is locally available.
- `disabled`: the subsystem is intentionally off or deferred by the current MVP block.
- `unconfigured`: required local config is missing or still set to placeholder values.
- `unverified`: config exists, but live connectivity or live mutation has not been proven by the MVP yet.

## CLI

After `npm run build`, the CLI entry is available at `dist/cli/cli.js`.

```powershell
node dist/cli/cli.js health --pretty
node dist/cli/cli.js users --pretty
node dist/cli/cli.js sync-users
node dist/cli/cli.js recent --user Tony --days 7 --pretty
node dist/cli/cli.js pending --pretty
node dist/cli/cli.js preview-copy --source Tony --target Ian --show "The Bear" --season 3 --pretty
node dist/cli/cli.js apply-copy --job 42 --pretty
node dist/cli/cli.js audit --days 7 --pretty
node dist/cli/cli.js retry-failed --pretty
node dist/cli/cli.js verify-plex-watched-state --target-plex-user-id Ian --rating-key 12345 --pretty

# Phase 2 playback observations, ingestion, metadata catalog, and query APIs
node dist/cli/cli.js ingest --pretty
node dist/cli/cli.js backfill --user Tony --pages 3 --pretty
node dist/cli/cli.js refresh-catalog --show 12345 --pretty
node dist/cli/cli.js watch-history --user Tony --limit 5 --pretty
node dist/cli/cli.js watch-summary --user Tony --days 7 --pretty
node dist/cli/cli.js viewing-sessions --user Tony --days 7 --pretty
node dist/cli/cli.js cowatching --days 7 --pretty

# Phase 3 audiobook support
node dist/cli/cli.js audiobook-backfill --mode hierarchy --pretty
node dist/cli/cli.js scan-audiobooks --library "Audiobooks" --pretty
```

`verify-plex-watched-state` is the guided Block 1-4 check for Plex user listing, metadata lookup, and watched-state lookup. Add `--mark-watched` only with a known safe media item after confirming the target account/token model. The current live mutation path returns `unsupported_mutation` instead of writing watched state because per-target Plex mutation has not been verified for this household setup.

## PM2

Build first, then start exactly one supervised service:

```powershell
npm run build
pm2 start ecosystem.config.js --only plex-cowatch-service
pm2 status
pm2 logs plex-cowatch-service
pm2 restart plex-cowatch-service
pm2 stop plex-cowatch-service
pm2 save
```

Windows restart-after-reboot should be documented after choosing between Task Scheduler and a Windows service wrapper. The scaffold does not assume Linux-style PM2 startup hooks.

## Discord Test Prompt

Set `DISCORD_ENABLED=true`, `DISCORD_BOT_TOKEN`, and `DISCORD_CHANNEL_ID` in `.env`, then run the service. When Discord is enabled, the service connects the bot and sends prompts for pending watch events. The prompt records the Discord channel/message IDs so the same pending event is not sent twice.

To send one real prompt for a pending watch event from the CLI:

```powershell
npm run build
node dist/cli/cli.js test-discord-prompt --pretty
node dist/cli/cli.js test-discord-prompt --watch-event-id 42 --pretty
```

This posts to the configured Discord channel. Keep `PLEX_MUTATION_MODE=mock` until live per-user watched-state mutation is verified and explicitly enabled in code.

## Project Docs

- `docs/project-charter.md` defines the project purpose, goals, success criteria, and document map.
- `docs/blocks/` contains AI-buildable tickets for scoped implementation work.
- `docs/continue-here.md` captures the current handoff state.

## Known Limitations

- Plex per-user mark-watched is mocked by default. With `PLEX_MUTATION_MODE=live`, reads can be checked through the Plex adapter, but mark-watched returns structured `unsupported_mutation` failures until the account/token model for target-user mutation is verified.
- Tautulli is used only through its HTTP API as a history/activity source.
- Browser UI is server-rendered MVP HTML and intentionally minimal.
- Retry queue storage exists; live retry behavior waits for Plex mutation verification.
