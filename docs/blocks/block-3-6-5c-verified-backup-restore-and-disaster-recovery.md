# Block 3-6-5C: Verified Backup, Restore, And Disaster Recovery

> Status: Planned.
> Result: Not implemented.
> Dependency: Blocks 3-6-5A and 3-6-5B implemented and verified.

## Goal

Prove that the complete archive database can be backed up and restored into an isolated destination without claiming recoverability from an untested file copy.

## Scope

- Use SQLite-safe backup mechanics with schema/application version metadata, integrity checks, hashes, and a manifest.
- Restore only into an explicit isolated destination by default; never overwrite the live database during deterministic verification.
- Verify migrations/version compatibility, archive tables, identities/aliases, observations, links, decisions, audit state, and future achievement inputs.
- Compare row counts, integrity, hashes where meaningful, and representative 3-6-5A queries before and after restore.
- Document Windows/PM2 quiescence, backup, restore, rollback, retention responsibilities, and failure recovery.
- Expose destructive/live restore only behind dry-run, explicit target, confirmation, and separate authorization.

## Out Of Scope

- Cloud synchronization, automatic deletion/retention, media-file backup, public download, or routine service restart redesign.

## Likely Files Or Areas

- focused database backup/restore service and CLI/tool operations
- SQLite database/version helpers
- `docs/production/` recovery procedures
- isolated restore fixtures and tests

## Acceptance Criteria

- A fixture/current-copy backup has a versioned manifest and passes integrity verification.
- Isolated restore reproduces required schema/state and representative queries without touching the live database.
- Corrupt, incomplete, incompatible, wrong-target, and already-existing-target cases fail closed.
- Tool/log/event outputs do not expose private paths beyond explicitly operator-approved local output.
- `npm run verify:block` passes.
- Any live restore drill is separately authorized and reports recovery/rollback evidence distinctly.

## Verification

- `npm run verify:block`
- Isolated backup/restore round-trip, corruption, compatibility, wrong-target, privacy, and interruption tests
- Optional separately authorized operator restore drill
