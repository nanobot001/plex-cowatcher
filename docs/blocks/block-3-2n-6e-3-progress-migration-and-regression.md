# Block 3-2n-6E-3: Progress Migration And Cross-Surface Regression

> Status: Planned.
> Result: Not implemented.
> Notes: Final child of 3-2n-6E. Move Progress onto the proven shared workspace, retire the duplicate dialog path, and lock universal detail parity before 6D-4 extends Audiobooks.

## Goal

Make Progress use the same canonical detail workspace as every other dashboard surface, remove the separate Progress modal implementation, and verify that entry context changes emphasis without changing geometry or data truth.

## Dependencies And Entry Gate

- 6E-1 canonical identity/read contract and 6E-2 shared shell/category presenters are implemented and verified.
- The pre-migration Progress regression suite is green, including lazy single-identity fetch, verified/unverified audiobook source honesty, URL restoration, Back/Forward, and watcher evidence.

## Scope

- Migrate Progress card detail opening to the 6E-1 canonical `detailKey` and 6E-2 shell/category presenters.
- Preserve Progress card expansion, roster/watcher controls, pagination, filters, cached selected-identity hierarchy, and first-paint bounds independently of opening detail.
- Use the current hash layout as entry context. Newly generated links write one canonical `detail` parameter; legacy `progressDetail` and `selected` parameters remain read-compatible and normalize safely without adding duplicate history entries.
- Let Progress emphasize progress/current-position sections initially, while Overview/Activity/Library may emphasize playback/general detail. Emphasis may set an initial section or accessible heading but cannot change shell geometry, source precedence, hierarchy placement, or available core sections.
- Remove `#progress-dialog` from server-rendered HTML after migration coverage passes. Remove `progressDialog`, `syncProgressDetailFromURL`, `openProgressDetail`, duplicated progress modal markup/CSS, duplicate close/focus handlers, and obsolete selectors without weakening unrelated Progress behavior.
- Update the dashboard regression contract: replace the temporary invariant that Progress is wider than a 680px shared baseline with a universal viewport-bounded detail workspace invariant.
- Add cross-surface parity coverage:
  - Open one canonical audiobook from Overview, Library, and Progress and compare core semantic fields.
  - Open one episodic fixture from a non-Progress surface and Progress and compare identity/hierarchy/source semantics.
  - Cover one Movie to prove no hierarchy is invented.
- Add compatibility coverage for direct/reloaded legacy URLs, canonical URLs, Back/Forward across layouts, stale keys, and closing to the correct originating card.
- Preserve bounded/lazy fetch behavior: opening one detail must not refetch page buckets, expand unrelated Progress cards, or render all page hierarchies.
- Make 6D-4 consume the shared Audiobook presenter and canonical detail projection; update its ticket/dependencies if implementation evidence changes the final extension seam.

## Out Of Scope

- Removing the legacy server read endpoints; they remain compatibility surfaces until a separate deprecation decision.
- Changing progress calculation, verified chapter activation, watcher evidence, hierarchy inference, filters, pagination, or card design.
- Adding 6D transcript/resume content, worker status, queue controls, mutations, or settings.
- Making every entry surface visually identical in page layout; only the opened detail workspace and underlying truth align.
- Broad screenshot baselines or pixel-perfect matching.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- deterministic dashboard fixtures
- `docs/testing/dashboard-regression-contract.md`
- `docs/blocks/block-3-2n-6d-4-audiobook-resume-modal.md`
- `docs/design/` or `docs/decisions/` only for durable route/detail ownership decisions

## Risks And Drift Controls

- **Progress regression:** Keep expansion and detail as separate actions/state; detail migration must not trigger page-bucket or unrelated-card fetches.
- **History loops:** Legacy normalization uses replace semantics and bounded parsing; tests cover reload and Back/Forward.
- **Focus loss:** Record the origin surface/card independently from the canonical identity and restore by stable selector when still mounted.
- **CSS residue:** Assert one visible dialog and search for retired IDs/functions/selectors before completion.
- **Contract drift:** Both Progress and non-Progress presenters consume the same canonical response; no Progress-only progress calculation remains in browser code.
- **Test explosion:** Use a pairwise matrix—one audiobook across all entry surfaces, all categories through one shared shell, and targeted legacy-route cases—rather than every category on every surface.
- **Reversibility:** Existing API endpoints remain; UI rollback is one bounded block without database rollback.

## Acceptance Criteria

- The rendered page contains one detail dialog and no `#progress-dialog`.
- Overview, Activity/Timeline, Library, and Progress all call the same renderer with the same canonical response type.
- The same audiobook opened from Overview, Library, and Progress shows identical title, artwork identity, visible people, plays, latest activity, verified progress source, completed/current/total values, and chapter hierarchy semantics.
- Progress may initially focus its progress section, but modal width, padding, columns, hierarchy placement, scroll ownership, close control, and responsive behavior match every other entry surface.
- TV, Classic TV, Anime, Movie, verified audiobook, and unverified audiobook behavior remains source-honest and category-correct.
- `progressDetail` and `selected` legacy URLs still restore the intended identity; canonical links use `detail`; stale/invalid combinations close or show bounded unavailable state without navigation loops.
- Opening/closing detail preserves Progress filters, pagination, expanded card state, cached hierarchy, page scroll, and originating-card focus where that card remains mounted.
- Opening one detail performs no unrelated hierarchy expansion, page-bucket refetch, external request, mutation, or full-history load.
- Source search and runtime assertions find no active duplicate Progress dialog renderer, CSS width override, close handler, or focus trap.
- The dashboard regression contract and tests no longer encode a 680px-versus-1180px modal divergence; they encode one viewport-bounded content-first workspace.
- At 320px through 1440px there is no horizontal overflow, nested competing scroll, clipped controls, excessive negative space, or page scroll behind the modal.
- `npm run verify:block` passes before implementation status changes.
- After deployed rebuild/restart, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- `rg -n "progress-dialog|openProgressDetail|syncProgressDetailFromURL" src/web tests/e2e` with only intentional historical/test migration references remaining
- Cross-surface Playwright parity journey for one audiobook plus targeted episodic/Movie category coverage
- Legacy/canonical URL, reload, Back/Forward, stale identity, focus restoration, fetch-count, one-scroll, and viewport assertions
- Read-only live smoke at Overview, Library, and Progress for the same audiobook
- `npm run verify:live-dashboard`

## Exit Handoff To 6D

Record the canonical Audiobook presenter extension point and detail response projection. 6D-4 must add resume context there and must not recreate a Progress-only modal, route, summary strip, or hierarchy renderer.
