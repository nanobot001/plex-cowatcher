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
node dist/cli/cli.js recent --user Tony --days 7 --pretty
node dist/cli/cli.js pending --pretty
node dist/cli/cli.js preview-copy --source Tony --target Ian --show "The Bear" --season 3 --pretty
node dist/cli/cli.js apply-copy --job 42 --pretty
node dist/cli/cli.js audit --days 7 --pretty
node dist/cli/cli.js retry-failed --pretty
```

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

Set `DISCORD_ENABLED=true`, `DISCORD_BOT_TOKEN`, and `DISCORD_CHANNEL_ID` in `.env`, then run the service. The Discord module contains prompt builders and interaction handling; the CLI currently reports that a running configured bot is required for a live prompt.

## Project Docs

- `docs/project-charter.md` defines the project purpose, goals, success criteria, and document map.
- `docs/blocks/` contains AI-buildable tickets for scoped implementation work.
- `docs/continue-here.md` captures the current handoff state.

## Known Limitations

- Plex per-user mark-watched is mocked unless `PLEX_MUTATION_MODE=live`; the live mutation path still intentionally returns an unverified failure.
- Tautulli is used only through its HTTP API as a history/activity source.
- Browser UI is server-rendered MVP HTML and intentionally minimal.
- Retry queue storage exists; live retry behavior waits for Plex mutation verification.
