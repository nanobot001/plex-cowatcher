# Block 3-6-2: Canonical Media Identity And Alias Registry

> Status: Planned.
> Result: Not implemented.
> Notes: Preserve archive identity after Plex rating-key churn, title edits, media replacement, or removal.

## Goal

Give every archived title a durable identity and retain historical aliases so watch evidence remains queryable after the current Plex library changes.

## Scope

- Store canonical identity plus exact Plex GUID, historical rating keys, media type, and safe title/year snapshots.
- Record identity transitions and resolution provenance without fuzzy joins.
- Update archive queries and detail joins to resolve old and current keys through exact identity evidence.
- Keep removed media and historical metadata queryable without requiring the item to remain in Plex.

## Out Of Scope

- Automatic title matching based only on names.
- External metadata enrichment as a prerequisite for preserving local history.
- Rewriting existing observations in place.

## Acceptance Criteria

- A Civil War-shaped stale-key/current-key fixture resolves to one canonical identity through exact GUID evidence.
- A removed Plex item remains visible in archive queries with its historical snapshot.
- Ambiguous or empty identity evidence remains unresolved and is reported explicitly.

## Verification

- `npm run verify:block`
- Identity migration, stale-key, removed-media, and ambiguity tests.

