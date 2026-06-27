# Block 2-2: Content Metadata Catalog

> Status: Implemented on 2026-06-27.
> Result: Implemented.
> Verification: `npm test` - passed.
> Notes: Implemented content_catalog table, getRichMetadataByRatingKey in PlexAdapter, and MetadataService with infinite caching and Smart Auto-Healing.

## Goal

Maintain a local, refreshable content catalog so history can be queried by exact movie, episode, season, show, media type, and genre without scanning Plex for every caller.

## Scope

- Normalize stable movie, show, season, and episode identities using Plex GUIDs and rating keys with documented fallbacks.
- Store media type, show hierarchy, genres, library identity, and known duration.
- Store known available episode counts with refresh time and source provenance.
- Enrich evidence through a shared metadata service with bounded caching and structured failures.
- Provide an idempotent explicit refresh path that never changes Plex watched state.

## Out Of Scope

- Fuzzy matching across renamed libraries, multi-server reconciliation, public history queries, and unbounded full-library scans.

## Likely Files Or Areas

- `src/adapters/plexAdapter.ts`
- `src/service/`
- `src/db/`
- `src/types/`
- `tests/`
- `docs/data/`

## Acceptance Criteria

- Playback evidence resolves to stable content and parent-show records.
- Service code can filter by media type and genre and identify exact shows without title-only matching.
- Metadata exposes source and refresh time; unavailable values remain unknown.
- Show denominators distinguish available episodes from observed watched episodes.
- Refresh is bounded, idempotent, secret-safe, and tested.

## Verification

- `npm run build`
- `npm test`
- Manual: refresh one movie and one show and verify identity, genre, hierarchy, and episode count.