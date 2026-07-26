import { randomUUID } from "node:crypto";
import type { Db } from "../db/database.js";
import { appConfig } from "../utils/config.js";
import { AuditService } from "./auditService.js";
import { AudiobookChapterActivationService } from "./audiobookChapterActivationService.js";
import {
  AudiobookProofAdapter,
  type AudiobookProofInput,
  type AudiobookProofResult
} from "./audiobookProofAdapter.js";
import { buildGlobalAudiobookTimeline, type MultiFileTimelineItem } from "./audiobookMultiFileService.js";

const RUN_INTERVAL_MS = 15 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const RETRY_DELAYS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

type ProofAdapter = Pick<AudiobookProofAdapter, "proveAndActivate"> &
  Partial<Pick<AudiobookProofAdapter, "prove">>;
type JobState = "pending" | "running" | "retry_wait" | "succeeded" | "failed_terminal" | "unsupported_multi_file";

export interface ProofReevaluationTarget {
  audiobookId?: number;
  jobId?: number;
}

export interface ProofReevaluationCandidate {
  jobId: number;
  audiobookId: number;
  mediaRevision: string;
  state: "unsupported_multi_file";
  fileCount: number;
  itemCount: number;
  missingIdentityCount: number;
  missingPathCount: number;
  invalidDurationCount: number;
  decision: "requeue" | "unresolved";
  reason: "READY_FOR_MULTI_FILE_PROOF" | "MULTI_FILE_FEATURE_DISABLED" | "MULTI_FILE_MANIFEST_INCOMPLETE" | "SUPERSEDED_REVISION";
}

export interface ProofReevaluationResult {
  ok: true;
  dryRun: boolean;
  multiFileEnabled: boolean;
  candidates: ProofReevaluationCandidate[];
  requeuedCount: number;
  unresolvedCount: number;
}

export interface ProofRunResult {
  ok: true;
  status: "disabled" | "throttled" | "lease_held" | "idle" | "processed";
  jobId?: number;
  audiobookId?: number;
  state?: JobState;
  safeCode?: string;
  attemptCount?: number;
  nextRunAt?: string;
}

export class AudiobookProofWorkerService {
  private readonly audit: AuditService;
  private readonly activation: AudiobookChapterActivationService;

  constructor(
    private readonly db: Db,
    private readonly adapter: ProofAdapter = new AudiobookProofAdapter({
      executablePath: appConfig.AUDIOBOOK_PROOF_EXECUTABLE,
      scriptPath: appConfig.AUDIOBOOK_PROOF_SCRIPT,
      whisperEnabled: appConfig.AUDIOBOOK_PROOF_WHISPER_ENABLED
    }),
    private readonly enabled = appConfig.AUDIOBOOK_PROOF_ENABLED,
    private readonly now: () => Date = () => new Date(),
    private readonly multiFileEnabled = appConfig.AUDIOBOOK_PROOF_MULTI_FILE_ENABLED
  ) {
    this.audit = new AuditService(db);
    this.activation = new AudiobookChapterActivationService(db);
  }

  getStatus(limit = 20): {
    enabled: boolean;
    multiFileEnabled: boolean;
    counts: Record<JobState, number>;
    nextRunAt?: string;
    lastCompletedAt?: string;
    leaseActive: boolean;
    jobs: Array<{
      id: number;
      audiobookId: number;
      state: JobState;
      attemptCount: number;
      safeCode?: string;
      nextAttemptAt?: string;
      fileProgress?: { completed: number; total: number; failed: number };
    }>;
  } {
    const state = this.db.prepare("SELECT * FROM audiobook_proof_state WHERE id = 1").get() as any;
    const countRows = this.db.prepare("SELECT state, COUNT(*) AS count FROM audiobook_proof_jobs GROUP BY state").all() as any[];
    const counts = Object.fromEntries([
      "pending", "running", "retry_wait", "succeeded", "failed_terminal", "unsupported_multi_file"
    ].map((jobState) => [jobState, Number(countRows.find((row) => row.state === jobState)?.count ?? 0)])) as Record<JobState, number>;
    const jobs = this.db.prepare(`
      SELECT id, audiobook_id, media_revision, state, attempt_count, safe_result_code, next_attempt_at
      FROM audiobook_proof_jobs ORDER BY id DESC LIMIT ?
    `).all(Math.max(1, Math.min(50, Math.trunc(limit)))) as any[];
    return {
      enabled: this.enabled,
      multiFileEnabled: this.multiFileEnabled,
      counts,
      nextRunAt: state?.next_run_at ?? undefined,
      lastCompletedAt: state?.last_completed_at ?? undefined,
      leaseActive: Boolean(state?.lease_expires_at && Date.parse(state.lease_expires_at) > this.now().getTime()),
      jobs: jobs.map((job) => ({
        id: job.id,
        audiobookId: job.audiobook_id,
        state: job.state,
        attemptCount: job.attempt_count,
        safeCode: job.safe_result_code ?? undefined,
        nextAttemptAt: job.next_attempt_at ?? undefined,
        fileProgress: this.getFileProgress(job.audiobook_id, job.media_revision)
      }))
    };
  }

