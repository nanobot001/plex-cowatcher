# Block 3-4: Hierarchical Audiobook Series Modeling

> Status: Implemented on 2026-06-28.
> Result: Implemented.
> Verification: `npm test` and `npm run verify:tools` - passed.
> Notes: Added database migrations, normalizer mappings for Discworld/Mistborn/WoT, pipeline integration, and extended backfill CLI mode.

## Goal

Make the audiobook catalog understand parent series, subseries, and related-but-not-mainline works so collections like Discworld and Mistborn can be represented truthfully in storage and summaries. The outcome should preserve the current audiobook ingestion and enrichment flow while adding a durable way to answer questions such as "how many Discworld books do I have?", "which ones are in the Death subseries?", "which books are Mistborn Era 1 versus Wax and Wayne?", and "which books are companion works like Secret History?" without relying on ad hoc manual interpretation.

## Scope

- Add schema support for hierarchical series metadata on `audiobook_books`, such as a parent-series field, a subseries field, and a lightweight relationship classification for companion or related works, while preserving existing `series_index` behavior.
- Update local path parsing, enrichment normalization, and book upsert logic so known cases can populate parent series and subseries consistently.
- Add a migration and guarded backfill path for existing audiobook rows so current Discworld-style and Mistborn-style labels can be normalized into the new structure.
- Preserve existing public tool names and response stability, only extending audiobook outputs where needed in a backward-compatible way.
- Add regression coverage for hierarchy parsing, migration behavior, normalization rules, and summary/query outputs.

## Out Of Scope

- Building a fully normalized standalone `series` table with arbitrary parent-child graph relationships.
- Solving every franchise or universe taxonomy beyond the scoped audiobook hierarchy fields needed for parent series, one subseries layer, and a simple related-work classification.
- Broad author-name cleanup, narrator cleanup, or unrelated metadata-quality passes unless directly required by the new hierarchy model.
- Rich browser UI for hierarchy browsing; that belongs in a later UI-focused block.

## Likely Files Or Areas

