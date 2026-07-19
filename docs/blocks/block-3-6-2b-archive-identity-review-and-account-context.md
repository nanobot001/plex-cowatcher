# Block 3-6-2B: Archive Identity Review And Account Context

> Status: Implemented and verified (2026-07-19).
> Result: Added migration 21, exact Plex-account context, append-only archive identity decisions, structured detail review route, compact conditional review UI, and deterministic/browser coverage.
> Notes: This is a focused follow-up to 3-6-2A. It preserves source rows and uses explicit review before an uncertain archive media identity changes a movie projection.

## Goal

Make imported Plex history easier to trust and correct. Automatically resolve archive events to configured household users when the Plex source account key matches exactly, preserve unmatched accounts as unknown, and provide a discreet **Review identity** action only when the media identity remains unresolved or medium-confidence. Corrections must be reversible CoWatcher overlays that preserve the original Plex event and never fabricate canonical playback detail.

## Dependencies And Entry Gate

- Block 3-6-2A is implemented and verified.
- The existing archive tables and additive dashboard read paths remain the source boundary; do not create a second database or a second import pipeline.
- Existing archive events, aliases, observation links, and source provenance remain immutable except for additive adjudication records.

## Scope

- Resolve archive account context from exact `source_account_key` to configured CoWatcher users and record the resolution method/confidence needed by the dashboard. Do not infer Tony from a date cutoff or use title/media evidence to assign a person.
- Preserve unknown or unmatched accounts as unknown while retaining the raw source account key.
- Add an archive identity decision overlay at the archive-media level so one decision can cover related source events without mutating `archive_watch_events` or `archive_media_aliases`.
- Surface a compact **Review identity** affordance only for unresolved, ambiguous, or medium-confidence archive candidates. High-confidence records should remain quiet.
- Let the review flow assign an archive media identity to a current catalog item, choose another catalog item, mark the candidate unrelated, leave it unresolved, and undo an earlier decision.
- Surface plausible archive candidates separately from confirmed history. Candidate matching may use bounded supporting signals such as normalized title, year, runtime, and library, but must not silently promote title-only matches.
- Make approved decisions affect archive projections and detail presentation with explicit source labels such as `Plex archive recovery` and reviewed confidence.
- Keep account confidence and media confidence separate so a record can be confidently attributed to Tony while its media identity remains uncertain.
- Keep archive evidence out of replay/session fabrication and do not copy approved records into `playback_observations`.

## Out Of Scope

- A blanket pre-2020 Tony rule or any other date-based user assumption.
- Automatic title-only or fuzzy identity promotion.
- Editing Plex, Tautulli, or the original CoWatcher archive source rows.
- Reconstructing precise playback timing, sessions, replays, or progress from archive evidence.
- Episode, audiobook, music, photo, export, or achievements review flows.
- A large Operations workspace; routine review belongs in the relevant movie detail context.

## Likely Files Or Areas

- `src/db/schema.sql` and a new migration for archive identity decisions and any required resolution metadata
- `src/service/archivePlexViewRecoveryService.ts` for archive candidate and decision read/write services
- `src/service/dashboardService.ts` for candidate projection, account context, and reviewed archive reads
- Dashboard detail workspace templates/static code and styles for the compact review affordance/modal
- `src/server/routes.ts` and tool documentation for structured local review actions
- `tests/run-tests.mjs` for account, decision, idempotency, and source-preservation fixtures
- `tests/e2e/dashboard-regression.spec.mjs` for modal visibility, review flow, undo, and responsive layout
- `docs/tool-surface.md`, `docs/event-log-schema.md`, and `docs/continue-here.md`

## Acceptance Criteria

- A known Plex account key resolves to the matching configured user with an explicit exact-account provenance; an unknown account remains unknown and is never assigned by date, title, or default household assumptions.
- Archive source rows and original aliases remain unchanged after review; every correction is represented by an auditable, reversible CoWatcher decision.
- The movie detail workspace shows no review control for high-confidence archive identity, and shows a small **Review identity** affordance only when a candidate is unresolved, ambiguous, or medium-confidence.
- The review flow presents the source GUID, source title, account context, event dates, confidence, and candidate target before applying a decision.
- Assigning a target causes the relevant archive events to appear under that movie with source-aware labeling; marking unrelated removes them from that candidate projection without deleting evidence; undo restores the prior state.
- Approved archive decisions do not create duplicate `playback_observations`, sessions, replays, or fabricated playback timing.
- Account attribution and media identity remain independently visible and independently correctable.
- The flow is compact, keyboard-accessible, aligned with existing modal/table design rules, and has no horizontal overflow from 320px through 1440px.
- All review actions are structured, idempotent, locally auditable, and do not expose Plex paths, tokens, or private upstream details.

## Verification

- `npm run verify:block`
- Deterministic fixture with Tony and Garner archive events before 2020, an unknown account, one unresolved media identity, one reviewed assignment, one unrelated decision, and undo coverage.
- Dashboard regression coverage proving the review affordance is conditional, the modal is compact/responsive, source evidence remains visible, and reviewed history does not fabricate sessions or replays.
- Assert that repeated review requests with the same decision are idempotent and that the original archive rows remain unchanged.
- `npm run verify:live-dashboard` after any deployed rebuild or PM2 restart.

## Implementation Notes

- `archive_watch_events.account_resolution_method` and `account_confidence` distinguish exact Plex username matches from unknown account context; display-name matching and date-based Tony assumptions are not used.
- `archive_identity_decisions` is an append-only overlay. `assign`, `unrelated`, and `unresolved` are represented as successive decisions; undo records `unresolved` rather than deleting the prior decision.
- `POST /api/dashboard/detail-workspace/:detailKey/archive-identity-review` is the structured localhost review action. Assignments affect archive-backed projections only and never create `playback_observations`, sessions, replays, or timing evidence.
- Movie detail renders `Review identity` only when a title-matched archive candidate is not already represented by an exact current alias. Candidates show source dates, account context, source GUIDs, confidence, and bounded target choices.
- Verification: `npm run verify:block` passed: 119/119 service tests, 59 dashboard tests with one pre-existing intentional narrow skip, JavaScript syntax, and tool contracts. After PM2 restart, `npm run verify:live-dashboard` passed.
