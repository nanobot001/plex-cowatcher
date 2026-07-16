# Block 3-2n-6E-2C1: Canonical Artwork Resolver And Proxy Freshness

> Status: Implemented on 2026-07-14.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (107/107 service/integration tests, 43/44 dashboard regression tests with the intentional narrow duplicate-project skip, dashboard syntax, and tool-contract verification).
> Notes: Added one read-only canonical artwork resolver with authoritative local Audiobook covers, GUID-backed Plex recovery, stable-ID-only sibling fallback, opaque source revisions, bounded/coalesced caching, private proxy responses, and bounded source validation. A latent hash-only viewport-test navigation race was corrected by reloading each canonical URL before geometry assertions.

## Goal

Create one read-only artwork resolver for every existing Plex-backed media type. It must preserve authoritative local Audiobook covers, recover stale Plex identities through stored GUID relationships, keep poster and backdrop semantics distinct, and proxy only validated image sources with deterministic revision and cache behavior.

## Dependencies And Entry Gate

- 6E-2A poster/backdrop variants and the private `/api/artwork` route are implemented and verified.
- `content_catalog`, hierarchy GUID fields, playback observations, and Audiobook catalog relationships provide the stable identity evidence available to the resolver.
- No database migration or dependency change is required.

## Definitions And Source Order

- A canonical artwork identity is the media family plus the applicable title, parent, or grandparent rating key and GUID, with `audiobook_id` when relevant.
- For an Audiobook poster, a valid non-empty local `cover_url` wins. If it is missing, rejected, or unavailable, the resolver may use a Plex sibling linked through stable Audiobook/catalog evidence.
- For Plex artwork, try the stored rating key and recover a missing/stale key through the matching stored GUID. Validate that recovery remains within the expected media identity/family.
- Title-only matching must never select a sibling or repair an identity. Ambiguous or unsupported recovery remains honestly missing.
- Poster variants use `thumb`, `parentThumb`, or `grandparentThumb`. Backdrop variants use only genuine `art`, `parentArt`, or `grandparentArt`; portrait artwork is never stretched into a backdrop.
- A known source revision is the current source identity observed by the resolver. An external provider changing bytes behind an unchanged URL is outside the immediate-refresh guarantee unless upstream revalidation exposes that change.

## Scope

- Add a shared resolver that selects canonical identity, source, variant, revision, and a redacted resolution outcome without mutating catalog rows.
- Pass the applicable stored GUID into Plex rich-metadata resolution so stale rating keys can recover for Movie and hierarchical TV-family artwork.
- Replace title-only Audiobook sibling selection with stable `audiobook_id`, catalog, observation relationship, or GUID evidence.
- Make unversioned private proxy URLs revalidate or resolve to an opaque current revision; changed known sources must not remain trapped behind the existing process cache or one-week immutable URL.
- Bound positive and negative source caching by size and TTL, key it by canonical identity, variant, and revision, and coalesce concurrent resolution for the same key.
- Preserve raw Plex/provider URLs, tokens, credentials, and private paths exclusively inside the server process.
- Validate proxied source schemes and destinations, re-check redirects, require an image content type, enforce timeout and response-size limits, and return bounded 404/502 failures without source details.
- Add focused deterministic tests for local-cover authority and change, stale GUID recovery, hierarchical identity, honest missing art, variant separation, cache revision, concurrency, and proxy privacy/safety.

## Out Of Scope

- Migrating browser/dashboard consumers; 6E-2C2 owns adoption.
- Changing detail hero brightness, dimensions, crop, or focal treatment.
- Writing repaired rating keys or artwork sources back to SQLite.
- New providers, generated art, persistent image storage, background workers, database migrations, or generic CDN infrastructure.

## Likely Files Or Areas

- `src/server/routes.ts`
- `src/adapters/plexAdapter.ts`
- `src/service/dashboardService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`
- existing Plex and dashboard test mocks

## Acceptance Criteria

- A stale Plex rating key with the applicable stored GUID resolves the active item and returns a current poster and, when genuine landscape art exists, a backdrop.
- Movie and at least one TV-family parent/grandparent fixture prove that the resolver sends the correct rating-key/GUID pair and never cross-binds media by title.
- A valid local Audiobook `cover_url` wins over Plex. Changing that source while the same server process remains running produces a new opaque revision on the next request/reload.
- Missing, rejected, or unavailable local Audiobook art falls back only through stable linked Plex evidence; absent or ambiguous evidence remains missing.
- Unchanged sources retain a stable revision. Changed known sources produce a new revision without PM2 restart or app-wide cache purge.
- Positive/negative caches are bounded and deterministic, and concurrent identical misses perform one resolver operation.
- Dashboard-facing responses, redirects, headers, errors, and structured logs expose no upstream URL, token, credential, or private path.
- Unsafe destinations, redirect loops, non-image payloads, excessive bodies, timeouts, and upstream failures return bounded documented failures.
- `npm run verify:block` passes before the block is marked implemented.

## Verification

- Focused service/integration tests that mutate an Audiobook source without restarting the app.
- Focused MockPlexAdapter assertions for stale Movie and TV-family rating-key/GUID recovery.
- Focused proxy safety, privacy, cache-bound, revision, and concurrency tests.
- `npm run verify:block`
