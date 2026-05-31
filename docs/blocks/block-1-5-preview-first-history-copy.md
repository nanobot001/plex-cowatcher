# Block 1-5: Preview-First History Copy

> Status: Planned.
> Result: Not implemented.
> Notes: Completes the second MVP workflow once detection, Discord, and Plex sync safety are established.

## Goal

Let the admin preview and explicitly apply watched-history copy jobs from a source user to one or more target users without duplicate or hidden mutations.

## Scope

- Add filters for source user, target users, media type, show, season, library, watched state, and date range.
- Generate copy job previews from Tautulli/Plex history without mutating Plex.
- Store `copy_jobs` and `copy_job_items` with per-target status.
- Apply only an existing preview job when explicit confirmation is provided.
- Skip already-watched or already-copied items.
- Show preview, apply result, and audit data in browser UI and CLI/API responses.

## Out Of Scope

- CSV export/import.
- Advanced media matching across renamed libraries.
- Public access or multi-user permissions.
- Undo/unwatched behavior.

## Likely Files Or Areas

- `src/service/historyCopyService.ts`
- `src/adapters/tautulliAdapter.ts`
- `src/adapters/plexAdapter.ts`
- `src/server/routes.ts`
- `src/web/index.ts`
- `src/cli/cli.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Preview creates a copy job and item rows without Plex mutation.
- Apply requires an existing `jobId` and explicit confirmation.
- Apply records copied, skipped, and failed counts.
- Re-applying the same job does not duplicate work.
- Browser UI can show preview and audit results.
- `npm run build` and `npm test` pass.

## Verification

- `npm run build`
- `npm test`
- Manual browser preview/apply using mock or verified Plex mode.
