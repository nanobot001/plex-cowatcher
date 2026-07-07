# Block 3-2m-3: Discord Co-Watch Review

> Status: Implemented on 2026-07-05.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (73/73 service tests, 20/20 Playwright tests, syntax, and tool contracts); `npm run verify:live-dashboard` - passed at 1440px and 390px.
> Notes: Added a dedicated operator-triggered Discord review lifecycle, deduped delivery, browser/Discord adjudication consistency, cancellation, privacy controls, and zero-Plex-write verification.

## Goal

Let the operator ask for a Discord decision on one exact `Likely together` pair without reusing the Plex-syncing confirmation flow, creating notification loops, or allowing browser and Discord decisions to diverge silently.

## Dependencies And Entry Gate

- Block 3-2m-2 is implemented and has passed `npm run verify:block`.
- Browser adjudication, pair candidate identity, audit, and effective-decision semantics are stable.

## Scope

- Add a dedicated persisted review-prompt lifecycle linked to one adjudication candidate and separate from existing watch-event/Plex-sync prompts.
- Make `Ask in Discord` an explicit operator write action with dry-run/apply, confirmation, request ID, eligibility validation, structured errors, and audit events.
- Permit at most one open prompt per candidate and make delivery polling/retries reuse that prompt rather than creating duplicate notifications.
- Add review-specific Discord content and distinct interaction IDs for `Yes`, `No`, and `Not sure`.
- Resolve Discord answers through the shared adjudication service and never call Plex synchronization, alter playback observations, or resolve an unrelated watch-event prompt.
- Cancel or close an open review prompt when the candidate is resolved in the browser, becomes ineligible, or either participant is hidden; make late interactions return an already-resolved result.
- Preserve privacy by keeping operational Discord identifiers out of dashboard/public-read responses and audit payloads while retaining sufficient internal delivery state.
- Surface pending, delivered, failed, cancelled, and resolved review status in the review/operations UI with panel-level failure isolation.
- Complete durable tool-surface, permissions, event-log, dashboard-contract, and regression-contract documentation for the full 3-2m sequence.

## Out Of Scope

- Automatic prompting for inferred events, per-user DMs, bilateral confirmation, repeated reminders, scheduled reports, or social notifications.
- Changes to the existing normal co-watch confirmation/Plex-sync workflow beyond shared handler routing required to distinguish review interactions.
- New inference signals, live-presence claims, or confidence percentages in primary UI.
- Block 3-2n hierarchy/progress work.

## Likely Files Or Areas

- `src/db/schema.sql`
- `src/db/database.ts`
- `src/service/cowatchService.ts`
- `src/discord/prompts.ts`
- `src/discord/interactions.ts`
- `src/discord/bot.ts`
- `src/server/routes.ts`
- `src/web/static/dashboard.js`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/tool-surface.md`
- `docs/permissions.md`
- `docs/event-log-schema.md`
- `docs/testing/dashboard-regression-contract.md`

## Acceptance Criteria

- Merely discovering or rendering an inference never creates a Discord review prompt.
- An applied operator action creates at most one eligible open prompt; repeated requests and delivery retries cannot create notification loops.
- Discord Yes, No, and Not sure produce the same pair-scoped effective decisions and provenance as browser adjudication.
- Tests prove the review path never invokes Plex watched-state mutation or changes an existing normal prompt lifecycle.
- Browser resolution, hidden participants, delivery failure, retry, cancellation, and late interaction states remain consistent and auditable.
- Dashboard/public-read output and audits expose no Discord IDs, credentials, tokens, private paths, or raw adapter payloads.
- One failed review/operations panel does not blank People, pairings, or person profiles.
- The complete People workspace remains usable from 320px through 1440px with no horizontal overflow or inaccessible actions.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Discord service/handler tests for disabled configuration, operator creation, duplicate suppression, send success/failure, retry, each decision, browser-first resolution, hidden users, cancellation, and late interaction.
- Explicit adapter-spy assertion that no review path calls Plex sync.
- Playwright Ask-in-Discord lifecycle, independent panel failure, privacy, accessibility, and narrow-screen checks using deterministic local fixtures only.
- Audit-log verification for every exercised mutation and tool-contract verification for unchanged published tool names/envelopes.

## Drift Guardrails

- Review prompts are operator-triggered and adjudication-only.
- Existing co-watch prompts retain their established Plex-sync semantics; review prompts never inherit them.
- Discord delivery state is not relationship evidence.
- Block 3-2n must not begin until this block passes its exit gate.
