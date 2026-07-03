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
- Multi-person badges remain readable without child overlap or element overflow.
- Library selection survives reload, Back, and Forward navigation.
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
