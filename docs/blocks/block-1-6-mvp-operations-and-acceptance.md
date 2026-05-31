# Block 1-6: MVP Operations And Acceptance

> Status: Planned.
> Result: Not implemented.
> Notes: Final MVP block; validates the full Phase 1 workflow and Windows-local runtime.

## Goal

Make the MVP dependable enough for daily household use under PM2 on Windows and document the final acceptance path.

## Scope

- Confirm PM2 starts exactly one forked `plex-cowatch-service` instance.
- Document start, stop, restart, status, logs, and save commands.
- Choose and document Windows restart-after-reboot strategy.
- Add troubleshooting for Discord, Tautulli, Plex, SQLite, port conflicts, and unverified mutation mode.
- Add and run a manual MVP acceptance checklist.
- Update README and handoff docs with current limits and next post-MVP ideas.

## Out Of Scope

- New product features beyond MVP acceptance.
- PM2 cluster mode.
- Linux startup hooks.
- Public deployment.

## Likely Files Or Areas

- `ecosystem.config.js`
- `README.md`
- `docs/production/README.md`
- `docs/testing/README.md`
- `docs/continue-here.md`
- `docs/roadmap.md`

## Acceptance Criteria

- PM2 runs one service instance with `instances: 1` and `exec_mode: "fork"`.
- `/api/health` remains useful when one subsystem is broken.
- README has setup, `.env`, PM2, browser UI, CLI, Discord prompt, and manual test steps.
- The full MVP acceptance checklist has been executed or any blocked live checks are explicitly documented.
- `npm run build` and `npm test` pass.

## Verification

- `npm run build`
- `npm test`
- `pm2 start ecosystem.config.js --only plex-cowatch-service`
- Manual MVP checklist in `docs/testing/README.md`.
