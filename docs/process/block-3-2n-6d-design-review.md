# Block 3-2n-6D Design Review

> Review status: Pre-implementation review complete.
> Reviewed scope: 3-2n-6D umbrella and children 6D-1 through 6D-4.
> Intended outcome: A private, useful audiobook resume experience built from a bounded transcript near a trustworthy stopping position without noticeable service lag or source dishonesty.

## Outcome Verdict

The outcome is credible only after the work is split. One original block mixed an external Python/Whisper contract, Windows resource controls, SQLite job orchestration, ingestion semantics, privacy policy, and a dashboard redesign. A first three-child draft still overloaded its backend child with adapter, schema, ingestion, runtime, operations, and rollout. The final four-child sequence isolates those blast radii and makes rollback/test ownership clear.

The current stack can plausibly produce a short verbatim stopping-point excerpt. It cannot currently produce a trustworthy paraphrased “what was happening” summary: `faster-whisper` performs speech recognition, and neither repository has an approved summarization model/provider. The corrected first release therefore promises an attributed excerpt plus chapter/position context. A semantic summary requires a later explicit provider/model decision and separate ticket.

## Quality Review Matrix

| Dimension | Finding | Resolution in tickets |
| --- | --- | --- |
| Clarity | “Stop” previously implied a live pause event, but CoWatcher polls Tautulli history rows. | Umbrella and 6D-3 define `history_stop_candidate` and forbid live-pause claims. |
| Scope | External transcription, adapter/state, worker rollout, and UI were too large for one turn; the first backend split remained oversized. | Split into 6D-1 external contract, 6D-2 adapter/state, 6D-3 worker/rollout, and 6D-4 modal. |
| Acceptance criteria | “Low CPU” and “no lag” were hardware-dependent and untestable as written. | Test concurrency/thread/priority/clip limits deterministically; record CPU, peak working set, wall time, watcher continuity, and dashboard responsiveness during canary without inventing a universal CPU percentage. |
| Assumptions | Python, ffmpeg, `faster-whisper`, model cache, process-priority support, stop timestamps, and offset units were inferred rather than proven. | 6D-1 requires runtime probes; 6D-3 preserves raw `stopped_at` separately and locks millisecond offset fixtures before clipping. |
| Risks | Private paths, copyrighted text, raw transcript, temp clips, and child errors could leak. | Trusted boundary, path-safe envelopes, 20-word local excerpt, no full transcript persistence, inert rendering, and cleanup gates. |
| Drift | A resume feature could become full-book transcription, cloud AI, search, or chapter repair. | Each ticket explicitly forbids those expansions and keeps independent enablement. |
| Dependencies | CoWatcher has a trusted proof adapter, but `audiobook` has no arbitrary-window command. | 6D-1 adds an additive tool-agnostic `transcribe-window` command before 6D-2 invokes anything. |
| Opportunities | Semantic summaries, multi-file mapping, and active-playback-aware scheduling could add value. | Record as follow-ups requiring separate evidence/tickets; do not smuggle them into this sequence. |
| Blast radius | Two repositories, SQLite, ingestion, PM2 runtime, CLI/tool contracts, and dashboard are touched. | Separate child ownership, separate cross-repo commits, additive schema/contracts, disabled rollout, and UI last. |
| Compatibility | Refactoring process execution could regress current chapter proof or legacy audiobook CLI parsing. | Keep proof/resume result types separate; shared runner only if content-agnostic; preserve `inspect`/`validate`/`resolve` and golden tests. |
| Edge cases | Silence, music, stop near zero/end, rewinds, repeats, multiple listeners, hidden users, stale revisions, completed books, and no direct offset were unspecified. | Child acceptance criteria now classify or test each family and fall back without invented context. |
| Security | Transcript text may contain HTML or instruction-like language; model loading may trigger network access. | No LLM/tool interpretation, escaped text-only rendering, local-files-only model policy, bounded output, no public mutation route. |
| Performance | Existing chapter Whisper uses `base`/CPU/int8 but beam size 5 and does not prove low-priority execution; ffmpeg extraction and cold model loading can also spike. | New command constrains ffmpeg and Whisper to one thread, applies below-normal priority before loading/extraction, uses low-search decoding and a 60-second clip, and records OS-observed cold-start resources. |
| Testability | Real Whisper output is nondeterministic and expensive for the block gate. | Fake model/adapter/clock for deterministic gates; real user-approved canary is separate and opt-in. |
| Reversibility | Coupling resume work to proof enablement could make rollback unsafe. | Separate flags/tables/runtime; disabling resume leaves ingestion, chapter truth, and modal fallback intact. |
| Sequencing | UI could be built against imagined fields, worker against an unstable external command, or resume UI into the obsolete Progress-only modal. | Complete 6E-1 through 6E-3 first, then hard order 6D-1 through 6D-4; umbrellas are never implemented directly. |
| Maintainability | Adding transcript behavior to `AudiobookProofAdapter` would mix domains. | 6D-2 owns a dedicated resume adapter; narrowly shared process runner only with proof regression coverage. |
| Overengineering | A local LLM, active-session API, generic transcription platform, or multi-file translator would multiply dependencies. | Excluded from the first sequence; the useful excerpt ships without them. |

