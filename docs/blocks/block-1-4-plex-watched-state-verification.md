# Block 1-4: Plex Watched-State Verification

> Status: Planned.
> Result: Not implemented.
> Notes: This block decides what live Plex watched-state mutation can safely support for the MVP.

## Goal

Verify the exact Plex account/token model needed for target-user watched-state mutation, or keep live mutation explicitly disabled with clear errors.

## Scope

- Document the local Plex authentication model needed for source and target users.
- Verify Plex user listing, metadata lookup, watched-state check, and mark-watched behavior against a known safe media item.
- Keep `PLEX_MUTATION_MODE=mock` as the default.
- Add clear result statuses and error codes for already watched, missing permissions, unavailable target user, no matching media, Plex failure, and timeout.
- Ensure Discord/API/CLI results never claim live mutation succeeded unless it actually did.

## Out Of Scope

- Tautulli database edits.
- Marking items unwatched.
- Bulk history copy UX.
- Advanced media matching.

## Likely Files Or Areas

- `src/adapters/plexAdapter.ts`
- `src/service/syncService.ts`
- `src/service/cowatchService.ts`
- `src/service/historyCopyService.ts`
- `docs/data/README.md`
- `docs/decisions/README.md`
- `README.md`

## Acceptance Criteria

- The repo documents whether live Plex mark-watched is verified, and under which account/token model.
- Mock mode remains the default and safe.
- Live mode returns explicit success/failure per target and media item.
- Missing permission or unsupported mutation paths are visible in structured JSON and audit records.
- `npm run build` and `npm test` pass.

## Verification

- `npm run build`
- `npm test`
- Manual Plex verification with one known target user and one known media item.
