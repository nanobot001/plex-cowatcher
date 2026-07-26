# Block 3-2n-5E-B: Audnexus Sentinel And Title Compatibility

> Status: Implemented and verified 2026-07-26.
> Result: Exact `-1` Audnexus-agent editions and hyphenated chapter subtitles now use the existing file-boundary proof path.
> Verification: `npm run verify:block` passed; backed-up targeted Fires of Heaven and Towers of Midnight canaries passed, followed by The Shadow Rising; `npm run verify:live-dashboard` passed after the CoWatcher-only restart.
> Notes: No schema, dependency, worker, multipart, generic-section, or recurring-rollout expansion was introduced.

## Goal

Allow otherwise exact one-file-per-chapter revisions to use the existing 5E-A path when their stored Audnexus-agent GUID uses the common `-1` edition sentinel or their complete Prologue/Chapter/Epilogue sequence uses a hyphen subtitle separator.

## Confirmed Live Evidence

- Path of Daggers uses one positive Audnexus edition component and is already verified through 5E-A.
- The Fires of Heaven and The Shadow Rising have matching catalog/file counts, exact stored ASIN identity, a common `-1` GUID component, consecutive final track components, positive durations, and complete chapter-title sequences.
- Towers of Midnight has the same `-1` identity shape plus Prologue/Chapter/Epilogue titles separated from subtitles by ` - `.
- Other current multi-file revisions have materially different evidence: multipart chapters, Foreword or numbered-section semantics, generic repeated titles, a missing track, an anomalous terminal item, or a catalog/file-count mismatch.

## Scope

- Treat `-1` as an allowed stored Audnexus-agent edition sentinel only when every item has the same exact ASIN, locale, sentinel, and consecutive positive final track component `1..N`.
- Accept either `:` or whitespace-delimited ` - ` between an exact Prologue/Chapter/Epilogue label and its non-empty subtitle.
- Preserve complete-sequence, count, duration, path, identity, and ordering checks from 5E-A.
- Make targeted reevaluation identify exact file-boundary-ready unsupported jobs explicitly.
- Keep recurring multi-file execution disabled and process only reviewed eligible audiobook IDs one at a time after backup and dry-run gates.

## Out Of Scope

- Multipart chapter grouping or merging.
- Foreword, afterword, credits, provider-numbered section, or generic-track promotion.
- Repairing missing files, track gaps, catalog-count mismatches, stale metadata, or anomalous terminal items.
- New schemas, queues, workers, dependencies, public routes, runtime controls, or title/author/series allowlists.
- Enabling recurring multi-file production execution.

## Likely Files Or Areas

- `src/service/audiobookRevisionService.ts`
- `src/service/audiobookMultiFileService.ts`
- `src/service/audiobookProofWorkerService.ts`
- `tests/run-tests.mjs`
- `docs/production/README.md`

## Acceptance Criteria

- A complete same-edition `-1` GUID sequence orders and activates through file-boundary proof without the external analyzer.
- Positive edition components continue to work; `0`, values below `-1`, mixed sentinels, duplicate tracks, gaps, and out-of-order tracks remain ineligible.
- Exact Prologue/Chapter/Epilogue sequences accept colon or ` - ` subtitles; multipart and broader section labels remain ineligible.
- Targeted reevaluation reports `READY_FOR_FILE_BOUNDARY_CHAPTER_PROOF` for an exact current unsupported job and does not broadly revive unrelated terminal failures.
- Existing single-file proof, embedded multi-file proof, Path of Daggers, raw playback observations, tool contracts, and fallback progress remain compatible.
- No migration or dependency change is introduced.

## Verification

- Focused fixtures based on the observed Fires of Heaven, The Shadow Rising, and Towers of Midnight metadata shapes plus negative sentinel/title cases.
- `npm run verify:block`
- Fresh quick-checked live SQLite backup and pre-apply raw observation/chapter/job baselines.
- Targeted dry-run and confirmed canaries for The Fires of Heaven and Towers of Midnight, followed only if both succeed by the same exact targeted operation for The Shadow Rising.
- Verify revision-matched chapters, mapped Progress, unchanged raw playback counts, no lease, recurring multi-file false, and `npm run verify:live-dashboard` after the CoWatcher-only restart.

## Implementation And Live Evidence

- The stored Audnexus-agent parser now accepts positive edition components or exactly `-1`; `0`, values below `-1`, mixed editions, duplicate tracks, gaps, and out-of-order sequences remain rejected.
- Exact Prologue/Chapter/Epilogue labels accept either `:` or whitespace-delimited ` - ` subtitles. Multipart and broader section labels remain rejected.
- Targeted reevaluation now distinguishes exact current file-boundary candidates with `READY_FOR_FILE_BOUNDARY_CHAPTER_PROOF`.
- `npm run verify:block` passed with 141 service/integration tests, 63 dashboard regressions and one intentional skip, dashboard syntax validation, and tool contracts.
- `pre-audnexus-sentinel-proof-2026-07-26T13-33-07-742Z.sqlite` passed `PRAGMA quick_check`.
- The Fires of Heaven activated 57 revision-matched chapters; all 57 file jobs succeeded, 71 raw playback observations were unchanged, Progress reports verified chapter mode, and no lease remained.
- Towers of Midnight activated 59 revision-matched chapters; all 59 file jobs succeeded, 65 raw playback observations were unchanged, Progress reports verified chapter mode, and no lease remained.
- After both distinct canaries passed, The Shadow Rising activated 58 revision-matched chapters; all 58 file jobs succeeded, 80 raw playback observations were unchanged, Progress reports verified chapter mode, and no lease remained.
- The remaining 11 multi-file jobs were not requeued. Their current strict reasons are unsupported title semantics, track-sequence gaps/order defects, or catalog/file-count mismatch.
- Recurring multi-file execution remains false. Only `plex-cowatch-service` was restarted, and `npm run verify:live-dashboard` passed.