## Flagged Findings And Specific Fixes

### 1. Paraphrased summary engine is missing

- **Problem:** Whisper returns transcript text, not a semantic summary. Calling a selected excerpt a paraphrase would be misleading and untestable.
- **Fix adopted:** 6D stores a maximum 20-word verbatim excerpt and combines it with deterministic chapter/position context.
- **Future split if desired:** Create a separate block only after choosing one of: local LLM with measured CPU/RAM, cloud model with explicit privacy/cost approval, or an extractive sentence-selection feature that is labeled as an excerpt rather than a summary.

### 2. Reliable live stoppage is not available

- **Problem:** Current ingestion polls `get_history`, normalizes `date`/`stopped`, and stores a history observation. It does not observe a live pause transition or active-session state.
- **Fix adopted:** Define eligibility from a source-backed history-session offset plus a 15-minute quiet/coalescing window. Do not display “paused at” or claim real-time detection.
- **Future split if needed:** Add Tautulli `get_activity` or Plex session events only if canary evidence shows history rows are too delayed or ambiguous.

### 3. Offset precision and media mapping are conditional

- **Problem:** Display progress can fall back to percentage and uses a seconds/milliseconds heuristic, but audio clipping requires an exact unit contract and correct file-local timeline. Multi-file manifests are currently unsupported for chapter proof.
- **Fix adopted:** Require direct raw Tautulli `view_offset`/`duration` under a tested millisecond contract, current revision, duration/percentage consistency, and one-file manifest. The clipping path does not reuse the display heuristic; percentage-only, ambiguous-unit, and multi-file cases never invoke Whisper.
- **Future split if needed:** Define and test track-local to book-global mapping before supporting multi-file editions.

### 3A. Existing `watched_at` is not a safe stop timestamp

- **Problem:** The current adapter sets `watched_at` from `date ?? stopped`, so a row containing both prefers `date`. Reinterpreting it as the stop time would corrupt quiet-window semantics.
- **Fix adopted:** 6D-3 adds an optional source `stopped_at` from raw Tautulli `stopped`, preserves legacy `watched_at`, and makes rows without explicit stop evidence ineligible.

### 4. Runtime availability is unproven

- **Problem:** `whisper_verify.py` imports `faster-whisper`, but repository source does not prove the configured Python interpreter, ffmpeg, model, or cache is usable by PM2.
- **Fix adopted:** 6D-1 includes explicit runtime/model probes and a canary. 6D-3 remains disabled until they pass.

### 5. CPU policy was underspecified

- **Problem:** CPU percentage depends on hardware, and below-normal process priority is not provided by the current adapter contract.
- **Fix adopted:** Make resource policy structural and observable: one inference thread, one worker, CPU int8, low-search decoding, below-normal priority, one bounded clip, one job/tick. Record canary CPU, peak working set, elapsed time, watcher poll continuity, and dashboard responsiveness.
- **Remaining limitation:** Without adding active-session monitoring, the system cannot guarantee the machine is otherwise idle. The tickets do not claim that guarantee.
- **Overengineering avoided:** The first release launches one bounded process per job. A resident model daemon is deferred unless measured cold-start cost proves it necessary.

### 6. Existing Whisper cleanup and output are not production contracts

