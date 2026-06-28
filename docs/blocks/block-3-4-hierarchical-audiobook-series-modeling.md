# Block 3-4: Hierarchical Audiobook Series Modeling

> Status: Planned.
> Result: Not implemented.
> Notes: This Phase 3 refinement builds on Block 3-1 by teaching the audiobook catalog to distinguish top-level series, subseries, and related companion works without breaking existing grouping, enrichment, or tool-facing contracts.

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
