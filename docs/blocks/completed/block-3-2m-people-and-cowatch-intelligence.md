# Block 3-2m: Household People Profiles

> Status: Implemented on 2026-07-05.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (68/68 service tests, 14/14 Playwright tests, syntax, and tool contracts).
> Notes: Added household-scoped active/secondary profiles, readable activity, aliases, duplicate warnings, navigation, responsive layout, and deterministic regression coverage.

## Goal

Make the People workspace explain which configured identities belong in the household dashboard and what each included person consumes, without treating every Plex account or duplicate-looking identity as an equivalent household member.

## Dependencies And Entry Gate

- Block 3-2l is complete and verified.
- Settings visibility/alias behavior from 3-2h and shared navigation from 3-2k/3-2l remain authoritative.

## Scope

- Make the existing Settings visibility switch explicitly mean `Include in household dashboard`; hidden users remain stored and ingested but are excluded from dashboard People data, filters, links, and totals.
- Use the configured dashboard alias everywhere a person is named, with exact Plex username fallback. Show raw usernames only in an explicitly labeled technical/account disclosure.
- Default People intelligence to the trailing 30 days and honor explicit dashboard date filters.
- Classify shown identities as active when enabled with supported activity in the effective window; place disabled and no-activity identities in a collapsed secondary section with an explainable status.
- Flag exact normalized username/alias collisions as `Possible duplicate` presentation warnings only. Normalization may case-fold, trim, collapse whitespace, and ignore common separators, but must never become a join or aggregation key.
- Add per-person recent titles, readable watched time, labeled category mix, active-day heatmap, completion summary, and links to filtered Library and Timeline views.
- Open title context through the existing 3-2k detail workspace and preserve URL-restorable person filters.
- Extend the existing People response compatibly with active/secondary groups and effective-window metadata rather than removing the current `people` field.

## Out Of Scope

- Person-pair intelligence and the operations lane, deferred to 3-2m-1.
- Browser adjudication persistence and review actions, deferred to 3-2m-2.
- Discord review prompts, deferred to 3-2m-3.
- Destructive user merges, a second household-membership field, `is_home_user` membership inference, account management, third-party profile photos, social features, or changes to co-watch inference.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Active and secondary identities are visually separated, the secondary section is collapsed by default, and disabled/no-activity status is understandable.
- Settings-controlled hidden users are absent from both sections, person filters, links, and aggregate totals; re-showing them restores presentation without changing stored evidence.
- Custom aliases appear everywhere a person is named, while raw Plex usernames remain available only in an explicitly labeled technical/account field when needed for administration.
- Possible-duplicate warnings never combine cards, metrics, filters, or evidence from separate user IDs.
- The effective window is visible, durations use household-readable units, category names are humanized, and category pills neither overlap nor concatenate.
- Recent titles open shared detail; Library and Timeline links retain the selected person and browser history behavior.
- Desktop and 320-1440px layouts have balanced spacing, no page-level horizontal overflow, and no inaccessible collapsed content.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Playwright active/secondary/disabled/duplicate identity, alias, hidden-user, person navigation, and narrow-screen checks.
- Service/API assertions for the 30-day default, explicit date filters, backward-compatible response fields, and hidden-user exclusion before aggregation.

## Drift Guardrails

- Presentation grouping must not rewrite user identity, visibility, or evidence history.
- Duplicate/alias presentation must not auto-merge users; aliases and normalized labels are never database join keys.
- Dashboard visibility controls presentation and aggregates only; it must not disable ingestion or delete stored history.
- Do not begin 3-2m-1 until this block passes its exit gate.
