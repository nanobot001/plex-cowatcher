# Block 3-2n-6E: Universal Detail Workspace Alignment

> Status: Planned.
> Result: Not implemented.
> Notes: Umbrella only; do not implement directly. Restore the original shared-detail contract before adding 6D resume UI by splitting canonical identity/read contracts, the shared shell, and final Progress migration into three children.

## Child Block Sequence

1. `block-3-2n-6e-1-canonical-detail-contract-and-entry-resolution.md`
2. `block-3-2n-6e-2-shared-detail-shell-and-category-presenters.md`
3. `block-3-2n-6e-3-progress-migration-and-regression.md`

Implement the children in order. The umbrella is complete only after every child passes its own mandatory block gate.

## Goal

Make every dashboard entry point open one canonical, responsive detail workspace for the same media identity. Overview, Activity, Library, Progress, and any other existing detail caller may emphasize different sections, but they must not maintain separate modal geometry, routing, progress authority, hierarchy placement, or accessibility behavior.

## Locked Product And Architecture Decisions

- The final browser DOM contains one physical detail dialog, `#detail-dialog`; `#progress-dialog` is retired in 6E-3.
- A shared shell owns geometry, spacing, scrolling, focus, close behavior, route restoration, artwork placement, and responsive behavior.
- Category presenters own bounded Movie, TV, Classic TV, Anime, and Audiobook content. Entry surfaces do not own category-specific modal implementations.
- One typed canonical `detailKey` identifies a Movie, top-level episodic series, or canonical audiobook independently of the card or playback row used to open it.
- A new additive localhost read endpoint serves the canonical workspace contract. Existing `/api/dashboard/detail/:ratingKey` and `/api/dashboard/progress/expand/:groupKey` behavior remains compatible during the sequence.
- Canonical detail first paint stays bounded. Hierarchy is lazy and limited to the selected identity; unbounded history or every hierarchy in the page is never prefetched.
- Verified audiobook chapter evidence outranks Plex track/file fallback. Unknown values remain unknown.
- Desktop hierarchy remains in the left/reference column. The inner workspace has one intended vertical scroller; the outer dialog and page do not compete for scroll.
- No schema migration, write action, Plex mutation, Tautulli mutation, worker change, transcript processing, or new published `project.*` tool is part of 6E.

## Scope

- Deliver 6E-1 through 6E-3 in order.
- Preserve all current dashboard categories, filters, pagination, lazy hierarchy behavior, participant visibility, evidence semantics, and source honesty.
- Preserve legacy detail URLs through explicit compatibility parsing while moving newly generated links to one canonical `detail` parameter.
- Record the pre-implementation findings and resolved ambiguities in `docs/process/block-3-2n-6e-design-review.md`.
- Make 6E-3 a prerequisite for 6D-4 so resume context has one audiobook presenter to extend.

## Out Of Scope

- Implementing this umbrella directly.
- Redesigning cards, navigation, filters, page layouts, progress math, hierarchy inference, or playback evidence.
- A generic plugin/component framework, client-side router replacement, tab system, design-system rewrite, or frontend framework migration.
- Removing legacy read endpoints in the same sequence.
- Adding 6D transcription, resume persistence, worker controls, or resume excerpt content.

## Dependencies

- Block 3-2n-6C is implemented and provides the visible divergence that this sequence corrects.
- The 3-2k shared-detail vocabulary, 3-2n Progress contracts, current hidden-user rules, and dashboard regression contract remain authoritative unless a 6E child explicitly replaces one conflicting invariant.
- Block 3-2n-5D-3 must finish its explicit recurring-worker rollout gate before the next corrective implementation block begins.

## Umbrella Acceptance Criteria

- All dashboard detail entry points resolve to one canonical detail identity and one physical dialog.
- The same title opened from different surfaces exposes the same category, artwork identity, participant set, progress source, progress values, hierarchy semantics, and core metadata.
- Entry context may alter initial emphasis or heading copy but cannot alter the modal shell or data truth.
- Movie, TV, Classic TV, Anime, and Audiobook presenters remain source-honest and accessible.
- Legacy `selected` and `progressDetail` links restore safely; new navigation writes the canonical `detail` parameter without corrupting filters or browser history.
- First paint and hierarchy loading stay bounded, with no eager cross-card or cross-hierarchy fetch.
- At 320px, 390px, 768px, 1024px, and 1440px there is no horizontal overflow, excessive empty space, duplicate nested scroll, clipped close control, or page-level scrolling behind the modal.
- Hidden people, private paths, adapter details, secrets, and unbounded raw errors never enter the canonical public-read response.
- Every child passes `npm run verify:block`; deployed dashboard changes also pass `npm run verify:live-dashboard`.

## Review Authority

Use `docs/process/block-3-2n-6e-design-review.md` as the pre-implementation authority. If implementation discovers an unmapped detail caller, unstable identity, required write/state change, or unavoidable contract break, stop the active child and update the ticket/review rather than broadening scope silently.
