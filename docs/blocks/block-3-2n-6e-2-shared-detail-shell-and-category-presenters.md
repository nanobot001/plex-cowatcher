# Block 3-2n-6E-2: Shared Detail Shell And Category Presenters

> Status: Planned.
> Result: Not implemented.
> Notes: Second child of 3-2n-6E. Build the canonical shell on the 6E-1 contract and migrate existing non-Progress detail callers while leaving Progress retirement to 6E-3.

## Goal

Give Overview, Activity/Timeline, Library, and every current non-Progress detail caller one accessible, content-first modal shell with category-specific presenters, without changing the Progress modal yet.

## Dependencies And Entry Gate

- 6E-1 is implemented, verified, and records the final canonical `detailKey` and workspace response contract.
- Existing detail focus restoration, URL restoration, evidence semantics, aliases, hidden-user filtering, and lazy hierarchy tests are green before changes begin.

## Scope

- Refactor `#detail-dialog` into the single canonical shell that 6E-3 will also use. The shell owns close control, heading association, focus trap/restoration, loading/error/empty states, geometry, padding, artwork/reference placement, and responsive behavior.
- Consume only the 6E-1 workspace contract in new renderer code. Do not derive category or progress truth from card dataset payloads beyond optimistic title/artwork placeholders.
- Add small explicit presenters for Movie, TV, Classic TV, Anime, and Audiobook content. Share primitives for common metadata, people, progress, playback evidence, hierarchy nodes, and source labels; do not build a generic plugin framework.
- Migrate all current non-Progress callers to resolve and fetch by canonical `detailKey`: Overview recent playback, Activity/Timeline detail rows, Library cards, and any additional caller found by the 6E-1 inventory.
- Preserve entry-page filters, pagination, scroll position, selected-card indication, Back/Forward, reload, direct links, and focus restoration.
- Use one internal `.detail-workspace-scroll` region. The dialog/page must not scroll behind or compete with it. On desktop, use proportional columns with a sticky artwork/reference area and hierarchy in the left column; on narrow screens, use one column.
- Keep the shell content-first with `max-height`, not a fixed height. Use 16-24px modal/card padding, at least 8px separation, thin scrollbars, `min-width: 0`, and truncation for constrained text.
- Lazy-load only the selected identity's hierarchy after the base shell is interactive. Loading/error in hierarchy or playback evidence must not blank the whole dialog.
- Keep long TV/audiobook hierarchies bounded or collapsed by default where needed to preserve one-scroller usability; do not reintroduce an unbounded first-paint wall.
- Add stable shared selectors/ARIA labels that 6E-3 and 6D-4 can extend without depending on incidental DOM nesting.
- Extend deterministic dashboard regression coverage for common shell geometry, keyboard close/focus restoration, partial failures, all five category presenters, and non-Progress entry parity.

## Out Of Scope

- Migrating Progress, deleting `#progress-dialog`, or changing the `progressDetail` URL compatibility path; those belong to 6E-3.
- Adding resume excerpts, Whisper status, 6D state, transcript controls, or audiobook generation UI.
- Redesigning page cards, navigation, filters, chronology, progress calculations, hierarchy inference, or playback evidence labels.
- A tab system, draggable/resizable modal, frontend framework, generic component registry, or pixel-perfect snapshot suite.
- Removing legacy API routes.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- deterministic dashboard fixtures
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/` only if durable shared-detail vocabulary changes

## Risks And Drift Controls

- **Partial migration:** The 6E-1 inventory is the checklist; every non-Progress caller receives a semantic test.
- **Card-data drift:** Dataset content is optimistic only; final rendered truth comes from the canonical response.
- **Presenter duplication:** Common shell and primitives are shared, but explicit category presenters remain readable and testable.
- **Scroll regression:** One internal scroll owner is asserted at desktop and narrow widths; the body and outer dialog stay stable.
- **Hierarchy placement:** Hierarchy stays in the left/reference column on desktop per project standards, with bounded disclosure instead of a second dominant scroll pane.
- **Accessibility:** The shell has one labelled heading, predictable initial focus, Escape/close behavior, and restoration to the originating control.
- **Reversibility:** The Progress modal remains untouched until the new shell is proven; 6E-2 can be reverted without contract or database rollback.

## Acceptance Criteria

- Overview, Activity/Timeline, Library, and every inventoried non-Progress caller open `#detail-dialog` using the same canonical workspace response and shell.
- The same fixture title opened from at least two non-Progress surfaces produces identical core title, category, artwork, people, progress/source, and hierarchy semantics.
- Movie, TV, Classic TV, Anime, and Audiobook presenters render category-appropriate content without invented hierarchy or progress.
- Card dataset changes cannot override final source, people, progress, or hierarchy values after the canonical response arrives.
- Base content becomes interactive before selected hierarchy content is rendered; hierarchy/evidence failures remain section-local and retry-safe or honestly unavailable.
- Desktop uses proportional columns, hierarchy in the left/reference column, sticky artwork/reference behavior, and one intended internal scroller.
- At 320px, 390px, 768px, 1024px, and 1440px the shell has balanced padding, no horizontal overflow, no clipped close control, no page scroll behind the modal, and no empty area exceeding 25% for short fixture content.
- Keyboard users can open, traverse, close with Escape/button, and return focus to the originating card after reload-safe and in-session journeys.
- Existing evidence labels, hidden-user exclusion, aliases, lazy loading, Back/Forward, filters, pagination, and non-Progress direct-link behavior remain compatible.
- `npm run verify:block` passes before implementation status changes.
- After deployed rebuild/restart, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Desktop and narrow Playwright coverage in `tests/e2e/dashboard-regression.spec.mjs` for all category presenters and at least two non-Progress entry surfaces
- Semantic geometry checks for one internal scroll owner, no horizontal/page overflow, sticky reference content, and content-first short/long fixtures
- Keyboard, Back/Forward, reload, stale identity, partial-response, and focus-restoration journeys
- `npm run verify:live-dashboard`

## Exit Handoff To 6E-3

Record the shared shell selectors, renderer entry point, category presenter interface, and scroll/focus contract. Progress must reuse these exactly rather than copying the markup or CSS.
