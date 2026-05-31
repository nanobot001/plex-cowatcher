# Production

Deployment, runtime, release, operations, environments, and monitoring live here.

## Local Configuration

Runtime secrets belong in `.env`; household user mapping belongs in `config/users.json`. Create it from `config/users.example.json` and keep real local values out of Git.

Public status and health responses must not expose tokens, API keys, private paths, or raw local config. Use the readiness summary instead.

## Readiness States

`/api/health`, `/api/status`, and the browser dashboard report these subsystem states:

- `healthy`: locally available and ready.
- `disabled`: intentionally off, mocked, or deferred to a later MVP block.
- `unconfigured`: required non-secret config or local credentials are missing.
- `unverified`: config exists, but live connectivity or live mutation has not been verified.

Expected block 1-1 behavior:

- Database should report `healthy` when SQLite opens and migrations are applied.
- Plex and Tautulli report `unconfigured` until their local tokens are set, then `unverified` until later live checks prove them.
- Discord reports `disabled` when `DISCORD_ENABLED=false`, `unconfigured` if enabled without token/channel values, and `unverified` once configured but not live-tested.
- Watcher reports `unconfigured` without enabled source users in `config/users.json`, and `disabled` until real Tautulli polling is implemented.
- Plex mutation reports `disabled` in mock mode and `unverified` for live mode until per-user mark-watched behavior is proven.
