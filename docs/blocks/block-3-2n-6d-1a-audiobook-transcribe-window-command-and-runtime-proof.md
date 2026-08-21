# Block 3-2n-6D-1A: Audiobook transcribe-window Command And Runtime Proof

> Status: Planned cross-repository dependency.
> Result: Not implemented.
> Owner repository: `C:\Users\antho\Code\audiobook`.
> Notes: This CoWatcher ticket records the dependency contract only. Implementation must occur on its own audiobook-repository branch.

## Goal

Add and prove one bounded read-only local `transcribe-window` JSON command in the audiobook project.

## Scope

- Accept one single-file `.m4b`/`.m4a`, finite `start_ms`/`end_ms`, maximum 60-second window, allowlisted local model, and JSON output.
- Probe duration; extract private mono 16 kHz temporary audio; run local CPU int8 Whisper with one inference thread/worker, low-search decoding, and below-normal Windows priority.
- Disable runtime model downloads and fail closed for missing runtime/model/resource policy.
- Return a versioned bounded envelope with clip-relative segments, text, speech/language confidence where available, actual bounds, elapsed time, truncation, and allowlisted resource policy.
- Clean temporary files on success, timeout, interruption, and failure without modifying source media or chapter artifacts.
- Preserve existing inspect/validate/resolve and repair behavior.

## Out Of Scope

- Any CoWatcher code/state, stop discovery, queue, daemon, transcript archive, cloud API, media mutation, multi-file mapping, or UI.

## Likely Files Or Areas

- sibling audiobook command dispatcher and JSON command tests
- focused clipping/transcription module
- existing Whisper/ffmpeg helpers where reuse preserves current behavior
- audiobook JSON API, runtime, and testing documentation

## Acceptance Criteria

- Synthetic or explicitly approved input produces a valid bounded envelope with no sidecar/media mutation.
- Invalid bounds, unsupported input, missing runtime/model, policy failure, timeout, and oversized output return stable safe errors.
- OS-observed canary proves process priority/thread policy, no model download, cleanup, elapsed time, CPU time, and peak working set.
- Existing audiobook command/regression tests pass.
- No private path, real transcript, generated media, stderr, stack trace, or model-cache path is committed.

## Verification

- Audiobook repository's documented full deterministic gate
- Focused command/bounds/cleanup/error/resource tests
- Separately authorized local synthetic or approved canary
