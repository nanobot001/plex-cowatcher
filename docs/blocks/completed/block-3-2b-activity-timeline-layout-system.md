# Block 3-2b: Activity Timeline And Layout System

> Status: Implemented on 2026-06-28.
> Result: Implemented.
> Verification: npm run build, npm test (52/52), npm run verify:tools, node --check src/web/static/dashboard.js, and live PM2 HTTP walkthrough - passed.
> Notes: Persistent five-layout registry, shared state, history navigation, deterministic timeline pagination, provenance, and reconstructed session context.

## Goal

Let the operator switch between Household Overview and a chronological Activity Timeline without losing investigation context.

## Scope

- Introduce the reusable layout registry and switcher used by all later 3-2 layouts.
- Persist the selected layout in browser localStorage, defaulting safely to Household Overview.
- Keep shared filters, selection, and navigation context stable across layout changes.
- Build Activity Timeline from playback observations and reconstructed sessions.
- Label observed playback, explicit confirmation, inferred overlap, prompt state, and Plex synchronization distinctly.
- Add bounded timeline cursor loading and deterministic ordering.
- Preserve route and browser-history state only for explicit layout and filter changes.

## Out Of Scope

- Poster-grid media exploration, co-watch mutation controls, CSV export, and progress collections.
- New session inference rules or changes to the underlying evidence model.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/public/styles.css`
- `src/server/routes.ts`
- `src/service/sessionService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- [ ] Overview and Timeline switch instantly without resetting active filters.
- [ ] Layout choice survives reload and handles removed/invalid stored values.
- [ ] Timeline covers all supported media categories and configured users.
- [ ] Evidence and uncertainty are understandable without opening raw records.
- [ ] Timeline loading remains bounded and stable for equal timestamps.
- [ ] Keyboard and browser back/forward behavior are predictable.
- [ ] Timeline rows keep provenance visible without duplicating the same event as separate top-level records.

## Verification

- `npm run build`
- `npm test`
- Manual layout persistence, shared-filter, chronology, provenance, keyboard, and back/forward checks.