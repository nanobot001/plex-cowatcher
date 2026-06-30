# Block 3-2h: Dashboard Shell And Design System

> Status: Planned.
> Result: Not implemented.
> Notes: Builds only the persistent shell and reusable visual primitives after 3-2g has made every layout bounded and measurable.

## Goal

Create a coherent, accessible dashboard shell that makes all five workspaces discoverable and gives subsequent blocks stable components instead of permitting page-specific styling drift.

## Dependencies And Entry Gate

- Block 3-2g complete, including its performance and contract exit gates.
- The redesign contract is the authority for category names, colors, filter state, and selected-item context.

## Scope

- Replace the zero-size layout switcher and browser-default top navigation with a persistent desktop rail and compact narrow-screen navigation.
- Keep Overview, Timeline, Library, People, and Progress primary; place Copy History, Audit, Settings, CSV, and health status in a clearly secondary operations area.
- Build shared tokens and primitives for typography, spacing, surfaces, category colors, buttons, pills, metrics, panels, skeletons, empty/error states, artwork fallbacks, drawers, and focus rings.
- Add one persistent date-range control and one collapsible filter surface shared by all layouts.
- Extend the existing Settings function with a Dashboard People section listing configured users by Plex username, a `Show on dashboard` toggle, and an optional alias field. Persist these non-secret preferences through the dashboard preference fields rather than the synced Plex identity fields.
- Default every enabled configured user to shown and every blank/missing alias to the exact Plex username. Provide an explicit `Reset alias to username` behavior.
- Build one shared display-name resolver and one shared canonical poster/cover component consumed by every later layout.
- Preserve layout, filter, selection, and browser-history state across navigation and reload.
- Remove native horizontal scrollbars from presentation components while retaining keyboard-accessible scrolling controls.
- Establish desktop, tablet, and mobile layout breakpoints without redesigning individual workspace content.

## Out Of Scope

- Reorganizing Overview, Timeline, Library, People, or Progress content.
- New API fields, charts, recommendations, or content metadata.
- Editing Plex usernames, Discord mappings, source-user status, ingestion enablement, or historical records from Dashboard People settings.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `src/service/settingsService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- All five primary destinations are visible, labeled, keyboard reachable, and have an unambiguous active state at 1440x900, 1024x768, and 390x844.
- No primary navigation control has a zero-size box or depends on hover to be discoverable.
- Filters are opened from one consistent location and active filters remain visible as removable chips or a concise summary.
- Primary and secondary navigation are visually distinct.
- Loading, empty, partial failure, artwork fallback, and focus states use shared primitives rather than layout-specific markup.
- The shell introduces no horizontal page overflow at the three target viewports.
- Settings can hide/show a dashboard user and set/clear an alias; changes survive service restart and browser reload.
- Hidden users disappear from dashboard user filters and summary counts without being disabled or deleted elsewhere.
- A blank, removed, or invalid alias renders the exact Plex username.
- Shared media artwork rendering accepts a canonical poster/cover URL plus category fallback and never chooses an author/artist image for an audiobook.

## Verification And Exit Gate

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Playwright screenshots and keyboard walkthrough at all three target viewports.
- Playwright back/forward, reload persistence, filter open/close, and active-layout checks.
- Playwright Settings walkthrough for default username, custom alias, hide/show, reset, restart persistence, and proof that non-dashboard workflows remain unchanged.
- Do not start 3-2i until the shell passes without workspace-specific exceptions.

## Drift Guardrails

- Later blocks must consume these primitives and tokens; they may not create a parallel navigation or color system.
- Category colors must remain consistent across every layout.
- Do not copy unsupported mockup features such as downloads, favorites, ratings, recommendations, or public deployment controls.
- Later layouts may not implement their own alias, visibility, or artwork-selection logic; they must use the shared resolvers created here.