- `src/db/schema.sql`
- `src/db/database.ts`
- `src/db/migrations/`
- `src/service/audiobookService.ts`
- `src/service/audiobookBackfillService.ts`
- `src/types/index.ts`
- `tests/run-tests.mjs`
- `docs/data/README.md`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`

## Acceptance Criteria

- `audiobook_books` can store a top-level series, an optional subseries, and an optional relationship classification for related companion works without breaking existing audiobook rows or fresh database setup.
- Existing Discworld-related books can be represented as parent series `Discworld` plus optional subseries values such as `Ankh-Morpork City Watch`, `Death`, `Rincewind`, or `Witches`.
- Existing Mistborn-related books can be represented as parent series `Mistborn`, with subseries values such as `Era 1` and `Wax and Wayne`, while allowing related works such as `Secret History` to remain attached to `Mistborn` without forcing them into a main subseries.
- Existing `Wheel of Time` style single-series books remain representable without requiring a subseries value.
- Local parsing plus enrichment normalization can populate hierarchy fields deterministically for at least the known Discworld and Mistborn cases and preserve fallback behavior when confidence is low.
- Backfill and migration behavior remain transactional, resumable where applicable, and do not expose private file paths through public-read surfaces or structured errors.
- Shared service and tool outputs remain backward-compatible, with any new hierarchy fields added as optional extensions rather than breaking changes.
- Tests cover schema migration, parser and normalization logic, representative Discworld and Mistborn hierarchy assignments, companion-work classification, and regression safety for non-hierarchical series.

## Verification

- `npm run build`
- `npm test`
- `npm run verify:tools`
- Manual spot check of representative audiobook rows before and after a dry-run hierarchy backfill, confirming parent-series, subseries, and related-work values are populated as expected for Discworld and Mistborn and unchanged for single-series books like Wheel of Time.

## Prepared Implementation Details

### Authority And Compatibility

- Follow `docs/project-charter.md` as the top-level authority.
- Preserve Block 3-1 ingestion, enrichment, private-path handling, and guarded backfill behavior.
- Read the tool-contract documents required by `AGENTS.md` before changing persistence, worker behavior, tool outputs, permissions, or routes.
- Keep public tool names stable and make response extensions optional and backward-compatible.
- Preserve existing series fields and `series_index` behavior.

### Deterministic Normalization

Use one pure normalization path shared by ingestion, enrichment normalization, upsert, and backfill. Apply evidence in this order:

1. Explicit embedded or source metadata.
2. Declarative canonical mappings and aliases.
3. Conservative path, label, or title patterns.

Additional rules:

- Reject and report conflicts between equally authoritative rules.
- Do not let weaker evidence overwrite a stronger existing classification.
- Leave hierarchy fields unset when evidence is insufficient while preserving existing series data.
- Store bounded provenance such as `metadata`, `mapping`, or `pattern`.
- Normalize case, whitespace, punctuation, and aliases for comparison while retaining original diagnostic values.
- Populate only fields supported by evidence; a missing subseries or relationship is not an error.
- Do not infer arbitrary franchise relationships from title similarity alone.
- Keep mappings extensible so future series do not require schema changes or scattered service branches.
- Return machine-readable, privacy-safe reason codes for proposed, unchanged, skipped, and conflicting rows.

### Required Representative Rules

- Discworld is the parent, with subseries including Ankh-Morpork City Watch, Death, Rincewind, and Witches.
- Mistborn is the parent, with Era 1 and Wax and Wayne subseries.
- Companion works such as Secret History remain attached to Mistborn without being forced into a mainline subseries.
- Wheel of Time and similar single-series books remain valid without a subseries.

### External Enrichment Boundary

- Do not integrate a new external API in this block.
- Define a narrow optional provider interface only if it does not complicate deterministic processing.
- A future provider result should support candidate work identity, parent series, subseries, relationship classification, source identity, confidence, and provenance.
- External candidates must never silently override deterministic local metadata.
- Evaluate BookBrainz first in a later spike because it models audiobook editions, identifiers, narrators, work-series membership, and series relationships. Evaluate Hardcover second if useful.
- Base adoption on representative Discworld, Mistborn, and local-catalog accuracy. Treat external results as suggestions until confidence and conflict handling are proven.
- Future integration must address caching, rate limits, retries, structured errors, credentials where applicable, and dry-run visibility.

### Additional Out Of Scope

- Integrating BookBrainz, Hardcover, Open Library, Google Books, Audible, or another provider.
- More than one subseries layer.
- Low-confidence franchise guessing.
- Destructive migrations, history deletion, or Tautulli modification.

### Implementation Plan

1. Inspect the audiobook schema, parser, enrichment, upsert, backfill, summaries, structured errors, and tool contracts.
2. Define additive columns, bounded relationship/provenance values, optional public fields, and structured conflicts.
3. Add fresh-schema support and a transactional migration preserving existing rows and behavior.
4. Implement the pure hierarchy normalizer with explicit precedence and no I/O.
5. Add declarative Discworld and Mistborn mappings and aliases.
6. Add conservative reusable patterns and safe fallback behavior.
7. Integrate the normalizer into parsing, enrichment, and upsert without duplicating logic.
8. Extend backfill preview/apply with resumability, idempotency, reason codes, conflicts, and privacy-safe output.
9. Extend shared service and tool outputs through optional fields only.
10. Add the provider interface for later BookBrainz evaluation without network calls or credentials.
11. Add schema, migration, normalization, conflict, backfill, privacy, query, and compatibility tests.
12. Update only durable data/tool documentation affected by implementation and add a completion note here.

### Risk And Change Permissions

- Dependencies: do not add one unless demonstrably necessary.
- Migrations: additive and transactional only; no destructive migrations.
- Data changes: require dry-run preview and safe retries.
- Destructive operations: not allowed.
- External credentials: not required and must not be introduced.
- Privacy: never expose private paths, tokens, keys, or sensitive local details publicly.
- Runtime: preserve single-process PM2 operation and the cheap tool verification command.

### Additional Acceptance Criteria

- Fresh and migrated databases store parent series, optional subseries, optional relationship classification, and provenance without breaking existing rows.
- Normalization follows the documented metadata, mapping, and pattern precedence.
- Equal-authority conflicts produce structured, privacy-safe results and do not write disputed classifications.
- Recognized new audiobooks receive repeatable hierarchy values; unknown cases remain unset.
- Backfill dry-run reports proposed, unchanged, skipped, and conflicting rows with machine-readable reasons.
- Backfill apply is transactional, resumable where applicable, idempotent, and safe to retry.
- Public outputs and structured errors never expose private paths.
- The provider boundary supports a later BookBrainz experiment without current network access or credentials.
- Tests cover fresh schema, migration, precedence, conflicts, representative series, dry-run/apply safety, privacy, and tool-contract stability.

### Expanded Verification

- Run hierarchy backfill in dry-run mode and inspect structured counts and reasons.
- Spot-check Discworld, Mistborn, and Wheel of Time before and after an approved apply.
- Re-run verification to demonstrate idempotency and safe retries.
- Compare tool responses before and after migration to confirm existing names and fields remain stable.

### Completion Handling

- When implemented, update status and result and append a concise completion note with verification evidence.
- Update `docs/data/README.md` for durable schema or normalization rules.
- Update tool-contract documentation only for actual output or structured-result changes.
- Avoid unrelated documentation churn and changelog entries unless required by repository policy.
