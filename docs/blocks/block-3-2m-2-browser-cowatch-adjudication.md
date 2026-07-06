# Block 3-2m-2: Browser Co-Watch Adjudication

> Status: Implemented on 2026-07-05.
> Result: Implemented.
> Verification: `npm run verify:block` - passed (71/71 service tests, 18/18 Playwright tests, syntax, and tool contracts).
> Notes: Added migration-10 append-only pair adjudication, bounded browser reviews, dry-run/apply mutations, pairing/detail provenance, and reversible evidence-scoped decisions.

## Goal

Give the local operator a bounded, auditable way to adjudicate `Likely together` pair evidence as `Yes`, `No`, or `Not sure` while preserving the original observations and allowing later evidence to be evaluated independently.

## Dependencies And Entry Gate

- Block 3-2m-1 is implemented and has passed `npm run verify:block`.
- Person pairing, visibility, alias, evidence-label, and operations contracts are stable.

## Scope

- Add a transactional migration using the next unclaimed schema version after auditing current registrations; version 10 is the expected value and version 9 must not be reused.
- Persist append-only pair-level adjudications with exact item identity, inference rule version, source/target user IDs, sorted supporting observation IDs, decision, actor kind, method, request ID, and timestamp.
- Derive a stable opaque candidate ID from rule version, exact rating key, selected pair, and supporting observations. Never include alias or display title in candidate identity.
- Add a bounded, deterministically paginated review read model with default limit 20 and maximum 50, honoring dashboard visibility and current filters.
- Add explicit `yes`, `no`, `not_sure`, and `clear` decisions: Yes becomes `Together`; No suppresses only the matched evidence fingerprint; Not sure preserves `Likely together`; Clear restores the evidence-derived state.
- Treat new supporting evidence as a new candidate so an older No cannot suppress materially new evidence.
- Provide dry-run-by-default mutation routes with explicit apply/confirmation, caller request IDs, idempotent retries, structured errors, transactions, and audit records.
- Add the browser review queue, decision history/provenance in shared detail, reversal controls, and refresh of affected pairings without a full-page reload.
- Scope decisions to one selected source-target pair so three-person events never update unrelated participants.

## Out Of Scope

- Sending or resolving Discord review prompts, deferred to 3-2m-3.
- Rewriting/deleting playback observations, watch events, confirmations, or prior adjudication rows.
- Changing inference thresholds, automatically promoting inference, or invoking Plex watched-state mutation.
- Bulk review, bilateral confirmation, scheduled reports, or public exposure of the local admin mutation routes.

## Likely Files Or Areas

- `src/db/schema.sql`
- `src/db/database.ts`
- `src/service/cowatchingIntelligenceService.ts`
- `src/service/dashboardService.ts`
- `src/server/routes.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/event-log-schema.md`
- `docs/permissions.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Fresh and existing databases migrate idempotently without changing stored observations or reusing an existing migration version.
- Yes, No, Not sure, Clear, repeated requests, semantic no-ops, and reversals produce the specified effective relationship and append-only history.
- A No decision suppresses only the selected evidence fingerprint; changed supporting evidence becomes reviewable again.
- Three-person fixtures prove that only the selected pair changes.
- Mutations default to dry-run, require explicit confirmation when applied, are safe to retry by request ID, and record applied/skipped/reversed/error audit outcomes.
- Pairings and shared detail expose compact primary labels plus human-readable review provenance without private actor identifiers.
- Hidden users have no review candidates or aggregate contribution, but hiding them does not delete adjudication history.
- Review pagination is bounded and desktop/narrow review controls do not overlap, concatenate, or create page-level horizontal scrolling.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- Fresh/pre-migration database tests plus Yes/No/Not sure/Clear, reversal, duplicate request, new-evidence, hidden-user, and three-person service tests.
- HTTP contract, dry-run, confirmation, permission, structured-error, and audit-log checks.
- Playwright queue pagination, decision, reversal, detail provenance, pairing refresh, failure recovery, and narrow-screen checks.

## Drift Guardrails

- Adjudication overlays evidence; it never rewrites the evidence source.
- Alias, title text, confidence percentage, and event order are not candidate identity keys.
- Inference remains read-only until an explicit human decision is applied.
- Do not begin 3-2m-3 until this block passes its exit gate.
