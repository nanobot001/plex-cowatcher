# Block 3-2m-1: Person Pairings And Operations

> Status: Implemented on 2026-07-05.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (70/70 service tests, 16/16 Playwright tests, syntax, and tool contracts).
> Notes: Added visible exact-item person pairings, honest overlap/unknown-time metrics, isolated operations, and confirmed idempotent prompt lifecycle actions.

## Goal

Explain who actually watches together and what operational co-watch work needs attention without fabricating shared time, leaking hidden users, or allowing one failed panel to blank the People workspace.

## Dependencies And Entry Gate

- Block 3-2m is implemented and has passed `npm run verify:block`.
- Co-watch semantics from 3-2j-1 and detail/session navigation from 3-2k/3-2l remain authoritative.

## Scope

- Replace category-pair cards with actual visible person pairings derived from the shared co-watch intelligence service.
- Apply dashboard visibility before pairing aggregation so hidden/non-household users cannot contribute names, sessions, titles, time, or totals.
- Return display names, exact shared titles, session count, measured shared duration, unknown-duration session count, supporting navigation, and separate confirmed/inferred provenance counts.
- Calculate inferred shared time from measured interval overlap only; do not substitute full title duration when overlap is unknown. Plex synchronization alone never creates a pairing.
- Add a bounded dashboard operations read model for unresolved prompts, Discord delivery failures, and Plex sync failures using privacy-safe projections rather than raw database rows.
- Move eligible dismiss and re-prompt behavior behind shared service methods with lifecycle validation, explicit confirmation, idempotency, structured errors, and audit events while preserving existing route names.
- Load People, pairings, and operations independently with panel-level loading, empty, error, and retry states.
- Reuse aliases, readable durations, category labels, shared detail, and Timeline navigation established by earlier blocks.

## Out Of Scope

- Persisted Yes/No/Not sure adjudication or a browser review queue, deferred to 3-2m-2.
- Discord review-only prompts, deferred to 3-2m-3.
- Changes to inference thresholds, session reconstruction, Plex mutation policy, user identity, or dashboard membership.
- Scheduled reports, recommendations, live presence, or social features.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/service/cowatchingIntelligenceService.ts`
- `src/service/cowatchService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/tool-surface.md`
- `docs/permissions.md`

## Acceptance Criteria

- Pairing cards name actual visible people and link to supporting exact titles or sessions.
- Confirmed and inferred counts are visibly distinct, synchronized state is not presented as relationship evidence, and unexplained confidence percentages do not appear in the primary UI.
- Shared duration includes only measured overlap; sessions lacking adequate timing remain explicitly unknown rather than receiving invented time.
- Three-person evidence produces correct pair-level counts without implying an unsupported relationship between every participant.
- Hidden users are absent before aggregation and reappear consistently when restored in Settings.
- Operations exposes unresolved prompt, delivery-failure, and sync-failure states without credentials, Discord IDs, adapter payloads, or private paths.
- Dismiss and re-prompt require confirmation, reject ineligible lifecycle states, are safe to retry, and create auditable structured outcomes.
- A failed pairing or operations request leaves the remaining People panels usable, and desktop/narrow layouts have no horizontal overflow.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Service/API fixtures for confirmed, inferred, synchronized-only, unknown-duration, hidden-user, and three-person pairings.
- HTTP and audit-log checks for successful, repeated, unconfirmed, and ineligible dismiss/re-prompt actions.
- Playwright pairing navigation, partial-panel failure, operations action, and 320-1440px layout checks.

## Drift Guardrails

- Do not change 3-2j-1 inference thresholds or introduce a second timing shortcut.
- Do not count plain shared-title consumption or Plex synchronization as co-watching.
- Operations mutations remain isolated from read-only exploration.
- Do not begin 3-2m-2 until this block passes its exit gate.