  previewCanary(audiobookId?: number): { ok: true; dryRun: true; eligibleJobId?: number; audiobookId?: number; reason?: string } {
    if (!this.multiFileEnabled) {
      const multiFile = this.db.prepare(`
        SELECT outbox.audiobook_id
        FROM audiobook_discovery_outbox outbox
        JOIN audiobook_media_revisions revision
          ON revision.audiobook_id = outbox.audiobook_id AND revision.media_revision = outbox.media_revision
        WHERE outbox.consumed_at IS NULL AND revision.manifest_status = 'unsupported_multi_file'
          AND (? IS NULL OR outbox.audiobook_id = ?)
        ORDER BY outbox.id LIMIT 1
      `).get(audiobookId ?? null, audiobookId ?? null) as any;
      if (multiFile) return { ok: true, dryRun: true, audiobookId: multiFile.audiobook_id, reason: "MULTI_FILE_FEATURE_DISABLED" };
    }
    const job = this.findEligibleJob(this.now(), audiobookId);
    if (job) return { ok: true, dryRun: true, eligibleJobId: job.id, audiobookId: job.audiobook_id };
    const outbox = this.db.prepare(`
      SELECT outbox.audiobook_id FROM audiobook_discovery_outbox outbox
      JOIN audiobook_books book ON book.id = outbox.audiobook_id
      JOIN audiobook_media_revisions revision
        ON revision.audiobook_id = outbox.audiobook_id AND revision.media_revision = outbox.media_revision
      WHERE outbox.consumed_at IS NULL AND book.current_media_revision = outbox.media_revision
        AND revision.manifest_status IN ('ready', 'unsupported_multi_file')
        AND (? IS NULL OR outbox.audiobook_id = ?)
      ORDER BY outbox.id LIMIT 1
    `).get(audiobookId ?? null, audiobookId ?? null) as any;
    return outbox
      ? { ok: true, dryRun: true, audiobookId: outbox.audiobook_id, reason: "OUTBOX_READY" }
      : { ok: true, dryRun: true, reason: "NO_ELIGIBLE_JOB" };
  }

  requeue(jobId: number, options: { apply: boolean; confirm: boolean }): { ok: true; dryRun: boolean; jobId: number; changed: boolean; state: string } {
    const row = this.db.prepare("SELECT id, state FROM audiobook_proof_jobs WHERE id = ?").get(jobId) as any;
    if (!row) throw new Error("PROOF_JOB_NOT_FOUND");
    if (!options.apply) return { ok: true, dryRun: true, jobId, changed: false, state: row.state };
    if (!options.confirm) throw new Error("PROOF_REQUEUE_CONFIRM_REQUIRED");
    const now = this.now().toISOString();
    const changed = this.db.prepare(`
      UPDATE audiobook_proof_jobs
      SET state = 'pending', attempt_count = 0, next_attempt_at = NULL,
          lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
          safe_result_code = NULL, diagnostic_source = NULL, diagnostic_confidence = NULL,
          diagnostic_chapter_count = NULL, diagnostic_warnings_json = '[]',
          updated_at = ?, started_at = NULL, completed_at = NULL
      WHERE id = ? AND state <> 'running'
        AND NOT (state = 'pending' AND attempt_count = 0 AND next_attempt_at IS NULL AND safe_result_code IS NULL)
    `).run(now, jobId);
    const applied = Number(changed.changes) > 0;
    if (applied) this.resetFileJobs(row.id, now);
    this.audit.record("audiobook_proof_requeued", "cli", applied ? "applied" : "skipped", { jobId });
    return { ok: true, dryRun: false, jobId, changed: applied, state: applied ? "pending" : row.state };
  }

  reevaluateUnsupported(
    target: ProofReevaluationTarget,
    options: { apply: boolean; confirm: boolean }
  ): ProofReevaluationResult {
    if (!Number.isInteger(target.audiobookId ?? null) && !Number.isInteger(target.jobId ?? null)) {
      throw new Error("PROOF_REEVALUATION_TARGET_REQUIRED");
    }
    const candidates = this.findUnsupportedReevaluationCandidates(target);
    if (!options.apply) {
      return {
        ok: true,
        dryRun: true,
        multiFileEnabled: this.multiFileEnabled,
        candidates,
        requeuedCount: 0,
        unresolvedCount: candidates.filter((candidate) => candidate.decision === "unresolved").length
      };
    }
    if (!options.confirm) throw new Error("PROOF_REEVALUATION_CONFIRM_REQUIRED");

    let requeuedCount = 0;
    let unresolvedCount = 0;
    for (const candidate of candidates) {
      if (candidate.decision !== "requeue") {
        unresolvedCount++;
        this.audit.record("audiobook_proof_reevaluated", "cli", "unresolved", {
          jobId: candidate.jobId,
          audiobookId: candidate.audiobookId,
          reason: candidate.reason
        });
        continue;
      }
      const result = this.requeue(candidate.jobId, { apply: true, confirm: true });
      if (result.changed) {
        requeuedCount++;
        this.audit.record("audiobook_proof_reevaluated", "cli", "requeued", {
          jobId: candidate.jobId,
          audiobookId: candidate.audiobookId,
          reason: candidate.reason
        });
      } else {
        unresolvedCount++;
      }
    }
    return { ok: true, dryRun: false, multiFileEnabled: this.multiFileEnabled, candidates, requeuedCount, unresolvedCount };
  }

