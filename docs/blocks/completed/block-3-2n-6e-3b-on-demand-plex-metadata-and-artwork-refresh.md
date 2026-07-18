# Block 3-2n-6E-3B: On-Demand Plex Metadata And Artwork Refresh

> Status: Implemented and verified 2026-07-17.
> Result: Implemented.
> Verification: `npm run verify:block` passed with 115 service/integration tests, 55 dashboard regression tests, one intentional viewport-matrix skip, JavaScript syntax verification, and tool-contract verification. After the PM2 rebuild/restart, `npm run verify:live-dashboard` passed.
> Notes: Added a confirmed title-scoped refresh service and localhost route, shared detail-workspace control, exact identity/GUID targeting, request coalescing, revision-stable artwork fingerprints, privacy-safe audit/error handling, and regression coverage. The legacy CLI refresh path remains unchanged.

## Goal

Give the shared detail workspace a reliable, title-scoped way to re-read metadata and artwork from Plex. Plex metadata refreshes currently do not notify CoWatcher, and CoWatcher intentionally reuses a non-fallback local catalog entry indefinitely. This block should expose the existing refresh capability through the detail UI, update the local revision, and reload the affected workspace without introducing an expensive automatic full-library refresh.

## Dependencies And Entry Gate

- Block 3-2n-6E-3A is implemented and verified, so repeated/session provenance is settled before this block changes shared detail behavior.
- The 6E canonical detail identity, shared workspace shell, category presenters, canonical artwork resolver, and revision-aware artwork proxy remain the source of truth.
- The existing `refresh-catalog` CLI path remains available and should be reused rather than duplicated.

## Scope

- Add one shared service operation for refreshing the canonical detail identity from Plex using the current rating key and optional exact GUID evidence.
- Expose a local, structured HTTP action for refreshing the currently displayed title/show/book; preserve safe error codes and never return Plex tokens or private upstream artwork URLs.
- Add an accessible **Refresh from Plex** control to the shared detail workspace with pending, success, and failure states.
- On success, invalidate the affected detail read/cache state and request a fresh workspace descriptor so the updated metadata and revisioned poster/backdrop URLs are used immediately.
- Keep the operation title-scoped for Movie, TV, Classic TV, Anime, verified Audiobook, and unverified Audiobook detail identities. Refreshing a TV detail should use the canonical show identity where the workspace represents a show.
- Preserve the existing CLI refresh command as an operator/debug fallback and keep its structured JSON output.

## Out Of Scope

- Automatic periodic metadata refreshes or Plex webhook-driven metadata invalidation.
- A whole-library `Refresh All Metadata` action from CoWatcher.
- Editing Plex artwork, uploading images, changing Plex agents, or selecting a different artwork source inside CoWatcher.
- Changes to replay semantics, audiobook transcription, resume workers, or resume modal presentation.
- Bypassing the canonical detail identity resolver with title matching or fuzzy lookup.

## Likely Files Or Areas

- `src/service/metadataService.ts`
- `src/service/dashboardService.ts` and `src/server/routes.ts`
- `src/service/artworkService.ts`
- `src/web/static/dashboard.js`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md` if a durable refresh invariant needs to be recorded

## Acceptance Criteria

- A user can open any supported shared detail workspace and activate **Refresh from Plex** without leaving the modal.
- A successful refresh re-reads the title/show/book from Plex, updates CoWatcher's local catalog timestamp/identity fields, produces a new artwork revision when the Plex artwork source changes, and displays the new poster/backdrop without a PM2 restart.
- The control shows an honest pending state, prevents duplicate concurrent refreshes for the same identity, and reports structured failure without blanking the existing workspace.
- Refreshing one item does not refresh unrelated catalog entries or trigger a whole-library scan.
- Movie, TV, Classic TV, Anime, verified Audiobook, and unverified Audiobook fixtures all use the same title-scoped action while preserving their existing category-specific detail and source-honesty rules.
- Legacy CLI `refresh-catalog` behavior remains compatible and returns privacy-safe structured JSON.
- Tokens, private Plex URLs, local file paths, raw upstream errors, and sensitive identifiers remain absent from browser markup, public responses, and user-facing errors.
- Regression coverage proves that a changed fixture metadata/artwork response becomes visible after the action, that an unchanged response remains stable, and that failed refreshes preserve the prior usable workspace.
- `npm run verify:block` passes before implementation status changes. After deployed rebuild/restart, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Focused service tests for title-scoped refresh, exact identity/GUID handling, request coalescing, revision changes, failure preservation, and privacy-safe errors.
- Dashboard regression coverage for the refresh control across the shared detail presenters and required viewport widths.
- Live smoke after restart confirms the workspace remains usable and the refreshed artwork appears after a controlled Plex metadata change.
