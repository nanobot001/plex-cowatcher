# Architecture

System structure, component boundaries, integrations, and data flow live here.

## Trusted Audiobook Proof Boundary

`AudiobookProofAdapter` is the only CoWatcher boundary permitted to invoke the separate read-only `audiobook` JSON commands. The executable and script are configured through `AUDIOBOOK_PROOF_EXECUTABLE` and `AUDIOBOOK_PROOF_SCRIPT`; the child working directory is derived from the script path. Whisper additionally requires `AUDIOBOOK_PROOF_WHISPER_ENABLED=true` and an explicit per-run request.

The adapter runs `inspect`, then `validate` for embedded chapters, and only runs `resolve` when embedded evidence is missing or unusable. Valid finite ordered embedded starts are authoritative navigation evidence: CoWatcher reconstructs each end from the next start and ends the final chapter at the inspected media duration. Raw container ends, short-chapter counts, and aggregate duration-gap checks are advisory; invalid starts are never clamped and carry only an allowlisted rejection warning into fallback diagnostics. The adapter accepts the unversioned envelope as contract version 1, rejects unsupported explicit versions, bounds process output and runtime, and returns only allowlisted safe failures or sanitized chapter candidates. Raw paths, tags, stdout, stderr, and external warning text never cross the adapter result boundary.

Only clean embedded chapters, high-confidence Audnexus chapters, or explicitly requested Whisper-verified chapters can call the 5D-1 activation seam. Medium/low-confidence results remain bounded non-active diagnostics. Queue consumption, retries, scheduling, and runtime enablement belong to 5D-3.
