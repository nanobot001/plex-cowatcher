# Block 3-2n-6D-1: Resume Transcription Contract

> Status: Planned umbrella.
> Result: Not implemented directly.
> Notes: The original cross-repository ticket has been split so the audiobook command and CoWatcher fixture contract have separate ownership and verification.

## Goal

Establish a bounded, private, local transcription contract without mixing sibling-repository runtime work into CoWatcher adapter implementation.

## Child Blocks

1. **3-2n-6D-1A — Audiobook transcribe-window Command And Runtime Proof:** Implement and prove the read-only command in `C:\Users\antho\Code\audiobook`.
2. **3-2n-6D-1B — CoWatcher Transcription Contract Fixtures:** Record only the sanitized versioned fixtures and boundary documentation needed by CoWatcher.

The repositories require separate branches, diffs, commits, and verification. Implement 6D-1A first, then 6D-1B. Do not implement this umbrella directly.

## Shared Constraints

- Maximum 60-second single-file window at explicit validated offsets.
- Local model only; no runtime download, cloud API, media mutation, transcript archive, or generic transcription framework.
- One bounded process per explicit command with CPU/resource limits, below-normal Windows priority, deterministic cleanup, and safe JSON errors.
- Private media/model/temp paths, raw stderr, stack traces, real audiobook text, and generated media never enter CoWatcher fixtures, logs, or commits.

## Exit Gate

Both child contracts pass their repository-specific deterministic gates, and 6D-1A records one explicitly authorized runtime canary with OS-observed resource evidence.
