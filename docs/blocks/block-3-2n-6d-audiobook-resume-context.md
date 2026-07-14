# Block 3-2n-6D: Whisper-Assisted Audiobook Resume Context

> Status: Planned.
> Result: Not implemented.
> Notes: Umbrella only; do not implement directly. The work is split across a bounded cross-repository transcription contract, a CoWatcher adapter/state block, a background worker/rollout block, and an audiobook modal block.

## Child Block Sequence

1. `block-3-2n-6d-1-bounded-resume-transcription-contract.md`
2. `block-3-2n-6d-2-trusted-resume-adapter-and-state.md`
3. `block-3-2n-6d-3-stable-stop-worker-and-rollout.md`
4. `block-3-2n-6d-4-audiobook-resume-modal.md`

The umbrella is complete only after each child passes its own verification gate. Implement in order: the worker must not target an undocumented external command, and the modal must not ship against hypothetical resume-context state.

## Goal

Let a listener reopen an audiobook and immediately see whose position is shown, the current chapter and within-chapter position, and a short private transcript excerpt from just before the latest stable stopping point. Produce that context locally and asynchronously without continuously scanning audio, transcribing whole chapters, blocking playback ingestion, or duplicating the overall progress summary already shown on the modal's left side.

## Locked Product And Architecture Decisions

- CoWatcher owns playback evidence, stop-candidate coalescing, durable jobs, sanitized result persistence, rollout controls, and the modal.
- The separate `audiobook` project owns media clipping and `faster-whisper` inference through a new additive, read-only, tool-agnostic JSON command.
- CoWatcher invokes that command through a dedicated trusted adapter. It must not import Python or `faster-whisper` into the Node service.
- A “stable stop” in this phase means an ended audiobook Tautulli history observation with explicit source `stopped_at` and a valid direct millisecond stopping offset that remains the newest eligible observation for the same listener and audiobook through a configured quiet period. It is not a claim that CoWatcher observed a live pause event.
- The first release stores a short transcript excerpt, not a paraphrased semantic summary. Whisper is speech-to-text and the current projects contain no approved summarization model or provider.
- The excerpt is capped at 20 displayed words and comes from a source clip no longer than 60 seconds ending at or before the observed stop. The full transcript and temporary clip are never persisted by CoWatcher.
- Single-file, revision-valid audiobooks are supported first. Multi-file mapping remains source-honest and unsupported until a separate block defines track-local-to-book-global offsets.
- Resume processing is independently disabled by default, processes at most one job at a time, uses exactly one CPU inference thread in this phase, and performs no model download during normal service operation.

## Scope

- Deliver the four child blocks in order and preserve their boundaries.
- Keep all new contracts additive and all rollout controls reversible.
- Preserve existing chapter proof, progress mapping, ingestion, PM2, tool contracts, and non-audiobook dashboard behavior.
- Record the review findings and resolved assumptions in `docs/process/block-3-2n-6d-design-review.md`.

## Out Of Scope

- Implementing this umbrella directly.
- Paraphrased or generative summaries, cloud transcription, a local language model, transcript search, embeddings, speaker identification, or audiobook question answering.
- Continuous Plex/Tautulli activity monitoring solely for this feature.
- Full-book/full-chapter transcription, transcription ahead of the stop, or a transcript archive.
- Multi-file audiobook resume mapping, media rewriting, chapter repair, or Plex writes.

## Dependencies

- Block 3-2n-5d-3 must finish its explicit recurring-worker rollout gate first because the corrective sequence remains ordered.
- Block 3-2n-6E-3 must establish the universal detail workspace and shared Audiobook presenter before 6D implementation begins; 6D-4 must extend that presenter rather than target a Progress-only modal.
- Existing immutable audiobook media revisions and private manifest items from Blocks 5D-1 through 5D-3.
- Existing verified chapter mapping and current-position behavior from Blocks 3-2n-5B and 3-2n-6C.
- A usable local Python 3.12+, ffmpeg, `faster-whisper`, and preinstalled model runtime in the separate `audiobook` project; 6D-1 must verify rather than assume this dependency.

## Umbrella Acceptance Criteria

- All four child blocks are implemented in order and their required gates pass.
- One new Tautulli history observation can produce at most one active resume context for one listener, audiobook revision, and coalesced stop position.
- The resulting modal shows current position and a short stopping-point excerpt without a duplicate right-column overall-progress strip.
- Disabled, unavailable, stale, silent, unsupported, and failed processing all preserve normal audiobook progress and modal behavior.
- No public response, event, job row, or log exposes a private media path, temporary clip path, full transcript, model cache path, or raw child stderr.
- Existing `inspect`, `validate`, `resolve`, chapter proof, ingestion, canonical detail routing, non-audiobook presenters, and PM2 single-process operation remain compatible.
- `npm run verify:block` passes for every CoWatcher child before it is marked implemented; deployed dashboard work also passes `npm run verify:live-dashboard`.

## Review Authority

The pre-implementation quality review is `docs/process/block-3-2n-6d-design-review.md`. If implementation evidence invalidates a locked assumption—especially stop semantics, offset units, runtime availability, resource controls, or the single-file mapping—the active child must stop and update the ticket/review instead of silently broadening scope.
