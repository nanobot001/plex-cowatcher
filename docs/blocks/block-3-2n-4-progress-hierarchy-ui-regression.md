# Block 3-2n-4: Progress Hierarchy UI And Regression

> Status: Planned.
> Result: Not implemented.
> Notes: Final child of the 3-2n Progress sequence; wires lazy hierarchy expansion into the browser and closes the Progress regression coverage.

## Goal

Make the Progress workspace hierarchy-first in the browser by lazily expanding TV, Classic TV, Anime, and Audiobook cards, preserving bounded first paint, accessible interaction, drill-through to detail evidence, and regression coverage.

## Dependencies And Entry Gate

- Block 3-2n-1 is implemented and verified.
- Block 3-2n-2 is implemented and verified.
- Block 3-2n-3 is implemented and verified.
- Progress summary and hierarchy expansion responses are typed, bounded, and read-only.

## Scope

- Add expandable hierarchy controls to Progress cards for TV, Classic TV, Anime, and Audiobook categories.
- Fetch and render only the expanded card's hierarchy response.
- Reuse the 3-2k detail workspace for deeper evidence drill-through rather than introducing a Progress-only detail modal.
- Render episode/chapter states with accessible labels for distinct watched, partial, repeated, completed, observed time, and unknown total evidence.
- Keep Movies as non-expandable completion/repeat summaries with detail drill-through.
- Preserve Progress filters, pagination/loading state, and browser history when expanding/collapsing or opening/closing detail.
- Add stable `data-testid` selectors for durable hierarchy behavior; avoid relying on incidental CSS classes in new tests.
- Extend Playwright regression coverage for TV, Classic TV, Anime, Audiobook, and Movie examples, expansion isolation, DOM/payload bounds, reload/Back/Forward, narrow viewport overflow, and page errors.

## Out Of Scope

- Changing backend progress math beyond small integration fixes needed for the established contract.
- Adding new write actions, Plex mutations, ratings, goals, recommendations, or collection editing.
- Replacing the shared 3-2k detail workspace.
- Broad visual screenshot tests or pixel-perfect design freezes.

## Risk And Mitigation Plan

- Risk: expanded hierarchy could quietly fetch or render too much, recreating the original unresponsive Progress screen.
- Mitigation: test request isolation, first-paint bounds, expanded DOM bounds, and cached expanded state against the deterministic fixture.
- Risk: regression tests can become brittle if they target CSS classes or incidental text.
- Mitigation: use stable `data-testid` selectors and accessibility-facing labels for durable hierarchy behavior.
- Risk: pointer-only expansion could make Progress harder to use and harder to test reliably.
- Mitigation: cover keyboard expand/collapse, pointer expand/collapse, and detail open/close journeys.

## Drift Controls

- Do not change backend math except for narrowly scoped contract integration fixes discovered while wiring the established API.
- Do not introduce a separate Progress detail modal; drill through to the shared 3-2k detail workspace or an explicit movie detail path.
- Keep Movies non-expandable and keep unknown totals explicit in both summary and expanded states.
- Keep visual tests behavioral rather than pixel-perfect; avoid broad screenshot freezes.

## Dependency Plan

- Start only after 3-2n-1, 3-2n-2, and 3-2n-3 are implemented and verified with `npm run verify:block`.
- Consume only the established summary and expansion API shapes; if a contract change is required, document it and update the earlier contract tests.
- Extend `docs/testing/dashboard-regression-contract.md` with final Progress invariants before or alongside Playwright coverage.

## Opportunities To Use

- Lock the full original 3-2n outcome with one end-to-end journey covering TV, Classic TV, Anime, Audiobook, and Movie behavior.
- Reuse the 3-2k detail workspace and existing no-overflow helpers rather than inventing a Progress-only evidence surface.
- Use expanded-state caching and per-card loading states to make hierarchy exploration feel smooth without increasing first-paint cost.

## Likely Files Or Areas

- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/e2e/fixture-server.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Expanding one hierarchy fetches and renders only that hierarchy; unrelated Progress cards and sections are not refetched or rendered.
- Initial Progress first paint remains bounded, and expanded DOM count stays within documented limits.
- TV, Classic TV, Anime, Audiobook, and Movie examples each drill through to the shared detail workspace or an explicit non-hierarchy movie detail path.
- Unknown totals are never displayed as zero, complete, or 100% in summary or expanded hierarchy UI.
- Keyboard and pointer users can expand/collapse nodes and open detail evidence.
- Desktop and 320px Progress journeys have no horizontal overflow or page errors.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