  async runOnce(options: { force?: boolean; audiobookId?: number; now?: Date } = {}): Promise<ProofRunResult> {
    const now = options.now ?? this.now();
    if (!this.enabled && !options.force) return { ok: true, status: "disabled" };
    this.materializeOutbox(now, options.audiobookId);
    this.recoverExpiredJobs(now);
    const state = this.db.prepare("SELECT next_run_at FROM audiobook_proof_state WHERE id = 1").get() as any;
    if (!options.force && state?.next_run_at && Date.parse(state.next_run_at) > now.getTime()) {
      return { ok: true, status: "throttled", nextRunAt: state.next_run_at };
    }
    const owner = randomUUID();
    if (!this.acquireLease(owner, now)) return { ok: true, status: "lease_held" };
    let job: any;
    try {
      job = this.claimJob(owner, now, options.audiobookId);
      if (!job) {
        this.finishCycle(owner, now, null);
        return { ok: true, status: "idle", nextRunAt: new Date(now.getTime() + RUN_INTERVAL_MS).toISOString() };
      }
      const heartbeat = setInterval(() => this.renewLease(owner, job.id, this.now()), HEARTBEAT_MS);
      heartbeat.unref?.();
      try {
        const result = await this.processClaimedJob(job, now);
        const completedAt = options.now ?? this.now();
        this.finishCycle(owner, completedAt, job.id);
        return result;
      } finally {
        clearInterval(heartbeat);
      }
    } catch (error) {
      if (job) this.finishUnexpectedFailure(job, now);
      this.finishCycle(owner, options.now ?? this.now(), job?.id ?? null);
      const finalJob = job ? this.db.prepare("SELECT state, safe_result_code FROM audiobook_proof_jobs WHERE id = ?").get(job.id) as any : null;
      return {
        ok: true,
        status: "processed",
        jobId: job?.id,
        audiobookId: job?.audiobook_id,
        state: finalJob?.state ?? "retry_wait",
        safeCode: finalJob?.safe_result_code ?? "PROOF_WORKER_FAILURE",
        attemptCount: job?.attempt_count
      };
    }
  }

