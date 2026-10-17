# Block 3-6-6G: Audiobook Mastery, In-Progress Book Trophies, And Series Collections

> Status: Implemented (2026-10-16).
> Result: Implemented and verified via deterministic test gate (`npm run verify:block`) and live smoke gate.
> Dependency: Blocks 3-6-6A, 3-6-6C, 3-6-6D, and canonical audiobook position evidence (`3-2n-6H` / `3-2n-6I`) implemented and verified.
> Direction: `docs/design/achievements-product-direction.md`.

## Goal

Elevate Audiobooks to first-class citizens on the **Trophy Shelf** and in **Milestone Badges** by turning canonical per-book listening evidence (`audiobook_position_evidence` and `content_catalog`) into dynamic cover-art trophies (`In Progress` and `Earned`) alongside expanded book-count and listening-hour tiers.

## Scope

- **Dynamic Book Mastery Trophies (`book_mastery_<audiobookId>`)**:
  - Sourced from `audiobook_position_evidence` joined with `content_catalog` metadata and cover artwork (`/api/artwork/<id>?variant=poster`).
  - **In Progress State**: Awarded for books with meaningful listening progress (`>= 2%` and `< 95%` of total book duration) that are not yet completed. Displays hours listened vs. total book duration (`Xh Ym / Zh`), percentage complete, and chapter progress (`X of Y chapters`) when a verified chapter timeline is available.
  - **Earned State (Bronze / Silver / Gold / Platinum)**: Awarded when a book reaches completion (`view_offset_ms >= duration_ms` or canonical completion threshold `>= 95%`). Supports re-listen loyalty ribbons (`2x`, `3x`, `4x+`) when distinct completed listening cycles are recorded.
- **Book Series / Author Collection Rollups (`audiobook_series_mastery_<key>`)**:
  - When multiple cataloged audiobooks share a canonical series or multi-book author grouping, surface series-level progress (`Caught Up on Plex` vs. `In Progress` vs. `Completed`).
- **Expanded Audiobook Milestone & Hour Rules (`src/achievements/ruleCatalog.ts`)**:
  - Book completion tiers: `1 (Bronze) -> 5 (Silver) -> 10 (Gold) -> 25 (Platinum) -> 50 (Platinum)` completed books.
  - Cumulative listening time tiers: `25 hrs (Bronze) -> 100 hrs (Silver) -> 250 hrs (Gold) -> 500 hrs (Platinum)` across audiobook sessions.

## Out Of Scope

- Counting individual audio tracks as completed books (strictly forbidden; must aggregate at the book level).
- Audio transcription or resume-excerpt generation (owned by Block `3-2n-6D`).
- Dashboard category filter bar and modal presenter changes (owned by Block `3-6-6I`).

## Likely Files Or Areas

- `src/achievements/types.ts`
- `src/achievements/evidenceReader.ts`
- `src/achievements/evaluator.ts`
- `src/achievements/ruleCatalog.ts`
- `tests/run-tests.mjs`

## Acceptance Criteria

- Individual audio tracks never count as standalone books; book progress is keyed strictly by canonical book identity (`audiobook_id` / album `rating_key`).
- Started audiobooks (`>= 2%` and `< 95%`) appear as `in_progress` Trophy Shelf items with cover artwork, duration progress, and percentage.
- Completed audiobooks (`>= 95%` or `view_offset_ms >= duration_ms`) appear as `earned` Trophy Shelf items with cover artwork and completion timestamp.
- Expanded book-count and listening-hour rules evaluate deterministically from canonical evidence.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Unit tests in `tests/run-tests.mjs` covering in-progress audiobooks, completed audiobooks, track-vs-book guardrails, and hour milestones
