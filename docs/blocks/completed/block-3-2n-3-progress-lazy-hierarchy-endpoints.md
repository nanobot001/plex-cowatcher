# Block 3-2n-3: Progress Lazy Hierarchy Endpoints

> Status: Completed.
> Result: Implemented and verified with `npm run verify:block`.
> Notes: Third child of the 3-2n Progress sequence; adds backend lazy hierarchy retrieval before browser expansion consumes it.

## Goal

Add bounded, read-only Progress hierarchy expansion endpoints for episodic media and audiobooks that reuse the 3-2k hierarchy semantics while fetching only the expanded identity's children.

## Dependencies And Entry Gate

- Block 3-2n-1 is implemented and verified.
- Block 3-2n-2 is implemented and verified.
- The Progress shell can show summary cards without requiring hierarchy children on first paint.

## Scope

- Add typed read-only API shapes for Progress hierarchy nodes and expansion responses.
- Add server route(s) for expanding one Progress identity at a time.
- Return TV, Classic TV, and Anime as show -> season -> episode state using existing 3-2k hierarchy semantics.
- Return Audiobooks as series/subseries -> book -> chapter state using existing canonical audiobook hierarchy semantics.
- Include distinct watched, partial, repeated, completed, observed time, known-total, and unknown-total states at the appropriate node level.
- Apply hidden-user exclusion and aliases before returning per-person evidence.
- Use canonical show posters and canonical audiobook book covers where artwork appears.
- Add indexes needed for bounded expansion queries, especially `content_catalog` hierarchy lookups and playback lookup paths.
- Add service/API tests proving that expanding one identity does not fetch unrelated hierarchies and respects payload limits.

## Out Of Scope

- Rendering expandable hierarchy in the browser.
- Replacing the 3-2k detail workspace.
- Recalculating canonical audiobook hierarchy or changing audiobook matching rules.
- Mutating Plex state or stored progress evidence.

## Risk And Mitigation Plan

- Risk: reusing broad detail calls could fetch unrelated hierarchy data and undo the bounded first-paint design.
- Mitigation: add dedicated read-only expansion route(s) keyed by one Progress identity and test that unrelated hierarchies are not fetched or returned.
- Risk: large libraries can make hierarchy expansion slow without the right lookup paths.
- Mitigation: add `content_catalog` hierarchy and playback lookup indexes, or an equivalent bounded query guarantee, with timing metadata in responses.
- Risk: endpoint work could introduce hierarchy terms that conflict with 3-2k or canonical audiobook behavior.
- Mitigation: map TV, Classic TV, Anime, and Audiobook nodes to the existing shared hierarchy semantics and fixture-test each category.

## Drift Controls

- Keep this block API/service only; do not render browser expansion or change the 3-2k detail workspace.
- Do not change audiobook matching, canonical hierarchy calculation, or Plex state; consume existing canonical hierarchy data.
- Preserve tool-surface safety by returning structured read-only JSON without private paths, raw adapter URLs, secrets, or local-only identifiers.

## Dependency Plan

- Start only after 3-2n-1 and 3-2n-2 are implemented and verified, so the endpoint expands identities already shown by the shell.
- Define the expansion response type in `src/types/api.ts` before wiring server routes or tests.
- If schema/index changes are required, keep migrations repeatable and verify them through the deterministic block gate.

## Opportunities To Use

- Create a small reusable expansion service that 3-2n-4 can call directly and that 3-2o can later audit for efficiency.
- Extend the fixture set with expansion isolation, unknown totals, repeat plays, and category-specific hierarchy examples.
- Add per-expansion timing and payload metadata now so the UI block can assert bounds without inventing client-side estimates.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/db/schema.sql`
- `tests/run-tests.mjs`
- `docs/design/dashboard-redesign-contract.md`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- Expanding one TV, Classic TV, Anime, or Audiobook identity returns only the requested hierarchy and bounded child nodes.
- Repeat plays never increase distinct episode/chapter completion in expansion responses.
- Unknown totals remain explicit unknown states at season/book/chapter levels where metadata is incomplete.
- Hidden users are excluded and visible aliases are applied in expansion evidence.
- Query indexes or equivalent bounded query guarantees are added for hierarchy expansion paths.
- Expansion responses include timing metadata and do not expose private paths, raw adapter URLs, secrets, or local-only identifiers outside the dashboard contract.

## Verification

- `npm run verify:block`