  materializeOutbox(now = this.now(), audiobookId?: number): number {
    const rows = this.db.prepare(`
      SELECT outbox.id, outbox.audiobook_id, outbox.media_revision, outbox.manifest_status,
             outbox.safe_outcome_code, book.current_media_revision, revision.manifest_status AS revision_status
      FROM audiobook_discovery_outbox outbox
      JOIN audiobook_books book ON book.id = outbox.audiobook_id
      LEFT JOIN audiobook_media_revisions revision
        ON revision.audiobook_id = outbox.audiobook_id AND revision.media_revision = outbox.media_revision
      WHERE outbox.consumed_at IS NULL
        AND (? IS NULL OR outbox.audiobook_id = ?)
      ORDER BY outbox.id LIMIT 100
    `).all(audiobookId ?? null, audiobookId ?? null) as any[];
    if (rows.length === 0) return 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      let materialized = 0;
      for (const row of rows) {
        let state: JobState = "pending";
        let code: string | null = null;
        if (row.current_media_revision !== row.media_revision) {
          state = "failed_terminal"; code = "SUPERSEDED_REVISION";
        } else if (!row.revision_status || row.revision_status === "unavailable") {
          state = "failed_terminal"; code = "MANIFEST_UNAVAILABLE";
        } else if (row.revision_status === "unsupported_multi_file") {
          if (this.multiFileEnabled) state = "pending";
          else { state = "unsupported_multi_file"; code = "MULTI_FILE_FEATURE_DISABLED"; }
        }
        const inserted = this.db.prepare(`
          INSERT OR IGNORE INTO audiobook_proof_jobs
            (audiobook_id, media_revision, outbox_id, state, safe_result_code, created_at, updated_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(row.audiobook_id, row.media_revision, row.id, state, code, now.toISOString(), now.toISOString(),
          state === "pending" ? null : now.toISOString());
        materialized += Number(inserted.changes);
        const job = this.db.prepare(`SELECT id FROM audiobook_proof_jobs WHERE audiobook_id = ? AND media_revision = ?`)
          .get(row.audiobook_id, row.media_revision);
        if (job) {
          if (state === "pending") this.ensureFileJobs(row.audiobook_id, row.media_revision, now);
          this.db.prepare("UPDATE audiobook_discovery_outbox SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL")
            .run(now.toISOString(), row.id);
        }
      }
      this.db.exec("COMMIT");
      return materialized;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private async processClaimedJob(job: any, now: Date): Promise<ProofRunResult> {
    const verified = this.db.prepare(`
      SELECT 1 FROM audiobook_books book
      JOIN audiobook_chapter_revisions chapter ON chapter.id = book.active_chapter_revision_id
      WHERE book.id = ? AND book.current_media_revision = ?
        AND chapter.media_revision = ? AND chapter.source_status = 'active'
    `).get(job.audiobook_id, job.media_revision, job.media_revision);
    if (verified) return this.completeJob(job, now, "succeeded", "ALREADY_VERIFIED");

    const evidence = this.db.prepare(`
      SELECT book.asin, book.current_media_revision, revision.manifest_status,
             revision.track_count, revision.file_count, revision.total_duration_ms,
             item.private_file_path, item.duration_ms
      FROM audiobook_books book
      JOIN audiobook_media_revisions revision
        ON revision.audiobook_id = book.id AND revision.media_revision = ?
      LEFT JOIN audiobook_media_revision_items item
        ON item.revision_id = revision.id AND item.item_order = 0
      WHERE book.id = ?
    `).get(job.media_revision, job.audiobook_id) as any;
    if (evidence?.current_media_revision !== job.media_revision) {
      return this.completeJob(job, now, "failed_terminal", "SUPERSEDED_REVISION");
    }
    if (!evidence || evidence.manifest_status === "unavailable" ||
        (Number(evidence.file_count) <= 1 && !evidence.private_file_path)) {
      return this.completeJob(job, now, "failed_terminal", "MANIFEST_UNAVAILABLE");
    }
    if (evidence.file_count > 1 || evidence.manifest_status === "unsupported_multi_file") {
      if (!this.multiFileEnabled) return this.completeJob(job, now, "unsupported_multi_file", "MULTI_FILE_FEATURE_DISABLED");
      return this.processMultiFileJob(job, evidence, now);
    }
    if (evidence.track_count !== 1 || evidence.file_count !== 1) {
      return this.completeJob(job, now, "failed_terminal", "UNSUPPORTED_MEDIA_LAYOUT");
    }
    const proofInput: AudiobookProofInput = {
      privateFilePath: evidence.private_file_path,
      durationMs: Number(evidence.total_duration_ms ?? evidence.duration_ms),
      asin: evidence.asin ?? undefined,
      whisper: appConfig.AUDIOBOOK_PROOF_WHISPER_ENABLED
    };
    const result = await this.adapter.proveAndActivate(proofInput, {
      audiobookId: job.audiobook_id,
      mediaRevision: job.media_revision,
      activatedAt: now.toISOString()
    }, (input) => this.activation.activate(input));
    return this.handleProofResult(job, result, now);
  }

  private async processMultiFileJob(job: any, evidence: any, now: Date): Promise<ProofRunResult> {
    if (!this.adapter.prove) return this.completeJob(job, now, "failed_terminal", "MULTI_FILE_ADAPTER_UNAVAILABLE");
    this.ensureFileJobs(job.audiobook_id, job.media_revision, now);
    const fileJob = this.claimFileJob(job.audiobook_id, job.media_revision, job.lease_owner, now);
    if (fileJob) {
      if (!fileJob.private_file_path || Number(fileJob.duration_ms) <= 0) {
        this.failFileJob(fileJob, "MANIFEST_UNAVAILABLE", null, now);
        return this.completeJob(job, now, "failed_terminal", "MULTI_FILE_MANIFEST_UNAVAILABLE");
      }
      const result = await this.adapter.prove({
        privateFilePath: fileJob.private_file_path,
        durationMs: Number(fileJob.duration_ms),
        asin: evidence.asin ?? undefined,
        whisper: appConfig.AUDIOBOOK_PROOF_WHISPER_ENABLED
      });
      if (result.status === "activatable") {
        this.completeFileJob(fileJob, result, now);
        return this.continueJob(job, now, "FILE_PROOF_PROGRESS");
      }
      if (result.status === "diagnostic") {
        this.failFileJob(fileJob, result.code, result.diagnostic, now);
        return this.completeJob(job, now, "failed_terminal", `MULTI_FILE_${result.code}`);
      }
      if ((result.retryable || isWorkerTransient(result.code)) && fileJob.attempt_count < 5) {
        const delay = RETRY_DELAYS_MS[Math.min(fileJob.attempt_count - 1, RETRY_DELAYS_MS.length - 1)]!;
        this.retryFileJob(fileJob, result.code, new Date(now.getTime() + delay), now);
        return this.retryJob(job, now, `FILE_${result.code}`, delay);
      }
      this.failFileJob(fileJob, result.code, null, now);
      return this.completeJob(job, now, "failed_terminal", `MULTI_FILE_${result.code}`);
    }

    const files = this.db.prepare(`
      SELECT file_jobs.*, item.private_file_path, item.duration_ms, item.rating_key, item.guid, item.stable_identity
      FROM audiobook_proof_file_jobs file_jobs
      JOIN audiobook_media_revision_items item ON item.id = file_jobs.revision_item_id
      WHERE file_jobs.audiobook_id = ? AND file_jobs.media_revision = ?
      ORDER BY file_jobs.item_order
    `).all(job.audiobook_id, job.media_revision) as any[];
    const failed = files.find((file) => file.state === "failed_terminal");
    if (failed) return this.completeJob(job, now, "failed_terminal", failed.safe_result_code ?? "MULTI_FILE_PROOF_FAILED");
    if (files.length === 0 || files.some((file) => file.state !== "succeeded")) {
      return this.retryJob(job, now, "FILE_PROOF_WAITING", RETRY_DELAYS_MS[0]!);
    }

    const items: MultiFileTimelineItem[] = files.map((file) => ({
      order: file.item_order,
      stableIdentity: file.stable_identity,
      ratingKey: file.rating_key,
      guid: file.guid,
      durationMs: file.duration_ms
    }));
    const candidates = files.map((file) => ({
      chapters: JSON.parse(file.chapters_json ?? "[]"),
      sourceType: file.source_type,
      confidence: Number(file.confidence ?? 0),
      warnings: JSON.parse(file.warnings_json ?? "[]")
    }));
    const timeline = buildGlobalAudiobookTimeline(items, candidates);
    if (!timeline.ok) return this.completeJob(job, now, "failed_terminal", `MULTI_FILE_${timeline.code}`);
    this.activation.activate({
      audiobookId: job.audiobook_id,
      mediaRevision: job.media_revision,
      chapters: timeline.timeline.chapters,
      sourceType: timeline.timeline.sourceType,
      sourceStatus: "active",
      confidence: timeline.timeline.confidence,
      contractVersion: 1,
      warnings: timeline.timeline.warnings,
      activatedAt: now.toISOString()
    });
    return this.completeJob(job, now, "succeeded", "VERIFIED_MULTI_FILE");
  }

  private handleProofResult(job: any, result: AudiobookProofResult, now: Date): ProofRunResult {
    if (result.status === "activatable") return this.completeJob(job, now, "succeeded", "VERIFIED");
    if (result.status === "diagnostic") {
      this.db.prepare(`
        UPDATE audiobook_proof_jobs SET state = 'failed_terminal', safe_result_code = ?,
          diagnostic_source = ?, diagnostic_confidence = ?, diagnostic_chapter_count = ?,
          diagnostic_warnings_json = ?, completed_at = ?, updated_at = ?,
          lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
        WHERE id = ?
      `).run(result.code, result.diagnostic.source, result.diagnostic.confidence,
        result.diagnostic.chapterCount, JSON.stringify(result.diagnostic.warnings), now.toISOString(), now.toISOString(), job.id);
      this.audit.record("audiobook_proof_completed", "worker", "failed_terminal", { jobId: job.id, code: result.code, attemptCount: job.attempt_count });
      return processed(job, "failed_terminal", result.code);
    }
    if ((result.retryable || isWorkerTransient(result.code)) && job.attempt_count < 5) {
      const delay = RETRY_DELAYS_MS[Math.min(job.attempt_count - 1, RETRY_DELAYS_MS.length - 1)]!;
      this.db.prepare(`
        UPDATE audiobook_proof_jobs SET state = 'retry_wait', next_attempt_at = ?, safe_result_code = ?,
          updated_at = ?, lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
        WHERE id = ?
      `).run(new Date(now.getTime() + delay).toISOString(), result.code, now.toISOString(), job.id);
      this.audit.record("audiobook_proof_completed", "worker", "retry_wait", { jobId: job.id, code: result.code, attemptCount: job.attempt_count });
      return processed(job, "retry_wait", result.code);
    }
    return this.completeJob(job, now, "failed_terminal", result.code);
  }

  private completeJob(job: any, now: Date, state: Exclude<JobState, "pending" | "running" | "retry_wait">, code: string): ProofRunResult {
    this.db.prepare(`
      UPDATE audiobook_proof_jobs SET state = ?, safe_result_code = ?, completed_at = ?, updated_at = ?,
        next_attempt_at = NULL, lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ?
    `).run(state, code, now.toISOString(), now.toISOString(), job.id);
    this.audit.record("audiobook_proof_completed", "worker", state, { jobId: job.id, code, attemptCount: job.attempt_count });
    return processed(job, state, code);
  }

  private recoverExpiredJobs(now: Date): void {
    this.db.prepare(`
      UPDATE audiobook_proof_jobs
      SET state = CASE WHEN attempt_count >= 5 THEN 'failed_terminal' ELSE 'retry_wait' END,
          safe_result_code = 'LEASE_EXPIRED', next_attempt_at = CASE WHEN attempt_count >= 5 THEN NULL ELSE ? END,
          completed_at = CASE WHEN attempt_count >= 5 THEN ? ELSE NULL END,
          lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ?
      WHERE state = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
    `).run(now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString());
    this.db.prepare(`
      UPDATE audiobook_proof_file_jobs
      SET state = CASE WHEN attempt_count >= 5 THEN 'failed_terminal' ELSE 'retry_wait' END,
          safe_result_code = 'LEASE_EXPIRED',
          next_attempt_at = CASE WHEN attempt_count >= 5 THEN NULL ELSE ? END,
          completed_at = CASE WHEN attempt_count >= 5 THEN ? ELSE NULL END,
          lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ?
      WHERE state = 'running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
    `).run(now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString());
  }

  private acquireLease(owner: string, now: Date): boolean {
    const changed = this.db.prepare(`
      UPDATE audiobook_proof_state SET lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?
      WHERE id = 1 AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)
    `).run(owner, new Date(now.getTime() + LEASE_MS).toISOString(), now.toISOString(), now.toISOString());
    return Number(changed.changes) > 0;
  }

  private claimJob(owner: string, now: Date, audiobookId?: number): any {
    const job = this.findEligibleJob(now, audiobookId);
    if (!job) return null;
    const changed = this.db.prepare(`
      UPDATE audiobook_proof_jobs SET state = 'running', attempt_count = attempt_count + 1,
        lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?, started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ? AND state IN ('pending','retry_wait')
    `).run(owner, new Date(now.getTime() + LEASE_MS).toISOString(), now.toISOString(), now.toISOString(), now.toISOString(), job.id);
    if (Number(changed.changes) === 0) return null;
    this.db.prepare("UPDATE audiobook_proof_state SET current_job_id = ? WHERE id = 1 AND lease_owner = ?").run(job.id, owner);
    return this.db.prepare("SELECT * FROM audiobook_proof_jobs WHERE id = ?").get(job.id);
  }

  private findEligibleJob(now: Date, audiobookId?: number): any {
    return this.db.prepare(`
      SELECT jobs.*,
        (
          SELECT MAX(playback.watched_at)
          FROM content_catalog catalog
          JOIN playback_observations playback ON playback.rating_key = catalog.rating_key
          WHERE catalog.audiobook_id = jobs.audiobook_id
        ) AS latest_playback_at
      FROM audiobook_proof_jobs jobs
      WHERE jobs.state IN ('pending','retry_wait')
        AND (jobs.next_attempt_at IS NULL OR jobs.next_attempt_at <= ?)
        AND (? IS NULL OR jobs.audiobook_id = ?)
      ORDER BY latest_playback_at IS NULL, latest_playback_at DESC, jobs.id
      LIMIT 1
    `).get(now.toISOString(), audiobookId ?? null, audiobookId ?? null);
  }

  private findUnsupportedReevaluationCandidates(target: ProofReevaluationTarget): ProofReevaluationCandidate[] {
    const rows = this.db.prepare(`
      SELECT jobs.id, jobs.audiobook_id, jobs.media_revision,
             revision.file_count, revision.manifest_status,
             book.current_media_revision,
             COUNT(items.id) AS item_count,
             SUM(CASE WHEN items.stable_identity IS NULL OR items.stable_identity = '' THEN 1 ELSE 0 END) AS missing_identity_count,
             SUM(CASE WHEN items.private_file_path IS NULL OR items.private_file_path = '' THEN 1 ELSE 0 END) AS missing_path_count,
             SUM(CASE WHEN items.duration_ms IS NULL OR items.duration_ms <= 0 THEN 1 ELSE 0 END) AS invalid_duration_count
      FROM audiobook_proof_jobs jobs
      JOIN audiobook_books book ON book.id = jobs.audiobook_id
      LEFT JOIN audiobook_media_revisions revision
        ON revision.audiobook_id = jobs.audiobook_id AND revision.media_revision = jobs.media_revision
      LEFT JOIN audiobook_media_revision_items items ON items.revision_id = revision.id
      WHERE jobs.state = 'unsupported_multi_file'
        AND (? IS NULL OR jobs.audiobook_id = ?)
        AND (? IS NULL OR jobs.id = ?)
      GROUP BY jobs.id, jobs.audiobook_id, jobs.media_revision,
               revision.file_count, revision.manifest_status, book.current_media_revision
      ORDER BY jobs.id
    `).all(
      target.audiobookId ?? null,
      target.audiobookId ?? null,
      target.jobId ?? null,
      target.jobId ?? null
    ) as any[];

    return rows.map((row) => {
      const fileCount = Number(row.file_count ?? 0);
      const itemCount = Number(row.item_count ?? 0);
      const missingIdentityCount = Number(row.missing_identity_count ?? 0);
      const missingPathCount = Number(row.missing_path_count ?? 0);
      const invalidDurationCount = Number(row.invalid_duration_count ?? 0);
      let reason: ProofReevaluationCandidate["reason"];
      let decision: ProofReevaluationCandidate["decision"] = "unresolved";
      if (row.current_media_revision !== row.media_revision) {
        reason = "SUPERSEDED_REVISION";
      } else if (row.manifest_status !== "unsupported_multi_file" || fileCount <= 1 || itemCount !== fileCount ||
                 missingIdentityCount > 0 || missingPathCount > 0 || invalidDurationCount > 0) {
        reason = "MULTI_FILE_MANIFEST_INCOMPLETE";
      } else if (!this.multiFileEnabled) {
        reason = "MULTI_FILE_FEATURE_DISABLED";
      } else {
        reason = "READY_FOR_MULTI_FILE_PROOF";
        decision = "requeue";
      }
      return {
        jobId: Number(row.id),
        audiobookId: Number(row.audiobook_id),
        mediaRevision: row.media_revision,
        state: "unsupported_multi_file",
        fileCount,
        itemCount,
        missingIdentityCount,
        missingPathCount,
        invalidDurationCount,
        decision,
        reason
      };
    });
  }

  private continueJob(job: any, now: Date, code: string): ProofRunResult {
    this.db.prepare(`
      UPDATE audiobook_proof_jobs SET state = 'pending', safe_result_code = ?, next_attempt_at = NULL,
        updated_at = ?, lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ?
    `).run(code, now.toISOString(), job.id);
    this.audit.record("audiobook_proof_progress", "worker", "pending", { jobId: job.id, code, attemptCount: job.attempt_count });
    return processed(job, "pending", code);
  }

  private retryJob(job: any, now: Date, code: string, delayMs: number): ProofRunResult {
    this.db.prepare(`
      UPDATE audiobook_proof_jobs SET state = 'retry_wait', safe_result_code = ?, next_attempt_at = ?,
        updated_at = ?, lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ?
    `).run(code, new Date(now.getTime() + delayMs).toISOString(), now.toISOString(), job.id);
    this.audit.record("audiobook_proof_completed", "worker", "retry_wait", { jobId: job.id, code, attemptCount: job.attempt_count });
    return processed(job, "retry_wait", code);
  }

  private ensureFileJobs(audiobookId: number, mediaRevision: string, now: Date): void {
    const items = this.db.prepare(`
      SELECT id, item_order FROM audiobook_media_revision_items
      WHERE revision_id = (SELECT id FROM audiobook_media_revisions WHERE audiobook_id = ? AND media_revision = ?)
      ORDER BY item_order
    `).all(audiobookId, mediaRevision) as any[];
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO audiobook_proof_file_jobs
        (audiobook_id, media_revision, revision_item_id, item_order, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `);
    for (const item of items) insert.run(audiobookId, mediaRevision, item.id, item.item_order, now.toISOString(), now.toISOString());
  }

