# Block 3-2d: People And Co-Watching Workspace

> Status: Implemented on 2026-06-28.
> Result: Implemented.
> Verification: npm run build, npm test (52/52), npm run verify:tools, node --check src/web/static/dashboard.js, and live PM2 HTTP walkthrough - passed.
> Notes: Per-person workspace, structured prompt and co-watch evidence, plus confirmed idempotent dismiss/re-prompt actions with audit records.

## Goal

Show what each household member is doing and make co-watching evidence and pending Discord decisions understandable and safely actionable.

## Scope

- Add People & Co-Watching as the fourth dashboard layout.
- Show per-person recent activity, media mix, consumption time, shared sessions, and unresolved items.
- Show prompt lifecycle states using structured delivery and resolution status rather than inventing new database meanings.
- Separate explicit Discord confirmation, inferred overlap, and Plex synchronization results.
- Add eligible dismiss and re-prompt actions through the shared service layer.
- Require confirmation for mutations and preserve structured JSON, audit events, idempotency, and clear per-action results.
- Retain current dashboard filters and link to relevant media/session/person detail.
- Persist prompt attempts so delivery history and failures remain visible.
- Add any missing audit persistence needed for tool-facing writes without exposing sensitive IDs or tokens.

## Out Of Scope

- Changing co-watch inference thresholds.
- Scheduled household reports or Discord report delivery.
- Inferred watched-state mutation.
- Per-user Discord DMs.

## Likely Files Or Areas

- `src/web/index.ts`
- `src/web/public/styles.css`
- `src/server/routes.ts`
- `src/service/cowatchService.ts`
- `src/service/cowatchingIntelligenceService.ts`
- `src/service/auditService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- [ ] Every configured user has a useful people view even when activity is empty.
- [ ] Pending "who else watched?" work is prominent and its lifecycle state is explained.
- [ ] Confirmed, inferred, and synchronized states cannot be mistaken for one another.
- [ ] Only eligible events expose dismiss/re-prompt controls.
- [ ] Actions require confirmation, are safe to retry, return structured outcomes, and write audit/domain events.
- [ ] One failed action does not corrupt surrounding dashboard state.
- [ ] Delivery failures, missing mappings, and unresolved prompts remain visible instead of being collapsed into a generic error.

## Verification

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Manual prompt-state, confirmation, retry, partial-failure, audit, and provenance checks.