# Block 3-2n-6: Progress Evidence Map Polish

> Status: Planned.
> Result: Not implemented.
> Notes: Sixth child of the 3-2n Progress sequence; turns the corrected lazy hierarchy data into a smooth, compact, readable Progress experience.

## Goal

Make the Progress workspace feel polished, scannable, and easy to read by replacing bulky hierarchy rows and chunky labels with a compact lazy evidence map for TV, Classic TV, Anime, and Audiobooks. This block should restore the useful "dots" affordance inside the expanded card without bringing back the slow all-dot first paint.

## Dependencies And Entry Gate

- Block 3-2n-5 is implemented and verified.
- Audiobook Progress contract exposes honest chapter totals, unknown totals, partials, repeats, and canonical book context.
- The single URL-restorable expanded-card model from 3-2n-4 remains the interaction baseline.

## Scope

- Redesign expanded Progress hierarchy presentation into compact, readable evidence maps:
  - TV, Classic TV, Anime: show -> season rows -> episode dots.
  - Audiobooks: book/series context -> chapter rows or chapter dot strips.
- Replace chunky state labels with small accessible dots or chips for watched, partial, repeated, and unknown states.
- Add a compact legend that explains states without overwhelming the card.
- Improve Progress card typography, spacing, hierarchy, contrast, and button labels so the expanded state is readable at a glance.
- Keep expansion lazy: first paint remains summary-only, and only the expanded card renders its evidence map.
- Preserve cached expansion responses, single expanded card behavior, URL restoration, Back/Forward, filters, offsets, and explicit detail drill-through.
- Make pointer and keyboard interaction feel smooth: no whole-screen reload, no layout jump, no accidental detail open from the expansion control, and no horizontal overflow.
- Extend deterministic Playwright coverage for the visual/semantic contracts using stable `data-testid` and ARIA labels rather than screenshot-only or CSS-class-only assertions.

## Out Of Scope

- Changing backend progress math beyond narrow fixes needed to consume the 3-2n-5 contract.
- Broad dashboard redesign outside the Progress workspace.
- Rendering all Progress hierarchies or dot maps on initial page load.
- Adding a new Progress-only detail modal.
- Pixel-perfect screenshot freezing, new recommendation/reporting features, Plex mutations, ratings, goals, or collection editing.
- Inventing a Movie hierarchy; Movies remain non-expandable and detail-only.

## Risk And Mitigation Plan

- Risk: restoring dots could recreate the old slow all-dot-grid Progress view.
- Mitigation: render dots only inside the single expanded card, assert first-paint DOM bounds, and assert expansion request isolation.
- Risk: dots could become pretty but inaccessible.
- Mitigation: every dot or compact state marker needs an accessible name that includes item identity and watched/partial/repeated/unknown state.
- Risk: compact visuals could make repeated, partial, and unknown evidence ambiguous.
- Mitigation: use distinct shapes, labels, or ARIA descriptions, and include a small legend backed by tests.
- Risk: polish could drift into unrelated dashboard redesign.
- Mitigation: limit changes to Progress cards, hierarchy slots, responsive behavior, and contract docs.

## Drift Controls

- Do not weaken unknown-total semantics or hide missing audiobook catalog data.
- Do not change the single expanded-card route model.
- Do not make card expansion bubble into the detail-open handler.
- Do not use CSS-only assertions as the durable regression contract.
- Do not defer this readability gap into 3-2o; 3-2o should verify the finished Progress outcome.

## Dependency Plan

- Consume the 3-2n-5 audiobook contract as the source of truth for chapter totals and states.
- Reuse existing `progress-expand-toggle`, `progress-hierarchy`, `progress-season`, `progress-episode`, and `progress-chapter` selectors, adding only stable selectors needed for the evidence map such as `progress-evidence-map`, `progress-evidence-dot`, and `progress-state-legend`.
- Update `docs/testing/dashboard-regression-contract.md` with durable Progress readability invariants before or alongside Playwright assertions.

## Opportunities To Use

- Preserve the performance win from lazy expansion while recovering the glanceable dot language users expected.
- Reuse the shared detail workspace for explicit drill-through instead of overloading every dot click.
- Make the Progress page the design reference for compact evidence states before the final 3-2o accessibility gate.

## Likely Files Or Areas

- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/e2e/fixture-server.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Expanded TV, Classic TV, and Anime cards show compact season evidence rows with episode dots for watched, partial, repeated, and unknown states.
- Expanded Audiobook cards show compact chapter progress using the 3-2n-5 contract, including known-total and unknown-total cases.
- Dot/state markers have accessible names and are explained by a compact legend.
- Progress card labels, typography, spacing, and hierarchy are readable on desktop and narrow viewports without chunky button clutter.
- Expanding, collapsing, Back/Forward, reload restoration, and detail drill-through do not trigger whole-workspace reloads or accidental detail opens.
- First paint remains bounded, only one hierarchy is rendered at a time, and cached re-expansion does not refetch unnecessarily.
- Desktop and 320px Progress journeys have no horizontal overflow or page errors.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
