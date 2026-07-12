import { randomUUID } from "node:crypto";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { Db } from "../db/database.js";
import { appConfig } from "../utils/config.js";
import { AuditService } from "./auditService.js";
import {
  AudiobookScannerService,
  type AudiobookDiscoveryTrigger,
  type AudiobookScanResult
} from "./audiobookScannerService.js";

const LEASE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

export type AudiobookDiscoveryRunResult = AudiobookScanResult | {
  ok: true;
  status: "skipped";
  reason: "cooldown" | "lease_held" | "disabled";
  libraryTitle: string;
};

export type AudiobookDiscoveryRunOptions = {
  library?: string;
  ratingKey?: string;
  plexGuid?: string;
  now?: Date;
  force?: boolean;
};

export class AudiobookDiscoveryService {
  private readonly scanner: AudiobookScannerService;
  private readonly audit: AuditService;

  constructor(
    private readonly db: Db,
    plex: PlexAdapter,
    fetcher: typeof fetch = fetch,
    private readonly intervalMinutes = appConfig.AUDIOBOOK_SCAN_INTERVAL_MINUTES
  ) {
    this.scanner = new AudiobookScannerService(db, plex, fetcher);
    this.audit = new AuditService(db);
  }

  async run(trigger: AudiobookDiscoveryTrigger, options: AudiobookDiscoveryRunOptions = {}): Promise<AudiobookDiscoveryRunResult> {
    const library = options.library ?? appConfig.AUDIOBOOK_LIBRARY;
    if (!appConfig.AUDIOBOOK_DISCOVERY_ENABLED && trigger !== "manual") {
      return { ok: true, status: "skipped", reason: "disabled", libraryTitle: library };
    }

    const now = options.now ?? new Date();
    if (trigger === "startup" && !options.force && this.insideStartupCooldown(now)) {
      this.audit.record("audiobook_discovery_skipped", trigger, "skipped", { reason: "cooldown" });
      return { ok: true, status: "skipped", reason: "cooldown", libraryTitle: library };
    }

    const owner = randomUUID();
    if (!this.acquireLease(owner, now)) {
      this.audit.record("audiobook_discovery_skipped", trigger, "skipped", { reason: "lease_held" });
      return { ok: true, status: "skipped", reason: "lease_held", libraryTitle: library };
    }

    const runId = this.startRun(trigger, library, now);
    const heartbeat = setInterval(() => this.renewLease(owner, new Date()), HEARTBEAT_MS);
    heartbeat.unref?.();
    try {
      const result = trigger === "webhook-item" && options.ratingKey
        ? await this.scanner.scanItem(options.ratingKey, options.plexGuid, library, { runId, trigger, now })
        : await this.scanner.scanLibrary(library, { runId, trigger, now });
      const finishedAt = options.now ?? new Date();
      this.finishRun(runId, result.status, result, finishedAt, trigger !== "webhook-item" && result.status === "succeeded");
      this.audit.record("audiobook_discovery_completed", trigger, result.status, safeCounts(result));
      return result;
    } catch (error) {
      const code = safeDiscoveryCode(error);
      const finishedAt = options.now ?? new Date();
      this.finishRun(runId, "failed", {}, finishedAt, false, code);
      this.audit.record("audiobook_discovery_completed", trigger, "failed", { errorCode: code }, code);
      throw new Error(code);
    } finally {
      clearInterval(heartbeat);
      this.releaseLease(owner);
    }
  }

  getStatus(): {
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    nextRunAt?: string;
    currentRunId?: number;
    leaseActive: boolean;
  } {
    const row = this.db.prepare("SELECT * FROM audiobook_discovery_state WHERE id = 1").get() as any;
    return {
      lastAttemptAt: row?.last_attempt_at ?? undefined,
      lastSuccessAt: row?.last_success_at ?? undefined,
      nextRunAt: row?.next_run_at ?? undefined,
      currentRunId: row?.current_run_id ?? undefined,
      leaseActive: Boolean(row?.lease_expires_at && Date.parse(row.lease_expires_at) > Date.now())
    };
  }

  private insideStartupCooldown(now: Date): boolean {
    const row = this.db.prepare("SELECT last_success_at FROM audiobook_discovery_state WHERE id = 1")
      .get() as { last_success_at: string | null } | undefined;
    if (!row?.last_success_at) return false;
    const lastSuccess = Date.parse(row.last_success_at);
    return Number.isFinite(lastSuccess) && now.getTime() - lastSuccess < this.intervalMinutes * 60 * 1000;
  }