  private resetFileJobs(jobId: number, now: string): void {
    const job = this.db.prepare("SELECT audiobook_id, media_revision FROM audiobook_proof_jobs WHERE id = ?").get(jobId) as any;
    if (!job) return;
    this.db.prepare(`
      UPDATE audiobook_proof_file_jobs
      SET state = 'pending', attempt_count = 0, next_attempt_at = NULL, lease_owner = NULL,
          lease_expires_at = NULL, heartbeat_at = NULL, safe_result_code = NULL,
          diagnostic_source = NULL, diagnostic_confidence = NULL, diagnostic_chapter_count = NULL,
          diagnostic_warnings_json = '[]', source_type = NULL, confidence = NULL,
          chapters_json = NULL, warnings_json = '[]', started_at = NULL, completed_at = NULL, updated_at = ?
      WHERE audiobook_id = ? AND media_revision = ?
    `).run(now, job.audiobook_id, job.media_revision);
  }

  private claimFileJob(audiobookId: number, mediaRevision: string, owner: string, now: Date): any {
    const file = this.db.prepare(`
      SELECT file_jobs.*, item.private_file_path, item.duration_ms
      FROM audiobook_proof_file_jobs file_jobs
      JOIN audiobook_media_revision_items item ON item.id = file_jobs.revision_item_id
      WHERE file_jobs.audiobook_id = ? AND file_jobs.media_revision = ?
        AND file_jobs.state IN ('pending', 'retry_wait')
        AND (file_jobs.next_attempt_at IS NULL OR file_jobs.next_attempt_at <= ?)
      ORDER BY file_jobs.item_order
      LIMIT 1
    `).get(audiobookId, mediaRevision, now.toISOString()) as any;
    if (!file) return null;
    const changed = this.db.prepare(`
      UPDATE audiobook_proof_file_jobs
      SET state = 'running', attempt_count = attempt_count + 1, lease_owner = ?,
          lease_expires_at = ?, heartbeat_at = ?, started_at = COALESCE(started_at, ?), updated_at = ?
      WHERE id = ? AND state IN ('pending', 'retry_wait')
    `).run(owner, new Date(now.getTime() + LEASE_MS).toISOString(), now.toISOString(), now.toISOString(), now.toISOString(), file.id);
    return Number(changed.changes) ? this.db.prepare(`
      SELECT file_jobs.*, item.private_file_path, item.duration_ms
      FROM audiobook_proof_file_jobs file_jobs
      JOIN audiobook_media_revision_items item ON item.id = file_jobs.revision_item_id
      WHERE file_jobs.id = ?
    `).get(file.id) : null;
  }

