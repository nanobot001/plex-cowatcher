# Block 3-6-5: Archive Query, Export, And Backup

> Status: Planned.
> Result: Not implemented.
> Notes: Make the historical archive useful outside the dashboard and resilient as a long-term personal record.

## Goal

Provide stable, source-aware archive queries and portable backups so the memory of what was seen is inspectable and recoverable independent of Plex availability.

## Scope

- Add bounded CLI/HTTP queries for person, title, date, source, confidence, media type, and evidence status.
- Add privacy-safe JSON/CSV export with canonical identity and provenance fields.
- Add verified SQLite backup and restore procedures with schema/version checks.
- Document retention, export, backup, and restore operations for the Windows/PM2 runtime.

## Out Of Scope

- Public hosting or cloud synchronization.
- Natural-language recommendations.
- Achievement rules beyond exposing archive data.

## Acceptance Criteria

- An exported archive remains interpretable when the corresponding Plex item is deleted or renamed.
- Exported records distinguish Tautulli event time, Plex last-view time, and ingestion time.
- Backup/restore preserves identity aliases, source evidence, audit state, and achievement inputs.
- Public-read outputs contain no tokens, private paths, or upstream private URLs.

## Verification

- `npm run verify:block`
- Export schema, privacy, backup, restore, and round-trip tests.

