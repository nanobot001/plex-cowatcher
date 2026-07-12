# Block 3-2n-5d-2A: Embedded Chapter Timeline Normalization

> Status: Planned.
> Result: Not implemented.
> Notes: Corrective adapter block discovered during the disabled 5D-3 Eric canary. This block must pass before the 5D-3 live rollout resumes.

## Goal

Make CoWatcher use valid embedded audiobook chapter navigation evidence without trusting malformed container end timestamps. Normalize safe ordered chapter starts into revision-bound ranges, preserve the external `audiobook` project as the read-only discovery authority, and avoid unnecessary fallback to lower-confidence resolution passes.

## Failure Evidence And Authority

- The live canary for audiobook ID 34 (`Eric`) found 57 embedded chapters through `inspect`.
- Its chapter starts were ordered, non-negative, and within the media duration, but the final supplied end was exactly one hour after the last start and about 59 minutes beyond the file duration.
- The standalone `audiobook` command treats more than one embedded chapter as usable, while CoWatcher currently requires zero short chapters and a validator aggregate-duration gap no greater than 10 seconds.
- CoWatcher therefore discarded usable embedded starts, invoked `resolve`, received 50 low-confidence silence candidates, and terminally classified the job as `LOW_CONFIDENCE`.
- This block refines 5D-2 only for embedded timeline normalization. The existing 5D-2 privacy, process isolation, output bounds, timeout, contract-version, ASIN, and resolved-source confidence controls remain authoritative.

## Dependencies And Entry Gate

- Blocks 3-2n-5d-1, 3-2n-5d-2, and the code portion of 3-2n-5d-3 are implemented and verified.
- Automatic proof remains disabled throughout implementation and canary recovery.
- The live SQLite backup made before the first canary remains available.
- Read the tool-facing project documents required by `AGENTS.md` before changing adapter results, worker diagnostics, audit output, or CLI behavior.

## Scope

- For embedded chapters, treat sanitized chapter start positions as the authoritative navigation evidence.
- Require at least two finite integer starts that are non-negative, strictly increasing, and less than the inspected media duration.
- Require bounded non-empty chapter titles and reject malformed, duplicate, unordered, negative, or out-of-range starts.
- Rebuild each chapter end from the next chapter's start and set the final chapter end to the inspected media duration.
- Require every normalized range to be positive, ordered, contiguous, non-overlapping, and within the media duration.
- Continue requiring the inspected media duration to match the manifest duration within the existing 10-second tolerance.
- Keep the external `validate` command and validate its version-1 envelope, but treat `short_chapters` and aggregate `duration_gap_s` as advisory when the sanitized starts normalize safely.
- Skip `resolve` when normalized embedded chapters pass. Invoke `resolve` only when embedded chapters are absent or their start evidence is genuinely unusable.
- Preserve an allowlisted, bounded reason when embedded evidence is rejected before a later resolver result, so a final `LOW_CONFIDENCE` classification does not conceal the earlier decision.
- Route accepted normalized chapters through the existing 5D-1 atomic activation service with source `embedded`; do not add another write path.

## Out Of Scope

- Modifying the separate `audiobook` project or its standalone Pass 1 behavior.
- Rewriting, remuxing, repairing, or embedding chapters into private media files.
- Enabling Whisper or weakening Audnexus/Whisper confidence requirements.
- Adding dependencies, database migrations, public HTTP mutations, or household repair UI.
- Supporting multi-file global chapter timelines.
- Enabling the recurring proof worker before the corrected canary and live verification pass.

## Compatibility, Safety, And Drift Controls

- Preserve the existing external command order: `inspect`, then `validate` when embedded chapters exist, and `resolve` only when embedded evidence cannot normalize safely.
- Do not expose private paths, raw tags, child stdout/stderr, external diagnostics, or media filenames through logs, audits, health, CLI output, or tests.
- Do not accept an out-of-range chapter start by clamping it. Only reconstructed ends may replace untrusted supplied end values.
- Do not treat "more than one embedded chapter" alone as sufficient proof; all normalized start and duration checks must pass.
- Do not re-prove unchanged revisions that are already verified.
- Keep low-confidence resolved candidates non-active.
- Preserve current manual chapter import behavior and the legacy active-cache projection.

## Likely Files Or Areas

- `src/service/audiobookProofAdapter.ts`
- `src/service/audiobookProofWorkerService.ts`
- `tests/run-tests.mjs`
- `docs/blocks/block-3-2n-5d-3-durable-proof-worker-and-rollout.md`
- Tool/audit documentation only if the structured diagnostic contract changes

## Deterministic Regression Coverage

Add an Eric-shaped fake adapter fixture with:

- 57 ordered embedded starts;
- five positive chapters shorter than 30 seconds;
- a final supplied end one hour after the final start and beyond the media duration;
- an inspected duration matching the manifest duration.

Verify that:

- exactly 57 normalized embedded chapters reach activation;
- each end equals the next start and the final end equals the actual media duration;
- every normalized range is positive, contiguous, ordered, non-overlapping, and in range;
- `resolve` is not invoked after normalized embedded evidence succeeds;
- source remains `embedded` and the activation stays media-revision-bound.

Also cover single, duplicate, unordered, negative, non-integer, missing-title, and out-of-range starts; manifest-duration mismatch; malformed validation envelopes; invalid embedded evidence followed by safe resolution; low-confidence fallback rejection; and privacy-safe bounded diagnostics.

## Acceptance Criteria

- Valid embedded starts activate even when supplied end metadata is malformed or some legitimate chapters are shorter than 30 seconds.
- Malformed starts cannot activate and are never silently clamped.
- The final normalized chapter ends at the inspected media duration, within the existing manifest-duration tolerance.
- Successful embedded normalization stops before `resolve`.
- A later resolver outcome retains an allowlisted indication that embedded evidence was rejected without exposing raw details.
- Existing high-confidence Audnexus, Whisper-verified, timeout, output-bound, process-tree termination, and redaction tests remain compatible.
- No schema migration, media write, external-project edit, or recurring-worker enablement occurs.
- `npm run verify:block` passes before this block is marked implemented.

## Controlled Live Canary Recovery

After deterministic verification passes:

1. Keep `AUDIOBOOK_PROOF_ENABLED=false`.
2. Rebuild and restart the deployed service with the trusted adapter configuration.
3. Confirm proof health is disabled, no lease is active, and the existing backup is still available.
4. Explicitly requeue only Eric's existing proof job through the confirmed, audited CLI path.
5. Run one confirmed canary for audiobook ID 34.
6. Verify the job is `succeeded` with safe code `VERIFIED`, source `embedded`, and 57 active revision-bound chapters.
7. Verify the final cached boundary equals the media duration and Progress reports verified chapter evidence for the matching revision.
8. Confirm audit/log redaction and run `npm run verify:live-dashboard`.
9. Record the canary result in this block and 5D-3 before considering recurring-worker enablement.

## Verification

- Targeted deterministic adapter and worker tests during implementation.
- `npm run verify:block`
- Controlled Eric canary while automatic proof remains disabled.
- `npm run verify:live-dashboard` after deployed rebuild/restart.

## Reversibility

- The code correction is reversible without a database rollback.
- Chapter activation continues to use the additive 5D-1 revision history and backward-compatible active projection.
- Reverting this block must not delete an activated chapter revision or corrupt the legacy cache; automatic proof remains disabled until a separate 5D-3 rollout decision.
