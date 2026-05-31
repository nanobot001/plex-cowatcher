# Block 1-1: Local Configuration And Health

> Status: Implemented on 2026-05-31.
> Result: Implemented.
> Verification: `npm run build`, `npm test`, `npm run db:init`, temporary-port `/api/health` inspection, and browser dashboard inspection - passed.
> Notes: Added local users config loading, readiness reporting, dashboard readiness cards, and readiness documentation while keeping live integrations disabled or unverified.

## Goal

Make the service safe to run locally by loading real non-secret configuration, keeping local values out of Git, and reporting clear health/readiness for each subsystem.

## Scope

- Add or refine local config loading for `config/users.json` while keeping `config/users.example.json` as the template.
- Keep local secrets and local user config out of Git.
- Expand `/api/health` and `/api/status` to report database, Plex, Tautulli, Discord, watcher, and Plex mutation mode readiness.
- Update the browser dashboard to show the same readiness summary.
- Document expected healthy, disabled, unconfigured, and unverified states.

## Out Of Scope

- Real Tautulli polling.
- Live Plex watched-state mutation.
- Sending real Discord prompts.
- Full history copy UI.
- PM2 restart-after-reboot setup.

## Likely Files Or Areas

- `src/utils/config.ts`
- `src/service/healthService.ts`
- `src/server/routes.ts`
- `src/web/index.ts`
- `.gitignore`
- `README.md`
- `docs/production/README.md`

## Acceptance Criteria

- `GET /api/health` returns structured readiness for database, Plex, Tautulli, Discord, watcher, and Plex mutation mode.
- Browser dashboard displays readiness without exposing tokens or API keys.
- Local user config can be created from the example without tracking real local values in Git.
- Missing optional integrations show as disabled or unconfigured, not as crashes.
- `npm run build` and `npm test` pass.

## Verification

- `npm run build`
- `npm test`
- `npm run db:init`
- Start the app and inspect `http://localhost:8787/api/health`.
