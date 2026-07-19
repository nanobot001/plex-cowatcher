import { createHash, randomUUID } from "node:crypto";
import type { Db } from "../db/database.js";
import type { TautulliAdapter } from "../adapters/tautulliAdapter.js";
import type { TautulliHistoryRow } from "../types/index.js";
import { nowIso } from "../utils/time.js";
import { UserService } from "./userService.js";
import { IngestionService } from "./ingestionService.js";
import { AuditService } from "./auditService.js";

const MAX_PAGE_ATTEMPTS = 3;
const DEFAULT_PAGE_SIZE = 200;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;

export interface TautulliBackfillOptions {
  userId?: number;
  pageSize?: number;
  apply?: boolean;
  confirm?: boolean;
  report?: boolean;
  runId?: string;
}

interface TargetUser {
  id: number;
  plex_username: string;
}

interface UserResult {
  userId: number;
  username: string;
  status: "completed" | "incomplete";
  cursor: number;
  pageCount: number;
  sourceRows: number;
  imported: number;
  skipped: number;
  failed: number;
  errorCode?: string;
}

interface RunSummary {
  sourceRows: number;
  imported: number;
  skipped: number;
  failed: number;
  pageFailures: number;
}

export class TautulliBackfillError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "TautulliBackfillError";
  }
}

export class TautulliBackfillService {
  private readonly users: UserService;
  private readonly ingestion: IngestionService;
  private readonly audit: AuditService;