  private completeFileJob(fileJob: any, result: Extract<AudiobookProofResult, { status: "activatable" }>, now: Date): void {
    this.db.prepare(`
      UPDATE audiobook_proof_file_jobs SET state = 'succeeded', safe_result_code = 'VERIFIED',
        source_type = ?, confidence = ?, chapters_json = ?, warnings_json = ?, completed_at = ?, updated_at = ?,
        lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, next_attempt_at = NULL
      WHERE id = ?
    `).run(result.candidate.sourceType, result.candidate.confidence, JSON.stringify(result.candidate.chapters),
      JSON.stringify(result.candidate.warnings), now.toISOString(), now.toISOString(), fileJob.id);
  }

  private retryFileJob(fileJob: any, code: string, nextAttempt: Date, now: Date): void {
    this.db.prepare(`
      UPDATE audiobook_proof_file_jobs SET state = 'retry_wait', safe_result_code = ?, next_attempt_at = ?, updated_at = ?,
        lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ?
    `).run(code, nextAttempt.toISOString(), now.toISOString(), fileJob.id);
  }

  private failFileJob(fileJob: any, code: string, diagnostic: any, now: Date): void {
    this.db.prepare(`
      UPDATE audiobook_proof_file_jobs SET state = 'failed_terminal', safe_result_code = ?,
        diagnostic_source = ?, diagnostic_confidence = ?, diagnostic_chapter_count = ?,
        diagnostic_warnings_json = ?, completed_at = ?, updated_at = ?,
        lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL
      WHERE id = ?
    `).run(code, diagnostic?.source ?? null, diagnostic?.confidence ?? null, diagnostic?.chapterCount ?? null,
      JSON.stringify(diagnostic?.warnings ?? []), now.toISOString(), now.toISOString(), fileJob.id);
  }

