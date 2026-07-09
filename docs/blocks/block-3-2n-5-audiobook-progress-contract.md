# Block 3-2n-5: Audiobook Progress Contract

> Status: Planned.
> Result: Not implemented.
> Notes: Fifth child of the 3-2n Progress sequence; corrects audiobook progress semantics before visual polish or final dashboard gating.

## Goal

Make audiobook Progress honest, readable, and contract-backed by treating an audiobook as a book with chapter progress, known or unknown totals, partial listening, repeats, and reliable book/series context. This block should make the data shape trustworthy before a later UI polish block turns it into a compact evidence map.

## Dependencies And Entry Gate

- Blocks 3-2n-1 through 3-2n-4 are implemented and verified.
- Existing audiobook catalog tables, content catalog links, and hierarchy expansion endpoints are available.
- Block 3-2o must not start until this block and the follow-up readability block have passed their exit gates.

## Scope

- Define audiobook Progress semantics explicitly: completed chapters over total chapters when total is known, observed chapters when total is unknown, partial chapters as partial, and repeated chapters as repeated rather than extra completion.
- Tighten the typed Progress summary and expansion contract for audiobooks so cards and expanded hierarchy can distinguish known total chapters, unknown total chapters, catalogued chapter count, observed distinct chapters, completed distinct chapters, partial distinct chapters, repeated chapter evidence, and optional total/observed duration when chapter totals are incomplete.
- Ensure audiobook grouping uses stable book identity (`audiobook_books.id` when available) and canonical book title/artwork, not author, artist, series, album, or chapter identity.
- Ensure expanded audiobook hierarchy orders chapters by the best available stable catalog order; if only title/rating-key fallback exists, keep it deterministic and do not imply authoritative chapter order.
- Preserve unknown-total semantics: unknown must not render as zero, complete, or 100%.
- Extend deterministic service fixtures and tests for a known-total audiobook, an unknown-total audiobook, a partial chapter, and a repeated chapter.
- Update browser-facing copy only as needed to expose the corrected contract in a minimal readable way; leave full visual dot-map polish to 3-2n-6.

## Out Of Scope

- Broad audiobook enrichment, scanner redesign, external metadata lookups, or full library backfill.
- Changing Plex, Tautulli, Discord, copy-history, or watched-state mutation behavior.
- Replacing the lazy expansion model, adding multi-card expansion, or rendering all audiobook chapters on first paint.
- Final typography, animation, and dot-map visual polish beyond the minimum needed to verify the corrected contract.
- Inventing movie hierarchy or changing TV/Classic TV/Anime progress math except where shared types require non-behavioral compatibility updates.

## Risk And Mitigation Plan

- Risk: chapter counts may be missing or wrong, causing the UI to display false precision.
- Mitigation: carry explicit `totalKnown` and catalog-quality fields; render unknown totals as unknown and test missing-total cases.
- Risk: repeated listens may inflate completion.
- Mitigation: count distinct completed chapters separately from plays and repeats, and test repeated chapter evidence.
- Risk: chapter ordering may be unreliable if catalog metadata lacks an index.
- Mitigation: use the best stable order available, document fallback behavior in the contract, and avoid labels that imply verified order when the order is only deterministic.
- Risk: fixing audiobook semantics could drift into a broad audiobook catalog rebuild.
- Mitigation: constrain changes to Progress read models, expansion responses, fixtures, and tests unless a narrowly scoped catalog linkage bug blocks the contract.

## Drift Controls

- Do not hide bad audiobook catalog data behind polished copy.
- Do not convert unknown totals into percentages.
- Do not use duration-only progress as primary progress when reliable chapter totals exist.
- Do not add write actions, Plex mutations, recommendations, goals, ratings, or collection editing.
- Do not weaken existing 3-2n TV/Movie regression coverage while adding audiobook cases.

## Dependency Plan

- Start from `src/service/dashboardService.ts` audiobook Progress grouping and expansion behavior.
- Check `src/types/api.ts` before browser changes so the contract names and nullability are explicit.
- Extend `tests/run-tests.mjs` before or alongside browser tests to lock service-level audiobook semantics.
- Use `tests/e2e/fixture-server.mjs` only for deterministic UI cases needed by this block and 3-2n-6.

## Opportunities To Use

- Reuse `audiobook_books.chapter_count`, `total_duration_seconds`, hierarchy series fields, and canonical artwork routing.
- Reuse the lazy `/api/dashboard/progress/expand/:groupKey` endpoint instead of creating a second audiobook detail path.
- Produce a cleaner contract that makes the 3-2n-6 dot-map UI smaller, more accessible, and less ambiguous.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/types/api.ts`
- `tests/run-tests.mjs`
- `tests/e2e/fixture-server.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`
- `docs/design/dashboard-redesign-contract.md`

## Acceptance Criteria

- Known-total audiobook Progress summaries expose and display `completed chapters / total chapters` without counting repeats as additional completion.
- Unknown-total audiobook summaries expose and display observed chapter evidence without fake percentages, zero totals, or complete states.
- Partial, watched, repeated, and unknown chapter states are represented distinctly in the typed expansion response.
- Audiobook cards and expanded hierarchy use canonical book title, book cover, and book identity when available.
- Expanded audiobook chapter ordering is deterministic and documented by contract behavior.
- Deterministic tests cover known-total, unknown-total, partial, repeated, and missing-catalog cases.
- Existing TV, Classic TV, Anime, Movie, People, Timeline, and tool-contract tests continue to pass.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the local service.
