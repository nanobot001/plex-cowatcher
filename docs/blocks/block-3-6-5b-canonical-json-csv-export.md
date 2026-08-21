# Block 3-6-5B: Canonical JSON/CSV Export

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-6-5A implemented and verified.

## Goal

Export portable archive records whose meaning remains clear without live Plex or this application's database.

## Scope

- Define versioned canonical JSON and CSV schemas over the 3-6-5A query contract.
- Include canonical identity, safe historical snapshots, source/provenance, evidence status, and separately labeled timestamps.
- Stream bounded exports with deterministic ordering, escaping, newline/encoding rules, and explicit truncation/error behavior.
- Provide preview/dry-run metadata before file creation and explicit target handling consistent with current permissions.
- Document schema versions and compatibility expectations.

## Out Of Scope

- Backup format, restore, cloud upload, spreadsheet styling, report prose, or achievement outputs.

## Likely Files Or Areas

- focused archive export service/types
- CLI/tool preview and confirmed file-output boundary
- export schema documentation
- streaming/round-trip/privacy tests

## Acceptance Criteria

- JSON/CSV round-trip fixtures retain identity, aliases needed for interpretation, provenance, uncertainty, and timestamp meaning.
- Deleted/renamed Plex items remain interpretable from exported safe snapshots.
- CSV injection-like values and delimiters/newlines are escaped safely.
- Export remains bounded and contains no token, private media path, upstream URL, or raw source payload.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Schema snapshot, streaming/bounds, encoding, CSV safety, privacy, removed-media, and compatibility tests