  private getFileProgress(audiobookId: number, mediaRevision: string): { completed: number; total: number; failed: number } | undefined {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN state = 'succeeded' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN state = 'failed_terminal' THEN 1 ELSE 0 END) AS failed
      FROM audiobook_proof_file_jobs WHERE audiobook_id = ? AND media_revision = ?
    `).get(audiobookId, mediaRevision) as any;
    return Number(row?.total ?? 0) > 0
      ? { completed: Number(row.completed ?? 0), total: Number(row.total ?? 0), failed: Number(row.failed ?? 0) }
      : undefined;
  }

  private renewLease(owner: string, jobId: number, now: Date): void {
    const expires = new Date(now.getTime() + LEASE_MS).toISOString();
    this.db.prepare(`UPDATE audiobook_proof_state SET lease_expires_at = ?, heartbeat_at = ? WHERE id = 1 AND lease_owner = ?`)
      .run(expires, now.toISOString(), owner);
    this.db.prepare(`UPDATE audiobook_proof_jobs SET lease_expires_at = ?, heartbeat_at = ? WHERE id = ? AND lease_owner = ? AND state = 'running'`)
      .run(expires, now.toISOString(), jobId, owner);
    this.db.prepare(`UPDATE audiobook_proof_file_jobs SET lease_expires_at = ?, heartbeat_at = ? WHERE lease_owner = ? AND state = 'running'`)
      .run(expires, now.toISOString(), owner);
  }

  private finishCycle(owner: string, now: Date, jobId: number | null): void {
    this.db.prepare(`
      UPDATE audiobook_proof_state SET lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
        current_job_id = NULL, last_completed_at = ?, next_run_at = ?
      WHERE id = 1 AND lease_owner = ?
    `).run(now.toISOString(), new Date(now.getTime() + RUN_INTERVAL_MS).toISOString(), owner);
  }

  private finishUnexpectedFailure(job: any, now: Date): void {
    const terminal = job.attempt_count >= 5;
    this.db.prepare(`
      UPDATE audiobook_proof_jobs SET state = ?, safe_result_code = 'PROOF_WORKER_FAILURE',
        next_attempt_at = ?, completed_at = ?, updated_at = ?,
        lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL WHERE id = ?
    `).run(terminal ? "failed_terminal" : "retry_wait",
      terminal ? null : new Date(now.getTime() + RETRY_DELAYS_MS[Math.min(job.attempt_count - 1, 3)]!).toISOString(),
      terminal ? now.toISOString() : null, now.toISOString(), job.id);
  }
}

export class AudiobookProofRuntime {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;
  constructor(private readonly worker: AudiobookProofWorkerService) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  runOnce(options: { force?: boolean; audiobookId?: number; now?: Date } = {}): Promise<ProofRunResult> {
    return this.worker.runOnce(options);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      await this.worker.runOnce().catch(() => undefined);
      this.schedule(RUN_INTERVAL_MS);
    }, delayMs);
    this.timer.unref?.();
  }
}

function processed(job: any, state: JobState, code: string): ProofRunResult {
  return { ok: true, status: "processed", jobId: job.id, audiobookId: job.audiobook_id, state, safeCode: code, attemptCount: job.attempt_count };
}

function isWorkerTransient(code: string): boolean {
  return [
    "PROOF_NOT_CONFIGURED",
    "EXTERNAL_TIMEOUT",
    "EXTERNAL_FILE_UNAVAILABLE",
    "EXTERNAL_INSPECT_FAILED",
    "EXTERNAL_VALIDATE_FAILED",
    "EXTERNAL_RESOLVE_FAILED",
    "EXTERNAL_ERROR_ENVELOPE"
  ].includes(code);
}
