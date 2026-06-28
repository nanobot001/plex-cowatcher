# Block 3-5: Proactive Audiobook Scanner & Webhook Trigger

> Status: Implemented on 2026-06-28.
> Result: Implemented.
> Verification: `npm test` and `npm run verify:tools` - passed.
> Notes: Implemented listLibraryTracks in Plex adapters, AudiobookScannerService, scan-audiobooks CLI command, and POST /webhooks/plex webhook endpoint with isolated test mock injection.

## Goal

Ensure your audiobook database remains completely up-to-date by proactively scanning the Plex "Audiobooks" library section and automatically indexing and enriching new books. This includes a new CLI command for manual/scheduled scans, and a webhook endpoint to trigger scans automatically when Plex updates.

## Scope

- Add a new method in `PlexAdapter` to scan/list all tracks in a given library section.
- Implement an `AudiobookScannerService` that queries Plex for all tracks in your Audiobooks library, parses their metadata and file paths, upserts them into `audiobook_books` using the normalizer engine, and triggers enrichment.
- Add a new CLI subcommand `scan-audiobooks` to run the scan manually or via cron.
- Register a webhook handler endpoint `/webhooks/plex` to receive Plex Webhook events (specifically `library.update` or `library.refresh` for the Audiobooks section) and trigger an async scan.
- Add regression coverage and unit tests for scanning and webhook parsing.

## Out Of Scope

- Scanning movies or TV shows proactively.
- Complex dashboard UI for scan status (logging to CLI/database audit logs is sufficient).
- Custom scheduling engine (we rely on PM2, system cron, or task scheduler to trigger the CLI).

## Likely Files Or Areas

- `src/adapters/plexAdapter.ts`
- `src/service/audiobookService.ts`
- `src/service/audiobookScannerService.ts` [NEW]
- `src/server/app.ts`
- `src/cli/cli.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Running `node dist/cli/cli.js scan-audiobooks --library "Audiobooks"` successfully scans the Plex library, populates the database with new audiobooks, and initiates enrichment.
- The webhook endpoint POST `/webhooks/plex` parses Plex webhooks and asynchronously triggers a library scan when a scan completion event is received for the Audiobooks section.
- The scanner runs transactionally, respects the metadata-mapping-pattern precedence, and does not leak private file paths in public outputs.
- All unit tests for the scanner and webhook receiver pass successfully.

## Verification

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Running a manual scan using the CLI and confirming new audiobooks in the database are indexed and enriched.