- **Problem:** Current chapter verification uses temporary directories and best-effort cleanup while printing heard text for a repair CLI. That behavior is inappropriate for private background resume context.
- **Fix adopted:** 6D-1 requires a separate structured command with guaranteed cleanup tests, bounded JSON stdout, no transcript logging, and no sidecars.

### 7. Model loading may cause network or memory spikes

- **Problem:** Constructing a model by name may download it if absent; a child model process can consume substantial memory outside the Node parent's PM2 memory limit.
- **Fix adopted:** No service-time downloads, preinstalled model requirement, one child only, peak-working-set canary, and disabled rollout if resource policy cannot be demonstrated.
- **Ambiguity retained intentionally:** No universal RAM threshold is chosen before measuring this machine. Record the measured peak and make the enablement decision explicit.

### 8. Copyright and private household content need a display policy

- **Problem:** A transcript is copyrighted/private content and could spread through logs, exports, screenshots, or tests.
- **Fix adopted:** Persist/display no more than 20 words, localhost visible-listener context only, no full transcript, no generic export/copy feature, no real text in fixtures, and no transcript in audit/tool/log output.

### 9. Transcript content is untrusted data

- **Problem:** Speech may produce HTML, URLs, or instruction-like strings. A later AI feature could treat that as prompt input.
- **Fix adopted:** 6D-4 renders inert escaped text. This sequence has no summarizing LLM or tool execution over transcript content.

### 10. Candidate publication must not endanger ingestion

- **Problem:** Coupling a new job insert to history ingestion could make an optional feature disrupt the primary evidence pipeline.
- **Fix adopted:** Observation storage remains authoritative; candidate publication is idempotent and independently recoverable through a bounded reconciliation pass.

## Edge-Case Expectations

- **Silence/music/no speech:** terminal safe no-context result; modal omits the card.
- **Stop before 60 seconds:** clip start becomes zero; stop itself is never moved.
- **Stop beyond duration or duration drift:** no invocation; safe classification.
- **Stop at/near a chapter boundary:** attribute using the same verified offset rule as Progress; never transcribe future audio to make the sentence prettier.
- **Rewind or repeat:** a materially different 30-second bucket may create a new context; same-bucket repeats dedupe.
- **Rapid resume:** newer observation supersedes pending work; stale running output cannot activate.
- **Completed audiobook:** no resume-transcription job; existing completed UI remains authoritative.
- **Multiple listeners:** independent keys/results and explicit modal attribution.
- **Hidden listener:** no processing in the first release and no dashboard projection.
- **Media replacement:** revision mismatch hides/supersedes old context without deleting historical playback evidence.
- **PM2 restart:** lease recovery and idempotent reconciliation; no duplicate child process.
- **Large backlog:** supersede/coalesce, one job/tick, bounded status output; no catch-up burst.
- **Missing model/runtime:** feature remains disabled/terminal-safe; normal progress works.

## Sequencing And Exit Decisions

1. Finish the existing 5D-3 recurring-worker rollout gate.
2. Implement 6E-1 through 6E-3 so one canonical detail workspace and shared Audiobook presenter exist before resume UI work.
3. Implement 6D-1 in the `audiobook` repository and its CoWatcher fixtures; verify both repositories independently.
4. Review measured runtime, CPU, peak working set, cleanup, and command contract. Stop if the single-thread/below-normal/local-only policy is not real.
5. Implement 6D-2 adapter/state with fake-process and fake-clock coverage; do not connect automatic execution.
6. Implement 6D-3 stop ingestion/worker/operations, then run one backed-up explicit canary while the dashboard remains usable.
7. Implement 6D-4 only against persisted fixture/state proven by 6D-3 and the shared Audiobook presenter proven by 6E-3.
8. Run the mandatory deterministic block gate for every child and the live dashboard gate after deployed dashboard/runtime changes.

## Deferred Opportunities Requiring New Tickets

- A true semantic `Where you left off` summary after choosing and approving a summarization model/provider.
- Active-playback-aware scheduling if history-only quiet windows prove insufficient.
- Multi-file audiobook offset translation.
- User controls for deleting/regenerating private resume context, which would require explicit destructive/write permissions and audit design.
- Better language-specific sentence selection after multilingual canary evidence.

None of these opportunities is required to validate the first useful outcome: a private, attributed, low-resource stopping-point excerpt integrated into the audiobook resume modal.
