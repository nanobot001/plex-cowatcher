# Block 3-2n-6D-1: Bounded Resume Transcription Contract

> Status: Planned.
> Result: Not implemented.
> Notes: First child of 3-2n-6D. This is a coordinated cross-repository contract block: the new read-only command belongs to the separate `audiobook` project, while CoWatcher receives only a documented fixture contract and does not yet queue production work.

## Goal

Give trusted local callers a deterministic, bounded way to transcribe one short audiobook window at an explicit offset. Prove the actual local runtime and resource behavior before CoWatcher builds durable jobs around it.

## Scope

### `audiobook` project

- Add an additive read-only JSON command named `transcribe-window`; do not name it after CoWatcher or a dashboard concept.
- Accept `--file`, `--start-ms`, `--end-ms`, an allowlisted model/model-path configuration, and `--json`.
- Validate that offsets are finite integers, `0 <= start < end`, the requested end does not exceed probed duration beyond a small documented tolerance, and the effective window is no longer than 60 seconds.
- Support `.m4b`/`.m4a` single-file input first. Return a stable safe error for unsupported input rather than falling into repair behavior.
- Refactor/reuse clip extraction and Whisper loading where safe, while preserving current chapter-verification behavior and tests.
- Extract mono 16 kHz temporary audio in a private temporary directory with ffmpeg limited to one processing thread, then transcribe locally with CPU `int8`, one inference thread, one worker, batch size 1, and low-search decoding such as beam size 1.
- Make the command lower its own process priority on Windows before model loading or extraction, ensure the ffmpeg child inherits/applies the same below-normal policy, or return a stable `RESOURCE_POLICY_UNAVAILABLE` error. Do not rely on a shell wrapper.
- Disallow model downloads during command execution. A missing local model/cache is a safe configuration error with operator setup guidance outside public output.
- Return a versioned JSON envelope containing only bounded text, bounded segment-relative timestamps, bounded speech/no-speech confidence signals available from Whisper, detected language probability, actual clip bounds, model class, elapsed milliseconds, and an allowlisted resource-policy summary.
- Bound transcript text to 4,000 characters and segment count to 200. Reject or truncate deterministically with an explicit flag; never stream unbounded output.
- Clean up temporary audio on success, timeout, interruption, and failure. Do not create `.fixed.m4b`, `chapters.json`, or a transcript sidecar.
- Add contract documentation and tests for the new command. Existing `inspect`, `validate`, `resolve`, legacy repair behavior, and golden snapshots must remain unchanged.

### CoWatcher project

- Add versioned sanitized success/error fixtures for `transcribe-window` and document the future adapter boundary.
- Do not add the background queue, database migration, runtime timer, dashboard fields, or production invocation in this child.

## Out Of Scope

- Stop detection, job persistence, PM2 scheduling, retries, or dashboard work.
- Selecting the final 20-word excerpt; this command returns bounded transcription evidence and 6D-2 owns persistence policy.
- Paraphrased summaries or any language model beyond Whisper speech recognition.
- Network model download, cloud APIs, media mutation, chapter repair, multi-file book-global mapping, or arbitrary directory transcription.

## Contract Requirements

Success data must be versioned and contain fields equivalent to:

```json
{
  "contract_version": 1,
  "start_ms": 1000,
  "end_ms": 31000,
  "text": "bounded transcript text",
  "segments": [{ "start_ms": 0, "end_ms": 2000, "text": "bounded text", "no_speech_probability": 0.02 }],
  "language": "en",
  "language_probability": 0.98,
  "model": "base",
  "elapsed_ms": 4200,
  "truncated": false,
  "resource_policy": {
    "device": "cpu",
    "compute_type": "int8",
    "cpu_threads": 1,
    "workers": 1,
    "priority": "below_normal"
  }
}
```

Private input paths, model-cache paths, ffmpeg commands, raw stderr, stack traces, and environment details are forbidden in the envelope.

## Likely Files Or Areas

### `C:\Users\antho\Code\audiobook`

- `src/repairchapters.py`
- `src/whisper_verify.py` or a new focused transcription module
- `tests/test_json_commands.py`
- new focused transcription tests
- `docs/data/json-api.md`
- `docs/testing/README.md`
- project setup/runtime documentation if the verified runtime differs from existing instructions

### `C:\Users\antho\Code\plex-cowatcher`

- `tests/fixtures/` or focused adapter contract fixtures
- `docs/architecture/README.md`
- `docs/tool-adapter-memory.md`

## Risks And Drift Controls

- **Cross-repository blast radius:** Implementation must use separate commits and verification results for each repository. Do not copy Whisper code into CoWatcher to avoid the dependency.
- **Runtime assumption:** Source files are not evidence that Python, ffmpeg, `faster-whisper`, or a model is runnable. The block remains incomplete until an explicit runtime probe and one user-approved bounded canary pass.
- **Model download drift:** Normal service invocation must use a preinstalled model and fail closed when it is absent.
- **Chapter-repair regression:** The new subcommand must be disjoint from legacy positional parsing and preserve existing JSON commands byte/field compatibility where already published.
- **Privacy drift:** Tests use synthetic/generated speech or fakes. Real audiobook text must not enter snapshots, commits, logs, or fixtures.
- **Overengineering:** Do not build caching, queues, summaries, UI, generic media transcription, or a plugin framework in this block.
- **Persistent-model drift:** Use one bounded process per explicit command in this phase; do not add a resident Python model daemon before cold-start resource evidence justifies that complexity.

## Acceptance Criteria

- `transcribe-window` returns one valid version-1 JSON envelope for a synthetic or user-approved local clip without writing media or sidecar files.
- Requests over 60 seconds, reversed/out-of-range offsets, missing files, unsupported formats, missing Whisper, missing local model, and unavailable resource policy return stable bounded error envelopes.
- The command and ffmpeg extraction run with CPU `int8`/single-thread limits as applicable, one Whisper worker, low-search decoding, and below-normal Windows priority applied before cold model loading. The canary verifies priority/thread behavior from OS-observed process evidence and records elapsed time, CPU time, and peak working set rather than trusting only the JSON claim.
- No model/network download occurs during the canary.
- Temporary clips are absent after success and every tested failure path.
- Existing `inspect`, `validate`, `resolve`, and legacy repair tests pass unchanged.
- CoWatcher has sanitized success/failure fixtures sufficient for 6D-2 adapter tests, but no runtime queue or UI code.
- The two repositories have separate diffs/commits and neither contains private paths, real transcript text, or generated media artifacts.

## Verification

### `audiobook` project

- `python -m unittest tests/test_json_commands.py`
- focused unit tests for bounds, cleanup, error envelopes, output limits, and resource policy
- existing golden/regression command documented by that project
- one explicit local canary with a bounded synthetic or user-approved clip

### CoWatcher project

- `npm run verify:block`
- fixture schema/adapter-contract tests only; no real Whisper invocation in the deterministic gate