  constructor(
    private readonly db: Db,
    private readonly tautulli: TautulliAdapter,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds))
  ) {
    this.users = new UserService(db);
    this.ingestion = new IngestionService(db, tautulli);
    this.audit = new AuditService(db);
  }

  async run(options: TautulliBackfillOptions = {}): Promise<Record<string, unknown>> {
    if (options.report) {
      return this.report(options.runId);
    }

    const pageSize = this.validatePageSize(options.pageSize);
    if (options.apply && options.confirm !== true) {
      throw new TautulliBackfillError(
        "TAUTULLI_BACKFILL_CONFIRM_REQUIRED",
        "Tautulli backfill apply mode requires --apply and --confirm."
      );
    }

    const targets = this.selectUsers(options.userId);
    if (targets.length === 0) {
      throw new TautulliBackfillError("TAUTULLI_BACKFILL_NO_USERS", "No enabled Tautulli users were selected.");
    }

    return options.apply
      ? this.runApply(targets, pageSize, options.runId)
      : this.runDryRun(targets, pageSize);
  }

  private selectUsers(userId?: number): TargetUser[] {
    if (userId !== undefined) {
      const user = this.users.findById(userId) as (TargetUser & { enabled?: number }) | undefined;
      if (!user || user.enabled === 0) {
        throw new TautulliBackfillError("TAUTULLI_BACKFILL_USER_NOT_FOUND", "The selected user is not enabled.");
      }
      return [{ id: user.id, plex_username: user.plex_username }];
    }

    return this.users.listEnabledUsers().map(user => ({ id: user.id, plex_username: user.plex_username }));
  }

  private validatePageSize(value?: number): number {
    const pageSize = value ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(pageSize) || pageSize < MIN_PAGE_SIZE || pageSize > MAX_PAGE_SIZE) {
      throw new TautulliBackfillError(
        "TAUTULLI_BACKFILL_INVALID_PAGE_SIZE",
        `Page size must be an integer between ${MIN_PAGE_SIZE} and ${MAX_PAGE_SIZE}.`
      );
    }
    return pageSize;
  }

  private async runDryRun(targets: TargetUser[], pageSize: number): Promise<Record<string, unknown>> {
    const users: UserResult[] = [];
    for (const user of targets) {
      users.push(await this.scanUser(user, pageSize, false));
    }

    const summary = this.summarize(users);
    return {
      mode: "dry_run",
      status: summary.pageFailures > 0 || users.some(user => user.failed > 0) ? "incomplete" : "completed",
      runId: null,
      pageSize,
      users,
      totals: summary,
      failures: users.filter(user => user.errorCode).map(user => ({ userId: user.userId, code: user.errorCode }))
    };
  }

  private async runApply(targets: TargetUser[], pageSize: number, requestedRunId?: string): Promise<Record<string, unknown>> {
    const run = this.openRun(targets.length === 1 ? targets[0].id : undefined, pageSize, requestedRunId);
    this.audit.record("tautulli_backfill_started", "cli", "started", {
      runId: run.id,
      userScope: targets.length === 1 ? targets[0].plex_username : "all_enabled",
      pageSize,
      mode: "apply"
    });
    const users: UserResult[] = [];

    for (const user of targets) {
      users.push(await this.applyUser(run.id, user, pageSize));
    }

    const summary = this.summarize(users);
    const status = summary.pageFailures > 0 || users.some(user => user.status === "incomplete")
      ? "incomplete"
      : "completed";
    const completedAt = nowIso();
    this.db.prepare(`
      UPDATE tautulli_ingestion_runs
      SET status = ?, updated_at = ?, completed_at = ?, summary_json = ?
      WHERE id = ?
    `).run(status, completedAt, status === "completed" ? completedAt : null, JSON.stringify(summary), run.id);
    this.audit.record("tautulli_backfill_completed", "cli", status, {
      runId: run.id,
      status,
      sourceRows: summary.sourceRows,
      imported: summary.imported,
      skipped: summary.skipped,
      failed: summary.failed,
      pageFailures: summary.pageFailures
    });

    return {
      mode: "apply",
      status,
      runId: run.id,
      pageSize,
      users,
      totals: summary,
      report: this.buildReport(run.id)
    };
  }

  private openRun(requestedUserId: number | undefined, pageSize: number, requestedRunId?: string): { id: string } {
    if (requestedRunId) {
      const run = this.db.prepare(`
        SELECT id, status, page_size FROM tautulli_ingestion_runs WHERE id = ?
      `).get(requestedRunId) as { id: string; status: string; page_size: number } | undefined;
      if (!run) throw new TautulliBackfillError("TAUTULLI_BACKFILL_RUN_NOT_FOUND", "The requested Tautulli backfill run was not found.");
      if (run.status === "completed") throw new TautulliBackfillError("TAUTULLI_BACKFILL_RUN_COMPLETED", "The requested Tautulli backfill run is already complete.");
      return { id: run.id };
    }

    const existing = this.db.prepare(`
      SELECT id FROM tautulli_ingestion_runs
      WHERE source = 'tautulli'
        AND mode = 'apply'
        AND status IN ('running', 'incomplete')
        AND ((requested_user_id IS NULL AND ? IS NULL) OR requested_user_id = ?)
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(requestedUserId ?? null, requestedUserId ?? null) as { id: string } | undefined;
    if (existing) return existing;

    const id = randomUUID();
    const timestamp = nowIso();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO tautulli_ingestion_runs
          (id, source, mode, status, requested_user_id, page_size, started_at, updated_at)
        VALUES (?, 'tautulli', 'apply', 'running', ?, ?, ?, ?)
      `).run(id, requestedUserId ?? null, pageSize, timestamp, timestamp);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { id };
  }

  private async applyUser(runId: string, user: TargetUser, pageSize: number): Promise<UserResult> {
    const state = this.db.prepare(`
      SELECT cursor, status, page_count, source_row_count, imported_count, skipped_count, failed_count, last_error_code
      FROM tautulli_ingestion_users WHERE run_id = ? AND user_id = ?
    `).get(runId, user.id) as {
      cursor: number;
      status: string;
      page_count: number;
      source_row_count: number;
      imported_count: number;
      skipped_count: number;
      failed_count: number;
      last_error_code?: string;
    } | undefined;

    if (!state) {
      const timestamp = nowIso();
      this.db.prepare(`
        INSERT INTO tautulli_ingestion_users
          (run_id, user_id, plex_username, status, updated_at)
        VALUES (?, ?, ?, 'pending', ?)
      `).run(runId, user.id, user.plex_username, timestamp);
    }

    const current = state ?? {
      cursor: 0,
      status: "pending",
      page_count: 0,
      source_row_count: 0,
      imported_count: 0,
      skipped_count: 0,
      failed_count: 0,
      last_error_code: undefined
    };
    if (current.status === "completed") {
      return this.toUserResult(user, current);
    }

    this.db.prepare("UPDATE tautulli_ingestion_users SET status = 'running', updated_at = ? WHERE run_id = ? AND user_id = ?")
      .run(nowIso(), runId, user.id);

    let cursor = current.cursor;
    let lastErrorCode = current.last_error_code;
    while (true) {
      const page = await this.fetchPage(user, cursor, pageSize);
      if (!page.ok) {
        lastErrorCode = page.errorCode;
        this.recordFailedPage(runId, user.id, cursor, pageSize, page.attempts, page.errorCode);
        this.audit.record("tautulli_backfill_page_failed", "cli", "error", {
          runId,
          userId: user.id,
          startOffset: cursor,
          attempts: page.attempts,
          errorCode: page.errorCode
        });
        this.db.prepare(`
          UPDATE tautulli_ingestion_users
          SET status = 'incomplete', last_error_code = ?, updated_at = ?
          WHERE run_id = ? AND user_id = ?
        `).run(lastErrorCode, nowIso(), runId, user.id);
        break;
      }

      if (page.rows.length === 0) {
        lastErrorCode = undefined;
        const timestamp = nowIso();
        this.recordSuccessfulPage(runId, user.id, cursor, pageSize, page.attempts, 0, 0, 0, 0, "empty", null);
        this.db.prepare(`
          UPDATE tautulli_ingestion_users
          SET status = ?, completed_at = ?, updated_at = ?, last_error_code = ?
          WHERE run_id = ? AND user_id = ?
        `).run(lastErrorCode ? "incomplete" : "completed", timestamp, timestamp, lastErrorCode ?? null, runId, user.id);
        break;
      }

      const fingerprint = this.pageFingerprint(page.rows);
      const prior = this.db.prepare(`
        SELECT page_fingerprint FROM tautulli_ingestion_pages
        WHERE run_id = ? AND user_id = ? AND status = 'succeeded'
        ORDER BY id DESC LIMIT 1
      `).get(runId, user.id) as { page_fingerprint?: string } | undefined;
      if (prior?.page_fingerprint && prior.page_fingerprint === fingerprint) {
        lastErrorCode = "TAUTULLI_PAGE_REPEATED";
        this.recordFailedPage(runId, user.id, cursor, pageSize, page.attempts, lastErrorCode);
        this.audit.record("tautulli_backfill_page_failed", "cli", "error", {
          runId,
          userId: user.id,
          startOffset: cursor,
          attempts: page.attempts,
          errorCode: lastErrorCode
        });
        this.db.prepare(`
          UPDATE tautulli_ingestion_users
          SET status = 'incomplete', last_error_code = ?, updated_at = ?
          WHERE run_id = ? AND user_id = ?
        `).run(lastErrorCode, nowIso(), runId, user.id);
        break;
      }

      const processed = this.persistPage(runId, user, cursor, pageSize, page.attempts, page.rows, fingerprint);
      if (processed.failed > 0) {
        lastErrorCode = "TAUTULLI_ROW_INGEST_FAILED";
        this.audit.record("tautulli_backfill_page_failed", "cli", "error", {
          runId,
          userId: user.id,
          startOffset: cursor,
          attempts: page.attempts,
          errorCode: lastErrorCode
        });
        this.db.prepare(`
          UPDATE tautulli_ingestion_users
          SET status = 'incomplete', page_count = page_count + 1,
              source_row_count = source_row_count + ?, imported_count = imported_count + ?,
              skipped_count = skipped_count + ?, failed_count = failed_count + ?,
              last_error_code = ?, updated_at = ?
          WHERE run_id = ? AND user_id = ?
        `).run(page.rows.length, processed.imported, processed.skipped, processed.failed, lastErrorCode, nowIso(), runId, user.id);
        break;
      }

      cursor += page.rows.length;
      this.db.prepare(`
        UPDATE tautulli_ingestion_users
        SET cursor = ?, status = 'running', page_count = page_count + 1,
            source_row_count = source_row_count + ?, imported_count = imported_count + ?,
            skipped_count = skipped_count + ?, last_error_code = NULL, updated_at = ?
        WHERE run_id = ? AND user_id = ?
      `).run(cursor, page.rows.length, processed.imported, processed.skipped, nowIso(), runId, user.id);
      lastErrorCode = undefined;
      await this.sleep(100);
    }

    const result = this.db.prepare(`
      SELECT cursor, status, page_count, source_row_count, imported_count, skipped_count, failed_count, last_error_code
      FROM tautulli_ingestion_users WHERE run_id = ? AND user_id = ?
    `).get(runId, user.id) as any;
    return this.toUserResult(user, result);
  }

  private async scanUser(user: TargetUser, pageSize: number, apply: boolean): Promise<UserResult> {
    let cursor = 0;
    const result: UserResult = { userId: user.id, username: user.plex_username, status: "completed", cursor, pageCount: 0, sourceRows: 0, imported: 0, skipped: 0, failed: 0 };
    let previousFingerprint: string | undefined;
    while (true) {
      const page = await this.fetchPage(user, cursor, pageSize);
      if (!page.ok) {
        result.status = "incomplete";
        result.errorCode = page.errorCode;
        break;
      }
      if (page.rows.length === 0) break;
      const fingerprint = this.pageFingerprint(page.rows);
      if (fingerprint === previousFingerprint) {
        result.status = "incomplete";
        result.errorCode = "TAUTULLI_PAGE_REPEATED";
        break;
      }
      previousFingerprint = fingerprint;
      result.pageCount++;
      result.sourceRows += page.rows.length;
      for (const row of page.rows) {
        if (this.existingObservation(user.id, row)) result.skipped++;
        else result.imported++;
      }
      cursor += page.rows.length;
      result.cursor = cursor;
      await this.sleep(apply ? 100 : 0);
    }
    return result;
  }

  private async fetchPage(user: TargetUser, start: number, length: number): Promise<{ ok: true; rows: TautulliHistoryRow[]; attempts: number } | { ok: false; attempts: number; errorCode: string }> {
    let attempts = 0;
    while (attempts < MAX_PAGE_ATTEMPTS) {
      attempts++;
      try {
        const rows = await this.tautulli.getRecentHistory({ user: user.plex_username, start, length });
        return { ok: true, rows, attempts };
      } catch {
        if (attempts >= MAX_PAGE_ATTEMPTS) {
          return { ok: false, attempts, errorCode: "TAUTULLI_PAGE_FETCH_FAILED" };
        }
        await this.sleep(attempts * 100);
      }
    }
    return { ok: false, attempts, errorCode: "TAUTULLI_PAGE_FETCH_FAILED" };
  }

  private persistPage(runId: string, user: TargetUser, start: number, pageSize: number, attempts: number, rows: TautulliHistoryRow[], fingerprint: string): { imported: number; skipped: number; failed: number } {
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    const timestamp = nowIso();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO tautulli_ingestion_pages
          (run_id, user_id, start_offset, page_length, attempt_count, status, page_fingerprint, started_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?)
        ON CONFLICT(run_id, user_id, start_offset) DO UPDATE SET
          page_length = excluded.page_length,
          attempt_count = excluded.attempt_count,
          page_fingerprint = excluded.page_fingerprint,
          updated_at = excluded.updated_at
      `).run(runId, user.id, start, pageSize, attempts, fingerprint, timestamp, timestamp);
      const page = this.db.prepare(`
        SELECT id FROM tautulli_ingestion_pages WHERE run_id = ? AND user_id = ? AND start_offset = ?
      `).get(runId, user.id, start) as { id: number };

      for (const row of rows) {
        const sourceRowKey = this.sourceRowKey(row);
        let outcome: "stored" | "already_present" | "failed";
        let observationId: number | undefined;
        let errorCode: string | undefined;
        try {
          const result = this.ingestion.ingestRow(user.id, row);
          outcome = result.inserted ? "stored" : "already_present";
          const observation = this.db.prepare(`
            SELECT id FROM playback_observations
            WHERE user_id = ? AND rating_key = ? AND watched_at = ?
            LIMIT 1
          `).get(user.id, row.ratingKey, row.watchedAt) as { id: number } | undefined;
          observationId = observation?.id;
        } catch {
          outcome = "failed";
          errorCode = "TAUTULLI_ROW_INGEST_FAILED";
        }
        if (outcome === "stored") imported++;
        if (outcome === "already_present") skipped++;
        if (outcome === "failed") failed++;
        this.db.prepare(`
          INSERT INTO tautulli_ingestion_rows
            (page_id, run_id, user_id, source_row_key, source_row_id, rating_key, plex_guid, identity_key, media_type, watched_at, outcome, observation_id, error_code, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(run_id, user_id, source_row_key) DO UPDATE SET
            page_id = excluded.page_id,
            source_row_id = excluded.source_row_id,
            rating_key = excluded.rating_key,
            plex_guid = excluded.plex_guid,
            identity_key = excluded.identity_key,
            media_type = excluded.media_type,
            watched_at = excluded.watched_at,
            outcome = excluded.outcome,
            observation_id = excluded.observation_id,
            error_code = excluded.error_code
        `).run(page.id, runId, user.id, sourceRowKey, row.rowId ?? null, row.ratingKey, row.plexGuid ?? null, this.identityKey(row), row.mediaType, row.watchedAt, outcome, observationId ?? null, errorCode ?? null, timestamp);
      }

      this.db.prepare(`
        UPDATE tautulli_ingestion_pages
        SET status = ?, source_row_count = ?, imported_count = ?, skipped_count = ?, failed_count = ?, error_code = ?, updated_at = ?
        WHERE id = ?
      `).run(failed > 0 ? "failed" : "succeeded", rows.length, imported, skipped, failed, failed > 0 ? "TAUTULLI_ROW_INGEST_FAILED" : null, timestamp, page.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { imported, skipped, failed };
  }

  private recordSuccessfulPage(runId: string, userId: number, start: number, pageSize: number, attempts: number, sourceRows: number, imported: number, skipped: number, failed: number, fingerprint: string, errorCode: string | null): void {
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO tautulli_ingestion_pages
        (run_id, user_id, start_offset, page_length, attempt_count, status, source_row_count, imported_count, skipped_count, failed_count, page_fingerprint, error_code, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, user_id, start_offset) DO UPDATE SET
        page_length = excluded.page_length, attempt_count = excluded.attempt_count, status = excluded.status,
        source_row_count = excluded.source_row_count, imported_count = excluded.imported_count,
        skipped_count = excluded.skipped_count, failed_count = excluded.failed_count,
        page_fingerprint = excluded.page_fingerprint, error_code = excluded.error_code, updated_at = excluded.updated_at
    `).run(runId, userId, start, pageSize, attempts, sourceRows, imported, skipped, failed, fingerprint, errorCode, timestamp, timestamp);
  }

  private recordFailedPage(runId: string, userId: number, start: number, pageSize: number, attempts: number, errorCode: string): void {
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO tautulli_ingestion_pages
        (run_id, user_id, start_offset, page_length, attempt_count, status, error_code, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?)
      ON CONFLICT(run_id, user_id, start_offset) DO UPDATE SET
        page_length = excluded.page_length, attempt_count = tautulli_ingestion_pages.attempt_count + excluded.attempt_count,
        status = 'failed', error_code = excluded.error_code, updated_at = excluded.updated_at
    `).run(runId, userId, start, pageSize, attempts, errorCode, timestamp, timestamp);
  }

  private existingObservation(userId: number, row: TautulliHistoryRow): boolean {
    const existing = this.db.prepare(`
      SELECT 1 FROM playback_observations WHERE user_id = ? AND rating_key = ? AND watched_at = ? LIMIT 1
    `).get(userId, row.ratingKey, row.watchedAt);
    return Boolean(existing);
  }

  private sourceRowKey(row: TautulliHistoryRow): string {
    return row.rowId?.trim() || `${row.ratingKey}|${row.watchedAt}|${row.mediaType}`;
  }

  private identityKey(row: TautulliHistoryRow): string {
    const guid = row.plexGuid?.trim();
    return guid ? `guid:${guid}` : `rating:${row.mediaType}:${row.ratingKey}`;
  }

  private pageFingerprint(rows: TautulliHistoryRow[]): string {
    const value = rows.map(row => [this.sourceRowKey(row), row.ratingKey, row.plexGuid ?? "", row.watchedAt, row.mediaType]);
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private toUserResult(user: TargetUser, state: any): UserResult {
    return {
      userId: user.id,
      username: user.plex_username,
      status: state.status === "completed" ? "completed" : "incomplete",
      cursor: Number(state.cursor ?? 0),
      pageCount: Number(state.page_count ?? 0),
      sourceRows: Number(state.source_row_count ?? 0),
      imported: Number(state.imported_count ?? 0),
      skipped: Number(state.skipped_count ?? 0),
      failed: Number(state.failed_count ?? 0),
      ...(state.last_error_code ? { errorCode: state.last_error_code } : {})
    };
  }

  private summarize(users: UserResult[]): RunSummary {
    return {
      sourceRows: users.reduce((total, user) => total + user.sourceRows, 0),
      imported: users.reduce((total, user) => total + user.imported, 0),
      skipped: users.reduce((total, user) => total + user.skipped, 0),
      failed: users.reduce((total, user) => total + user.failed, 0),
      pageFailures: users.filter(user => user.errorCode && user.errorCode !== "TAUTULLI_ROW_INGEST_FAILED").length
    };
  }

  private report(runId?: string): Record<string, unknown> {
    if (!runId) throw new TautulliBackfillError("TAUTULLI_BACKFILL_RUN_REQUIRED", "Provide --run-id when requesting a reconciliation report.");
    const run = this.db.prepare("SELECT id, status, page_size, started_at, completed_at, summary_json FROM tautulli_ingestion_runs WHERE id = ?").get(runId) as any;
    if (!run) throw new TautulliBackfillError("TAUTULLI_BACKFILL_RUN_NOT_FOUND", "The requested Tautulli backfill run was not found.");
    return { mode: "report", runId, status: run.status, pageSize: run.page_size, startedAt: run.started_at, completedAt: run.completed_at, users: this.buildReport(runId), summary: run.summary_json ? JSON.parse(run.summary_json) : null };
  }

  private buildReport(runId: string): Record<string, unknown> {
    const users = this.db.prepare(`
      SELECT run_id, user_id, plex_username, status, cursor, page_count, source_row_count, imported_count, skipped_count, failed_count, last_error_code
      FROM tautulli_ingestion_users WHERE run_id = ? ORDER BY user_id
    `).all(runId) as any[];
    const returnedRows = this.db.prepare(`
      SELECT user_id, identity_key, rating_key, plex_guid, media_type, watched_at, outcome, observation_id, error_code
      FROM tautulli_ingestion_rows WHERE run_id = ? ORDER BY user_id, watched_at, id
    `).all(runId) as any[];
    const returnedByUser = new Map<number, Set<string>>();
    for (const row of returnedRows) {
      if (!returnedByUser.has(row.user_id)) returnedByUser.set(row.user_id, new Set());
      returnedByUser.get(row.user_id)!.add(row.identity_key);
    }

    const localRows = this.db.prepare(`
      SELECT user_id, rating_key, plex_guid, media_type, watched_at
      FROM playback_observations
      WHERE tautulli_row_id IS NOT NULL
    `).all() as any[];
    const localByUser = new Map<number, Map<string, any>>();
    for (const row of localRows) {
      const identity = row.plex_guid?.trim() ? `guid:${row.plex_guid.trim()}` : `rating:${row.media_type}:${row.rating_key}`;
      if (!localByUser.has(row.user_id)) localByUser.set(row.user_id, new Map());
      localByUser.get(row.user_id)!.set(identity, row);
    }

    const returnedButNotStored = returnedRows.filter(row => row.outcome === "failed").map(row => ({
      userId: row.user_id,
      identityKey: row.identity_key,
      ratingKey: row.rating_key,
      mediaType: row.media_type,
      watchedAt: row.watched_at,
      status: "returned_but_not_stored",
      errorCode: row.error_code
    }));
    const notReturnedByTautulli: Record<string, unknown>[] = [];
    const unknownUsers: number[] = [];
    for (const user of users) {
      if (user.status !== "completed") {
        unknownUsers.push(user.user_id);
        continue;
      }
      const returned = returnedByUser.get(user.user_id) ?? new Set<string>();
      for (const [identityKey, local] of localByUser.get(user.user_id) ?? []) {
        if (!returned.has(identityKey)) {
          notReturnedByTautulli.push({ userId: user.user_id, identityKey, ratingKey: local.rating_key, mediaType: local.media_type, status: "not_returned_by_tautulli" });
        }
      }
    }

    return { users, returnedButNotStored, notReturnedByTautulli, unknownUsers };
  }
}