  private acquireLease(owner: string, now: Date): boolean {
    const expiresAt = new Date(now.getTime() + LEASE_MS).toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db.prepare("SELECT lease_owner, lease_expires_at FROM audiobook_discovery_state WHERE id = 1")
        .get() as { lease_owner: string | null; lease_expires_at: string | null };
      const active = Boolean(row.lease_owner && row.lease_expires_at && Date.parse(row.lease_expires_at) > now.getTime());
      if (active) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db.prepare(`
        UPDATE audiobook_discovery_state
        SET lease_owner = ?, lease_expires_at = ?, heartbeat_at = ?, last_attempt_at = ?
        WHERE id = 1
      `).run(owner, expiresAt, now.toISOString(), now.toISOString());
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private renewLease(owner: string, now: Date): void {
    this.db.prepare(`
      UPDATE audiobook_discovery_state
      SET lease_expires_at = ?, heartbeat_at = ?
      WHERE id = 1 AND lease_owner = ?
    `).run(new Date(now.getTime() + LEASE_MS).toISOString(), now.toISOString(), owner);
  }

  private releaseLease(owner: string): void {
    this.db.prepare(`
      UPDATE audiobook_discovery_state
      SET lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, current_run_id = NULL
      WHERE id = 1 AND lease_owner = ?
    `).run(owner);
  }

  private startRun(trigger: AudiobookDiscoveryTrigger, library: string, now: Date): number {
    const inserted = this.db.prepare(`
      INSERT INTO audiobook_discovery_runs
        (trigger_reason, status, library_title, started_at, counts_json)
      VALUES (?, 'running', ?, ?, '{}')
    `).run(trigger, library, now.toISOString());
    const runId = Number(inserted.lastInsertRowid);
    this.db.prepare("UPDATE audiobook_discovery_state SET current_run_id = ? WHERE id = 1").run(runId);
    this.audit.record("audiobook_discovery_started", trigger, "started", { runId, library });
    return runId;
  }

  private finishRun(
    runId: number,
    status: "succeeded" | "partial" | "failed",
    counts: unknown,
    finishedAt: Date,
    successfulFullScan: boolean,
    safeErrorCode?: string
  ): void {
    const nextRunAt = new Date(finishedAt.getTime() + this.intervalMinutes * 60 * 1000).toISOString();
    this.db.prepare(`
      UPDATE audiobook_discovery_runs
      SET status = ?, finished_at = ?, safe_error_code = ?, counts_json = ?
      WHERE id = ?
    `).run(status, finishedAt.toISOString(), safeErrorCode ?? null, JSON.stringify(counts), runId);
    this.db.prepare(`
      UPDATE audiobook_discovery_state
      SET last_success_at = CASE WHEN ? THEN ? ELSE last_success_at END,
          next_run_at = ?
      WHERE id = 1
    `).run(successfulFullScan ? 1 : 0, finishedAt.toISOString(), nextRunAt);
  }
}

export class AudiobookDiscoveryRuntime {
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(
    private readonly discovery: AudiobookDiscoveryService,
    private readonly intervalMinutes = appConfig.AUDIOBOOK_SCAN_INTERVAL_MINUTES
  ) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    await this.discovery.run("startup").catch(() => undefined);
    this.scheduleNext();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      await this.discovery.run("interval").catch(() => undefined);
      this.scheduleNext();
    }, this.intervalMinutes * 60 * 1000);
    this.timer.unref?.();
  }
}

function safeCounts(result: AudiobookScanResult): Record<string, number> {
  return {
    tracksVisited: result.tracksVisited,
    trackFailures: result.trackFailures,
    booksNew: result.booksNew,
    booksChanged: result.booksChanged,
    booksAlreadyKnown: result.booksAlreadyKnown,
    booksPendingIdentity: result.booksPendingIdentity,
    booksPendingEnrichment: result.booksPendingEnrichment,
    identityConflicts: result.identityConflicts,
    outboxEnqueued: result.outboxEnqueued
  };
}

function safeDiscoveryCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "AUDIOBOOK_LIBRARY_NOT_FOUND") return message;
  if (message.includes("PLEX_TOKEN_MISSING")) return "PLEX_TOKEN_MISSING";
  if (message.includes("TIMEOUT")) return "PLEX_TIMEOUT";
  return "AUDIOBOOK_DISCOVERY_FAILED";
}
