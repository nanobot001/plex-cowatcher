# Canonical Audiobook Progress Projection

Block 3-2n-6J-A exposes one additive, per-listener service/API projection over the 6H evaluator and 6I evidence. Raw playback fields remain unchanged.

## Contract

`AudiobookProgressProjectionSet` contains `schemaVersion: 1` and a `listeners` array. Each listener projection includes:

- `context`: `current` or `session_as_of`;
- `current` and `furthest` positions with offset, book percentage, chapter index, evidence kind, quality, source, reason, evaluation time, media revision, and chapter revision;
- movement, direction, rewind/revisit flags, validated listening time, and an explicit `bookCompleted` fact;
- one selected `sessionMovement` with start/end positions, percentages, chapters, direction, and evidence;
- canonical chapter states: `in_progress`, `revisiting`, `passed`, `probably_passed`, `explicitly_completed`, or `unknown`.

Missing evidence remains `null`/`unknown`. Household responses list listeners independently; they never average or merge progress.

## Consumer Inventory

| Consumer | Selected projection | Compatibility boundary |
| --- | --- | --- |
| Overview activity and recent cards | Per-listener `session_as_of` | Existing raw progress fields remain present. |
| Overview audiobook digest sessions | Per-listener `session_as_of` at each session end | Existing completed/current chapter summary fields remain additive compatibility fields. |
| Overview completion summaries | Separate completed playback observations, completed books, and passed/revisiting chapters | Raw completed rows are not renamed to books. |
| Progress cards and buckets | Current plus furthest per listener | Existing summary fields remain for 6J-B migration. Audiobook recently-completed requires canonical book completion. |
| Progress hierarchy | Current/furthest plus canonical chapter states per listener | Existing watcher-state fields remain available. |
| Shared detail and hierarchy | Same current projection set as Progress | Route names and legacy progress summary remain stable. |
| Legacy detail | Current projection set | Existing item, play, and hierarchy fields remain stable. |
| Media Explorer | Current plus furthest per listener | Raw `percentComplete` remains compatibility evidence, not canonical meaning. |
| Continue Consuming and legacy Continue Watching | Current per listener | A completed source row does not remove an audiobook unless canonical book completion is true. |
| Explorer progress sort | Highest per-listener canonical furthest percentage; current is fallback; quality then plays/time/key break ties | Non-audiobooks retain the existing percentage sort. Unknown audiobook progress sorts after known progress. |
| Timeline sessions and activity feed | `session_as_of` at the row/session end | Timeline width remains listening/session time and is not progress. |
| People recent titles | `session_as_of` | Person totals expose separate completion facts. |
| Public-read dashboard APIs | Typed additive projection fields | Existing route names and non-audiobook payload meanings remain unchanged. |
| CSV export | Raw source projection only | Header and raw progress column are unchanged; canonical fields are not substituted. |
| Copy History, watched-state synchronization, prompts, and Audit writes | No canonical progress input | Approximate, unknown, or derived progress has no mutation authority. |

## Completion Semantics

- `completedPlaybackObservations` counts source playback rows marked completed.
- `passedAudiobookChapters` counts canonical prior attainment, including a chapter currently being revisited.
- `completedAudiobookBooks`/`bookCompleted` requires exact furthest evidence at the end of the book.

These facts are intentionally separate. Neither a partial session nor a passed chapter is a completed book.

## Raw And Mutation Isolation

The projection is read-only and computed on demand. It adds no table, cache, worker, dependency, or write path. It does not update `playback_observations`, `audiobook_position_evidence`, Plex, Tautulli, Copy History, prompt state, synchronization state, or audit rows.
