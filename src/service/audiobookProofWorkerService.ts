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

const RUN_INTERVAL_MS = 15 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;
const RETRY_DELAYS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

type ProofAdapter = Pick<AudiobookProofAdapter, "proveAndActivate">;
type JobState = "pending" | "running" | "retry_wait" | "succeeded" | "failed_terminal" | "unsupported_multi_file";

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
    private readonly now: () => Date = () => new Date()
  ) {
    this.audit = new AuditService(db);
    this.activation = new AudiobookChapterActivationService(db);
  }

  getStatus(limit = 20): {
    enabled: boolean;
    counts: Record<JobState, number>;
    nextRunAt?: string;
    lastCompletedAt?: string;
    leaseActive: boolean;
    jobs: Array<{ id: number; audiobookId: number; state: JobState; attemptCount: number; safeCode?: string; nextAttemptAt?: string }>;
  } {
    const state = this.db.prepare("SELECT * FROM audiobook_proof_state WHERE id = 1").get() as any;
    const countRows = this.db.prepare("SELECT state, COUNT(*) AS count FROM audiobook_proof_jobs GROUP BY state").all() as any[];
    const counts = Object.fromEntries([
      "pending", "running", "retry_wait", "succeeded", "failed_terminal", "unsupported_multi_file"
    ].map((jobState) => [jobState, Number(countRows.find((row) => row.state === jobState)?.count ?? 0)])) as Record<JobState, number>;
    const jobs = this.db.prepare(`
      SELECT id, audiobook_id, state, attempt_count, safe_result_code, next_attempt_at
      FROM audiobook_proof_jobs ORDER BY id DESC LIMIT ?
    `).all(Math.max(1, Math.min(50, Math.trunc(limit)))) as any[];
    return {
      enabled: this.enabled,
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
        nextAttemptAt: job.next_attempt_at ?? undefined
      }))
    };
  }

  previewCanary(audiobookId?: number): { ok: true; dryRun: true; eligibleJobId?: number; audiobookId?: number; reason?: string } {
    const job = this.findEligibleJob(this.now(), audiobookId);
    if (job) return { ok: true, dryRun: true, eligibleJobId: job.id, audiobookId: job.audiobook_id };
    const outbox = this.db.prepare(`
      SELECT outbox.audiobook_id FROM audiobook_discovery_outbox outbox
      JOIN audiobook_books book ON book.id = outbox.audiobook_id
      JOIN audiobook_media_revisions revision
        ON revision.audiobook_id = outbox.audiobook_id AND revision.media_revision = outbox.media_revision
      WHERE outbox.consumed_at IS NULL AND book.current_media_revision = outbox.media_revision
        AND revision.manifest_status = 'ready' AND (? IS NULL OR outbox.audiobook_id = ?)
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
    this.audit.record("audiobook_proof_requeued", "cli", applied ? "applied" : "skipped", { jobId });
    return { ok: true, dryRun: false, jobId, changed: applied, state: applied ? "pending" : row.state };
  }

  async runOnce(options: { force?: boolean; audiobookId?: number; now?: Date } = {}): Promise<ProofRunResult> {
    const now = options.now ?? this.now();
    if (!this.enabled && !options.force) return { ok: true, status: "disabled" };
    this.materializeOutbox(now);
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

  materializeOutbox(now = this.now()): number {
    const rows = this.db.prepare(`
      SELECT outbox.id, outbox.audiobook_id, outbox.media_revision, outbox.manifest_status,
             outbox.safe_outcome_code, book.current_media_revision, revision.manifest_status AS revision_status
      FROM audiobook_discovery_outbox outbox
      JOIN audiobook_books book ON book.id = outbox.audiobook_id
      LEFT JOIN audiobook_media_revisions revision
        ON revision.audiobook_id = outbox.audiobook_id AND revision.media_revision = outbox.media_revision
      WHERE outbox.consumed_at IS NULL ORDER BY outbox.id LIMIT 100
    `).all() as any[];
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
          state = "unsupported_multi_file"; code = "UNSUPPORTED_MULTI_FILE";
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
    if (!evidence || evidence.manifest_status === "unavailable" || !evidence.private_file_path) {
      return this.completeJob(job, now, "failed_terminal", "MANIFEST_UNAVAILABLE");
    }
    if (evidence.manifest_status === "unsupported_multi_file") {
      return this.completeJob(job, now, "unsupported_multi_file", "UNSUPPORTED_MULTI_FILE");
    }
    if (evidence.track_count !== 1 || evidence.file_count !== 1) {
      return this.completeJob(job, now, "unsupported_multi_file", "UNSUPPORTED_MULTI_FILE");
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
      SELECT * FROM audiobook_proof_jobs
      WHERE state IN ('pending','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        AND (? IS NULL OR audiobook_id = ?)
      ORDER BY id LIMIT 1
    `).get(now.toISOString(), audiobookId ?? null, audiobookId ?? null);
  }

  private renewLease(owner: string, jobId: number, now: Date): void {
    const expires = new Date(now.getTime() + LEASE_MS).toISOString();
    this.db.prepare(`UPDATE audiobook_proof_state SET lease_expires_at = ?, heartbeat_at = ? WHERE id = 1 AND lease_owner = ?`)
      .run(expires, now.toISOString(), owner);
    this.db.prepare(`UPDATE audiobook_proof_jobs SET lease_expires_at = ?, heartbeat_at = ? WHERE id = ? AND lease_owner = ? AND state = 'running'`)
      .run(expires, now.toISOString(), jobId, owner);
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
