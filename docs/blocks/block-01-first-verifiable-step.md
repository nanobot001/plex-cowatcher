# Block 01: First Verifiable Step

> Status: Superseded by the Phase 1 MVP block series.
> Result: Historical seed block retained for context.
> Notes: Use `docs/blocks/block-1-1-local-configuration-and-health.md` as the next active implementation block.

## Goal

Create the smallest checkable next step toward the MVP: local configuration and health reporting that clearly says what is configured, disabled, unavailable, or unverified.

## Scope

- Add or refine local config loading for `config/users.json` while keeping `config/users.example.json` as the template.
- Keep local secrets and local user config out of Git.
- Expand `/api/health` and `/api/status` to report database, Plex, Tautulli, Discord, watcher, and mutation-mode readiness.
- Update the browser dashboard to show the same readiness summary.
- Document the verification command and expected health states.

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

- `npm run build` passes.
- `npm test` passes.
- `GET /api/health` returns structured readiness for database, Plex, Tautulli, Discord, watcher, and Plex mutation mode.
- Browser dashboard displays the readiness summary without exposing tokens or API keys.
- Local user config can be created from the example without tracking real local values in Git.
- Missing optional integrations show as disabled or unconfigured, not as crashes.

## Verification

- `npm run build`
- `npm test`
- `npm run db:init`
- Start the app and inspect `http://localhost:8787/api/health`.
