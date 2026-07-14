# Block 3-2n-6E-1: Canonical Detail Contract And Entry Resolution

> Status: Implemented on 2026-07-13.
> Result: Implemented with limitations.
> Verification: `npm run verify:block` - passed (104 service/integration tests, 36 dashboard regression tests, tool-contract verification).
> Notes: Added typed canonical identity resolution, bounded workspace and lazy hierarchy read routes, raw/Progress selector parity fixtures, privacy-safe absence handling, and the additive localhost tool-surface contract. Visible modal callers remain unchanged for 6E-2/6E-3; the base people summary is bounded to the existing detail activity sample until shared presenters consume the contract.

## Goal

Make every existing detail-opening selector resolve to one stable media identity and one source-honest workspace response, while preserving current endpoints and visible UI unchanged.

## Dependencies And Entry Gate

- Block 3-2n-5D-3 recurring-worker rollout is explicitly resolved.
- Block 3-2n-6C remains the deployed baseline.
- Read `docs/tool-adapter-memory.md`, `docs/tool-surface.md`, `docs/tool-manifest.yaml`, `docs/permissions.md`, and `docs/event-log-schema.md` before changing the localhost route contract.

## Scope

- Inventory and fixture-test every current caller of `openDetail`, `openProgressDetail`, `#detail-dialog`, and `#progress-dialog`, including Overview recent playback, Activity/Timeline rows that open detail, Library cards, and Progress cards.
- Define a typed discriminated `DashboardDetailIdentity` with a canonical, public-safe serialized `detailKey` grammar:
  - Movie: `movie:<ratingKey>`.
  - TV, Classic TV, or Anime: `series:<category>:<grandparentRatingKey>`.
  - Audiobook: `audiobook:<audiobookId>`, never a private path or author/album surrogate.
  - Dynamic values are validated and the complete key is URL-encoded when used as a route parameter; display titles and library labels are never key segments.
- Add one resolver that accepts current raw rating keys and Progress group keys, maps child episode/track observations to the correct top-level identity, and returns a structured not-found/ambiguous result without guessing.
- Define a typed `DashboardDetailWorkspaceResponse` containing bounded common identity, title/subtitle, category, artwork, visible people, playback summary, progress summary/source, hierarchy capability, and timing metadata.
- Keep category hierarchy children lazy. Add exact additive localhost public-read routes `/api/dashboard/detail-workspace/:detailKey` for the bounded base response and `/api/dashboard/detail-workspace/:detailKey/hierarchy` for the selected identity's category-discriminated hierarchy. The browser must not choose a different hierarchy endpoint by entry surface.
- Preserve `/api/dashboard/detail/:ratingKey` and `/api/dashboard/progress/expand/:groupKey` response compatibility. Reuse service helpers rather than making one endpoint call another over HTTP.
- Lock source precedence: verified audiobook chapters and revision-valid chapter positions outrank Plex track/file fallback; explicit observed/confirmed/inferred evidence remains distinct; unknown totals and values remain null/unknown.
- Keep response arrays bounded and deterministic. Include only visible dashboard people after aliases and hidden-user exclusion.
- Add service/HTTP fixtures proving that different current selectors for the same Movie, series, and audiobook resolve to the same `detailKey` and common core values.
- Update `docs/tool-surface.md` only for the additive localhost dashboard read route; do not create a new published `project.*` tool.

## Out Of Scope

- Changing the DOM, CSS, visible modal layout, URL parameters, focus behavior, or current browser fetch path.
- Removing, renaming, or weakening existing detail/progress endpoints.
- Loading full playback history, all dashboard hierarchies, or hierarchy children on initial detail response.
- Database migrations, persisted aliases, writes, audits, workers, transcription, resume results, or adapter execution.
- Solving cross-server Plex identity, metadata merging, or every possible future media category.

## Likely Files Or Areas

- `src/types/api.ts`
- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `tests/run-tests.mjs`
- deterministic dashboard fixture builder/database
- `docs/tool-surface.md`
- `docs/testing/dashboard-regression-contract.md` only if a durable API invariant must be recorded now

## Risks And Drift Controls

- **Identity collision:** Do not use display titles, author names, or unescaped library labels as identity. Test repeated titles and punctuation.
- **Contract bloat:** Base response is summary-only and bounded; hierarchy remains lazy and selected-identity-only.
- **Competing truth:** Centralize progress/source mapping and test parity rather than copying calculations from `getDetail` and `getProgressExpansion`.
- **Compatibility:** Existing routes and response fields remain unchanged; the new route is additive.
- **Privacy:** Public-read output excludes paths, raw adapter payloads, hidden listeners, secrets, Discord identifiers, and unbounded errors.
- **Overengineering:** Use discriminated TypeScript types and service functions, not a schema framework, plugin registry, GraphQL layer, or client router.

## Acceptance Criteria

- A raw movie rating key and its Progress group key resolve to one movie `detailKey`.
- Episode/card selectors for the same TV, Classic TV, or Anime title resolve to one top-level series `detailKey` without merging categories.
- Audiobook track/parent rating keys and its Progress group key resolve to one canonical audiobook `detailKey` based on `audiobookId`.
- Duplicate titles in different identities never merge; malformed, stale, hidden-only, ambiguous, and unsupported selectors return bounded structured absence without guessing or leaking query details.
- Canonical responses agree on title, category, artwork identity, visible people, progress source, completed/current/total values, and timing regardless of entry selector.
- Verified and unverified audiobook fixtures preserve their distinct chapter-versus-track/file semantics.
- Initial response does not include unbounded session history or all hierarchy children, and resolving one identity does not query/fetch unrelated identities.
- Existing detail and Progress endpoint golden/HTTP tests remain unchanged and pass.
- No database row, audit event, external adapter, Plex state, or Tautulli state is mutated by the new reads.
- `npm run verify:block` passes before implementation status changes.

## Verification

- `npm run verify:block`
- Focused service tests for canonical identity, collisions, child-to-parent mapping, stale selectors, aliases/hidden users, progress precedence, and bounds
- HTTP tests for the additive workspace route, structured not-found behavior, timing metadata, and legacy endpoint compatibility
- Query/count assertion or equivalent fixture proof that base detail resolution does not eagerly load unrelated hierarchies

## Exit Handoff To 6E-2

Record the final `detailKey` grammar, response type, route, bounds, and compatibility behavior in this ticket's implementation notes. 6E-2 must consume that contract and must not introduce a second browser-only identity mapping.
