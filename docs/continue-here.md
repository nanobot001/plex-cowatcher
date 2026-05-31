# Continue Here

## Current State

- Initial seed scaffold and TypeScript MVP service skeleton are in place for `plex-cowatch-sync` in `C:\Users\antho\Code\plex-cowatcher`.
- The project has Express API routes, server-rendered browser pages, a CLI, Discord prompt builders, SQLite schema, mock-safe Plex/Tautulli adapter seams, and PM2 config.
- The MVP is now defined as a real local co-watch workflow, not merely the scaffold: Discord confirmation plus preview-first history copy, both backed by the shared service layer and audited SQLite state.
- The MVP has been collapsed into Phase 1, represented by block files `block-1-1` through `block-1-6`.

## Key Links

- Project charter: `docs/project-charter.md`
- Roadmap: `docs/roadmap.md`
- Block index: `docs/blocks/README.md`
- Project definition block: `docs/blocks/block-00-project-definition.md`
- Next MVP block: `docs/blocks/block-1-1-local-configuration-and-health.md`

## Next Recommended Step

- Implement `docs/blocks/block-1-1-local-configuration-and-health.md`. This should make the service honest about configured users, missing secrets, disabled adapters, database health, Discord readiness, Tautulli reachability, and Plex mutation mode.

## Open Questions

- Which Windows restart-after-reboot strategy should be documented: Task Scheduler or Windows service wrapper?
- Which Plex authentication approach supports per-user watched-state mutation in this household setup?
- Should local user config move from `config/users.example.json` to a non-example ignored file in the next block?
