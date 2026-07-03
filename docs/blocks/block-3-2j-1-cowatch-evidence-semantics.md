# Block 3-2j-1: Co-Watch Evidence Semantics

> Status: Planned.
> Result: Not implemented.
> Notes: Corrects the Phase 2 co-watch inference contract before rich detail and later dashboard work consume ambiguous relationship data.

## Goal

Give `Watched by`, `Together`, and `Likely together` one authoritative, evidence-backed meaning so the dashboard never turns shared title history into an unsupported claim that people watched together.

## Dependencies And Entry Gate

- The reopened Block 3-2j participant-label correction is complete and verified.
- Block 2-6 remains the historical foundation, but this block supersedes its ambiguous treatment of plain observed playback as a co-watch relationship.
- Do not begin Block 3-2k until this block's exit gate passes.

## Scope

- Add one durable co-watch evidence contract used by services, APIs, CLI output, tests, and dashboard labels.
- Define `Watched by` as title-level participation at any time; it never implies simultaneity or a relationship between viewers.
- Define `Together` as human-confirmed co-watching for one exact movie, episode, or chapter. Preserve who or what supplied the confirmation when that provenance exists; use an honest household-confirmed fallback when historical actor detail is unavailable.
- Define `Likely together` as a versioned inference for the same exact stable item when independent observed intervals have known timing, estimated starts are no more than 15 minutes apart, and overlap is at least the lesser of ten minutes or half the shorter interval.
- Treat missing/invalid timing or duration as unknown, not inferred. A Plex watched flag, shared show identity, different episodes, a broad activity cluster, or plain observed playback alone never establishes togetherness.
- Make explicit denial or dismissal defeat inference for the matched event without deleting the underlying observations.
- Remove plain `observed` participants from co-watch qualification while preserving observed playback as evidence.
- Bump the inference rule version and keep existing structured response fields backward-compatible; expose relationship state, supporting observation IDs, timing relationship, reason, and bounded confidence without leaking private data.
- Audit existing Overview and dashboard co-watch presentation so only exact-item confirmed/inferred relationships use `Together` or `Likely together`; ordinary multi-viewer summaries use `Watched by`.

## Out Of Scope

- Dashboard review mutations, automatic Discord prompts, live-presence claims, surveillance signals, recommendations, or Plex watched-state mutation.
- Reconstructing missing historical timing, requiring bilateral confirmation, or rewriting/deleting stored playback observations and confirmations.
- Rich title hierarchy/detail UI, deferred to 3-2k, and the review queue/workflow, deferred to 3-2m.

## Likely Files Or Areas

- `src/service/cowatchingIntelligenceService.ts`
- `src/service/dashboardService.ts`
- `src/types/`
- `docs/design/`
- `docs/logic/`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Two people who watched different episodes or the same item at nonqualifying times appear only as title participants; no co-watch event or `Together`/`Likely together` label is produced.
- Exact-item observations meeting both start-alignment and overlap rules produce `Likely together` with rule version, support, reason, timing, and confidence.
- Explicit confirmation produces `Together`; denial/dismissal prevents inference; Plex synchronization alone remains non-evidence for co-watching.
- Unknown timing or duration remains unknown and cannot pass inference through a fallback shortcut.
- Three-person fixtures create one event with only the qualifying participants and do not infer unrelated pairings.
- Existing public tool names and response envelopes remain stable, inferred results remain read-only, and hidden dashboard users do not appear in dashboard relationship summaries.
- Overview, Library, detail consumers, and future blocks share the same vocabulary and do not implement independent timing shortcuts.

## Verification And Exit Gate

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
- CLI/HTTP fixture comparison for confirmed, inferred, separately observed, denied, unknown-timing, Plex-sync-only, and three-person cases.
- Playwright check that `Watched by`, `Together`, and `Likely together` cannot be mistaken for one another at desktop or narrow widths.

## Drift Guardrails

- This block corrects relationship semantics; it does not create a social layer or a live activity tracker.
- Confidence values explain inference strength but are not shown as unexplained percentages in the primary UI.
- Inference never resolves a Discord prompt, mutates Plex, or becomes stored fact merely because the same title was consumed by multiple users.
