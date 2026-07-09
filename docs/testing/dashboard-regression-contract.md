# Dashboard Regression Contract

## Purpose

Protect durable dashboard behavior across numbered blocks without freezing visual design. `npm run verify:block` is the mandatory pre-completion gate; `npm run verify:live-dashboard` is the separate post-deployment smoke gate.

## Isolation

- `playwright.config.mjs` runs `tests/e2e/dashboard-regression.spec.mjs` against the real Express app on reserved test port `18791`.
- `tests/e2e/fixture-server.mjs` creates a fresh `.tmp/dashboard-e2e/fixture.sqlite` database for each run and injects `MockPlexAdapter`.
- The deterministic suite must not connect to PM2, port `8787`, the configured production SQLite path, Plex, Tautulli, Discord, or any external metadata provider.
- Port conflicts fail the run rather than reusing an unknown server.

## Frozen Invariants

- Visible participant names agree across the API-backed card badge, accessible `Watched by` label, and opened detail `People` value.
- Explicit confirmed participants can appear without duplicate playback observations.
- Canonical Library aggregation includes visible participants across title children while hidden users never appear or contribute.
- Aliases sort deterministically and active person filters narrow the participant set.
- Settings visibility is the household-dashboard membership boundary: hidden identities never appear in People groups, filters, links, or dashboard aggregates.
- People keeps active identities separate from collapsed disabled/no-activity identities, and possible-duplicate warnings never merge their evidence.
- Person pairings use exact-item confirmed/inferred evidence, exclude hidden identities before aggregation, and keep measured overlap separate from unknown duration.
- People profiles, pairings, and operations fail independently so one panel error cannot blank the workspace.
- People totals deduplicate direct playback against confirmed attributed participation, expose observed/attributed provenance, and align profile, pairing, and review periods without mutating stored evidence.
- People period presets/custom dates survive URL reload, all-time totals are not summary-sample capped, and a bounded heatmap discloses its displayed range.
- People card ordering is browser-local presentation state, keeps Active and Other order buckets separate, survives reload when custom, and resets cleanly back to the server order without corrupting hidden or regrouped identities.
- People ordering interactions reorder the mounted cards locally; mode switches, reset, pointer drops, and keyboard moves must not refetch People data or replace the workspace with a loading state.
- The dragged People preview must stay anchored near the grabbed card while the source card remains mounted locally; it must not snap to a viewport corner or trigger a full-page refresh while ordering.
- People heatmap intensity represents duration while a separate accessible Together marker represents confirmed shared evidence; meaning never depends on color alone.
- Each People heatmap behaves like a single composite widget with roving focus, one tab stop, a shared popover, and an explicit drill-through action that preserves the selected person and day.
- Browser adjudication is pair-scoped, reversible, idempotent by request ID, and keeps Yes/No/Not sure/Clear consistent between the review queue, pairings, and detail provenance.
- Ask in Discord is operator-triggered, permits one open prompt per candidate, remains separate from normal Plex-sync prompts, and exposes pending/failure state without private Discord identifiers.
- Multi-person badges remain readable without child overlap or element overflow.
- Library selection survives reload, Back, and Forward navigation.
- Progress workspace shell separates Recently Active, Continue, and Recently Completed buckets.
- Progress offset and filter parameters (category, user) are URL-restorable, browser-history preserved, and reset cleanly.
- Progress hierarchy expansion is lazy and single-card: first paint stays summary-only, one expanded card is URL-restorable, cached re-expansion does not refetch, and unrelated cards are not rendered as expanded.
- Progress hierarchy rows use stable selectors and accessible labels for TV, Classic TV, Anime, and Audiobook watched, partial, repeated, unknown, and source-uncertain states.
- Audiobook Progress fixtures must include both verified cached chapters and unverified Plex track/file fallback evidence; browser copy may say chapters only for verified cached boundaries.
- Unknown totals display explicit unknown stats without falsifying percentages or indicator fills.
- Movies display progress/repeat evidence without invented TV or Audiobook season/chapter summaries.
- Desktop and 390px layouts do not create page-level horizontal overflow or page errors in covered journeys.

## Extension Rules

- Add an invariant only when a block creates durable behavior that later blocks must preserve.
- Assert semantics through stable `data-testid`, ARIA, URL, API, and visible-state contracts; do not bind tests to incidental DOM depth or CSS class names.
- Use targeted geometry checks only for failures such as clipping, overlap, or horizontal overflow.
- Do not add broad screenshot comparisons or pixel-perfect thresholds to the mandatory gate.
- Keep fixtures minimal, deterministic, visibly fictional, and sufficient to exercise one-viewer, confirmed two-viewer, three-plus-viewer, alias, hidden-user, and filtered states.
- When intended behavior changes, update the owning block, this contract, fixtures, and assertions together. Never weaken an assertion solely to make a new block pass.

## Commands

- `npm run test:dashboard-regression`: build and run only the deterministic Playwright suite.
- `npm run verify:block`: run the complete mandatory numbered-block gate.
- `npm run verify:live-dashboard`: inspect the running localhost dashboard read-only after rebuild or restart.
