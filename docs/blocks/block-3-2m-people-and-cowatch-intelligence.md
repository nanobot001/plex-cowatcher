# Block 3-2m: People And Co-Watch Intelligence

> Status: Planned.
> Result: Not implemented.
> Notes: Reorients People around household identities, readable activity, actual person pairings, and evidence-backed shared sessions.

## Goal

Make the People workspace explain who is active, what each person consumes, and who actually watches together without exposing duplicate/raw identities as equivalent household members.

## Dependencies And Entry Gate

- Blocks 3-2g through 3-2l complete.
- Shared detail and daily session navigation must already work.

## Scope

- Define presentation rules for active, empty, disabled, duplicate, and alias-like Plex identities without destructively merging stored users.
- Treat Settings visibility and alias values from 3-2h as authoritative: shown users use their configured alias or exact username fallback; hidden users do not appear or contribute to dashboard People/co-watch aggregates.
- Show active household members first and place empty/legacy identities in a collapsed secondary section.
- Use readable durations and consistent category names instead of raw minutes and underscored tokens.
- Add per-person recent titles, category mix, active-day heatmap, completion summary, and links to filtered Library/Timeline views.
- Replace category-pair co-watch cards with actual person pairings, shared time, shared titles, session count, and provenance mix.
- Surface unresolved Discord prompts and delivery/sync failures in the shared operations lane, preserving confirmed/inferred/synchronized distinctions.
- Open person/session/title context through existing shared navigation and 3-2k detail.

## Out Of Scope

- Destructive user merges, account management, profile photos from third parties, social features, or changing co-watch inference.
- Scheduled household reports from Block 3-3.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/service/cowatchingIntelligenceService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Active and legacy/empty identities are visually separated and their status is explainable.
- Settings-controlled hidden users are absent from both primary and legacy sections, filters, pairings, and aggregate totals; re-showing them restores their presentation without changing stored evidence.
- Custom aliases appear everywhere a person is named, while raw Plex usernames remain available only in an explicitly labeled technical/account field when needed for administration.
- Durations render in household-readable units and category pills do not overlap or concatenate.
- Co-watch pairings name people and link to supporting sessions/titles.
- Confirmed, inferred, and synchronized evidence cannot be mistaken for one another.
- Existing eligible dismiss/re-prompt actions remain confirmed, idempotent, audited, and isolated from read-only exploration.
- One failed People or operations panel does not blank the workspace.

## Verification And Exit Gate

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Playwright active/empty/duplicate identity, person filter, co-watch pairing, prompt action, failure, and narrow-screen checks.
- Audit-log verification for every exercised mutation.

## Drift Guardrails

- Presentation grouping must not rewrite user identity or evidence history.
- Duplicate/alias presentation must not auto-merge users; alias is never used as a database join key.
- Inferred participation remains read-only and must never trigger Plex watched-state mutation.
