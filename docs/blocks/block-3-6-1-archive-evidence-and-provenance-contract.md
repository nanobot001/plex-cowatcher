# Block 3-6-1: Archive Provenance Contract Closure

> Status: Planned corrective closure.
> Result: Not implemented.
> Notes: The archive schema and ingestion foundation already exist. This block closes remaining provenance ambiguity; it must not recreate the archive.

## Goal

Ensure every archive consumer can distinguish observed, confirmed, inferred, and unknown evidence without converting a missing source timestamp into ingestion time or another false event time.

## Evidence-First Entry Gate

- Audit representative current rows from Tautulli, Plex library/history recovery, manual confirmation, and unresolved identity paths.
- Record exact source fields, null/missing shapes, normalized fields, and current consumer behavior.
- Verify the known risk in the Tautulli adapter: a missing source timestamp must remain unknown instead of falling back to the current time.
- If current evidence contradicts that risk, update this ticket before changing code.

## Scope

- Correct timestamp normalization so absent or invalid source event time remains explicitly unknown while ingestion time remains a separate field.
- Define an evidence-eligibility matrix for reconstructed sessions, replays, completion, confirmed co-watch, household reports, and achievements.
- Preserve raw source identity and normalized archive identity separately.
- Preserve conflicts and duplicate evidence paths without inventing a second play or choosing an unsupported winner.
- Add compatibility-safe source/provenance fields and focused tests for missing, conflicting, partial, and Plex-only evidence.

## Out Of Scope

- New archive tables or a second ingestion pipeline unless the audit proves the existing schema cannot express the contract.
- Bulk backfill, fuzzy identity matching, report delivery, achievement rules, or dashboard redesign.
- Rewriting raw observations or replacing source timestamps with inferred dates.

## Likely Files Or Areas

- `src/adapters/tautulliAdapter.ts`
- existing archive normalization/read services and types
- focused migration only if additive compatibility fields require it
- `tests/run-tests.mjs` and provenance fixtures
- archive data/logic documentation

## Acceptance Criteria

- Missing source time remains unknown and is never substituted with ingestion/current time.
- Ingestion time, playback time, Plex last-view time, confirmation time, and inferred household-local day remain separately labeled.
- The eligibility matrix states which evidence may support each downstream consumer and what must remain blocked/unknown.
- Conflicting Tautulli/Plex/manual fixtures preserve every provenance path without false duplication or certainty.
- Existing archive queries remain compatible through additive fields or an explicit migration path.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Read-only current-database audit with sanitized representative shapes
- Focused timestamp, conflict, dedupe, compatibility, and eligibility-matrix tests
