# Block 3-6-5A: Versioned Archive Query Contract

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-6-1 closure and existing archive identity/recovery blocks.

## Goal

Expose bounded, versioned archive reads that preserve identity, provenance, uncertainty, and removed-media history.

## Scope

- Define one structured query contract for person, canonical media, date range, media type, source, confidence, and evidence status.
- Use pagination, stable ordering, explicit bounds, and source-honest timestamps.
- Resolve historical aliases through existing exact archive identity evidence while retaining unresolved rows.
- Add read-only CLI/tool and localhost HTTP access only where consistent with current permissions.
- Keep public/read-safe fields free of private paths, tokens, upstream URLs, and raw payloads.

## Out Of Scope

- Export files, backup/restore, fuzzy matching, archive writes, report generation, or achievements.

## Likely Files Or Areas

- archive query service/types and existing archive database methods
- localhost routes and `src/cli/cli.ts`
- tool manifest/surface/permissions
- query fixtures and service tests

## Acceptance Criteria

- Versioned fixtures return stable pagination and equivalent filtering across supported adapters.
- Removed/renamed media remains queryable; unresolved evidence remains explicit.
- Event, ingestion, last-view, and inferred dates are not conflated.
- Bounds and permissions prevent unbounded/private reads.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Query, pagination, alias, removed-media, unresolved, timestamp, privacy, and compatibility tests
