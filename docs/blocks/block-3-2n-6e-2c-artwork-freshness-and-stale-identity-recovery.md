# Block 3-2n-6E-2C: Canonical Artwork Freshness And Adoption

> Status: Implemented on 2026-07-14 through child blocks 6E-2C1 and 6E-2C2.
> Result: Implemented.
> Verification: Both children passed `npm run verify:block`; the rebuilt and restarted production dashboard passed `npm run verify:live-dashboard`. Live canaries for Movie `63449`, Audiobook `73`, and Classic TV series `65354` each returned aligned canonical poster aliases, opaque private revisions, valid image bytes, and working backdrops.
> Notes: Corrective parent after 3-2n-6E-2B. Visual presentation work remains separately scoped to 6E-2D.

## Goal

Establish one trustworthy private artwork contract across all Plex-backed media and every dashboard artwork consumer. A valid local Audiobook cover remains authoritative, stale Plex rating keys recover through stable GUID evidence, and a known source change becomes visible on the next dashboard reload without a restart or cache purge.

## Locked Decisions

- A valid non-empty `audiobook_books.cover_url` is the authoritative Audiobook poster. Plex sibling artwork is fallback only when the local source is absent, rejected, or unavailable.
- A source change observed by the application must appear on the next dashboard reload without PM2 restart, manual database repair, browser-cache clearing, or app-wide cache purge.
- One canonical resolver owns Movie, TV, Classic TV, Anime, Audiobook, and other existing Plex-backed artwork identities.
- Every current dashboard artwork consumer adopts the same canonical poster contract. Legacy `artworkUrl` remains an additive compatibility alias during migration.
- Artwork reads must not silently rewrite catalog identity or cover records.

## Child Blocks

1. `block-3-2n-6e-2c1-canonical-artwork-resolver-and-proxy-freshness.md`
2. `block-3-2n-6e-2c2-dashboard-wide-artwork-adoption-and-compatibility.md`

Implement the children in order. This parent is complete only after both children pass `npm run verify:block` and the deployed dashboard passes `npm run verify:live-dashboard`.

## Out Of Scope

- Hero brightness, focal positioning, height, or crop treatment; 6E-2D owns visual composition.
- Audiobook chapter read-through counts, Progress detail migration, or removal of `#progress-dialog`; 6E-2D and 6E-3 own those concerns.
- Generated artwork, new external artwork providers, persistent image/blob storage, background artwork refresh workers, database migrations, transcript/resume work, or a generic media CDN.

## Completion Criteria

- 6E-2C1 records a passing mandatory block gate for canonical identity recovery, source authority, private proxy freshness, bounded caching, fallback honesty, and proxy safety.
- 6E-2C2 records a passing mandatory block gate for dashboard-wide adoption, compatibility, cross-surface parity, and deterministic reload behavior.
- The separate live dashboard smoke passes after the deployed service is rebuilt or restarted.
