import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { Db } from "../db/database.js";
import type { PlexLocalAccount, PlexPlayHistoryPage, PlexPlayHistoryRow } from "../types/index.js";
import { appConfig } from "../utils/config.js";
import { nowIso } from "../utils/time.js";
import { AuditService } from "./auditService.js";

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 1000;
const MAX_PAGE_ATTEMPTS = 3;
const RECONCILIATION_TOLERANCE_SECONDS = 120;

type MediaScope = "movie" | "episode" | "all";

export interface PlexPlayHistoryOptions {
  apply?: boolean;
  confirm?: boolean;
  user?: string;
  mediaType?: MediaScope;
  dateFrom?: string;
  dateTo?: string;
  pageSize?: number;
  runId?: string;
  report?: boolean;
}

interface TargetUser {
  id: number;
  plex_username: string;
  plex_user_id: string | null;
  display_name: string;
}

interface Counts {
  returned: number;
  imported: number;
  alreadyPresent: number;
  linked: number;
  unresolved: number;
  unknown: number;
  failed: number;
  pages: number;
}

interface UserResult extends Counts {
  userId: number;
  username: string;
  mediaType: MediaScope;
  status: "completed" | "incomplete";
  errorCode?: string;
}

export class PlexPlayHistoryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PlexPlayHistoryError";
  }
}

export class PlexPlayHistoryService {
  private readonly audit: AuditService;

  constructor(
    private readonly db: Db,
    private readonly plex: PlexAdapter,
    private readonly sqlitePath = appConfig.SQLITE_PATH,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {
    this.audit = new AuditService(db);
  }

  async run(options: PlexPlayHistoryOptions = {}): Promise<Record<string, unknown>> {
    if (options.report) return this.report(options.runId);
    if (options.apply && options.confirm !== true) {
      throw new PlexPlayHistoryError("PLEX_HISTORY_CONFIRM_REQUIRED", "Apply mode requires --apply and --confirm.");
    }
    const pageSize = this.pageSize(options.pageSize);
    const mediaType = this.mediaScope(options.mediaType);
    const dateFrom = this.isoBoundary(options.dateFrom, "PLEX_HISTORY_INVALID_DATE_FROM");
    const dateTo = this.isoBoundary(options.dateTo, "PLEX_HISTORY_INVALID_DATE_TO");
    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new PlexPlayHistoryError("PLEX_HISTORY_INVALID_DATE_RANGE", "date-from must be before date-to.");
    }
    const users = this.selectUsers(options.user);
    if (!users.length) throw new PlexPlayHistoryError("PLEX_HISTORY_NO_USERS", "No enabled configured users were selected.");
    const accounts = await this.plex.listLocalAccounts();
    const backupCreated = options.apply ? this.createBackup() : false;
    const runId = options.apply ? this.openRun(options.runId, users, mediaType, pageSize, dateFrom, dateTo) : null;
    const userResults: UserResult[] = [];

    for (const user of users) {
      const account = this.resolveLocalAccount(user, accounts);
      if (!account.ok) {
        const result: UserResult = { ...this.emptyCounts(), userId: user.id, username: user.plex_username, mediaType, status: "incomplete", errorCode: account.code };
        result.unknown = 1;
        userResults.push(result);
        if (runId) this.persistUserResult(runId, result, null, 0, null, null);
        continue;
      }
      userResults.push(await this.scanUser(runId, user, account.account, mediaType, pageSize, dateFrom, dateTo, Boolean(options.apply)));
    }

    const totals = this.summarize(userResults);
    const status = userResults.some((user) => user.status === "incomplete") || totals.failed > 0 ? "incomplete" : "completed";
    if (runId) {
      const timestamp = nowIso();
      this.db.prepare(`UPDATE plex_history_ingestion_runs SET status=?, updated_at=?, completed_at=?, summary_json=? WHERE id=?`)
        .run(status, timestamp, timestamp, JSON.stringify(totals), runId);
      this.audit.record("plex_play_history_recovery_completed", "cli", status, { runId, mediaType, totals });
    }
    return {
      mode: options.apply ? "apply" : "dry_run",
      historySource: "play_history",
      status,
      runId,
      mediaType,
      pageSize,
      dateRange: { from: dateFrom, to: dateTo },
      cutoffApplied: false,
      backupCreated,
      users: userResults,
      totals
    };
  }

  private async scanUser(
    runId: string | null,
    user: TargetUser,
    account: PlexLocalAccount,
    mediaType: MediaScope,
    pageSize: number,
    dateFrom: string | null,
    dateTo: string | null,
    apply: boolean
  ): Promise<UserResult> {
    const result: UserResult = { ...this.emptyCounts(), userId: user.id, username: user.plex_username, mediaType, status: "completed" };
    const resume = runId ? this.resumeState(runId, user.id) : undefined;
    let cursor = resume?.cursor ?? 0;
    let firstFingerprint: string | null = resume?.firstFingerprint ?? null;
    let sourceTotal: number | null = resume?.sourceTotal ?? null;
    if (runId) this.markUserRunning(runId, user, account.id, cursor);

    if (cursor > 0 && firstFingerprint) {
      const currentFirst = await this.fetchPage(account.id, 0, pageSize);
      if (!currentFirst.ok || this.pageFingerprint(currentFirst.page) !== firstFingerprint || (sourceTotal !== null && currentFirst.page.totalSize !== sourceTotal)) {
        result.status = "incomplete";
        result.errorCode = "PLEX_HISTORY_CHANGED_DURING_SCAN";
        if (runId) this.persistUserResult(runId, result, account.id, cursor, firstFingerprint, sourceTotal);
        return result;
      }
    }

    while (true) {
      const fetched = await this.fetchPage(account.id, cursor, pageSize);
      if (!fetched.ok) {
        result.status = "incomplete";
        result.failed += 1;
        result.errorCode = fetched.errorCode;
        if (runId) this.persistFailedPage(runId, user.id, cursor, pageSize, fetched.attempts, fetched.errorCode);
        break;
      }
      const page = fetched.page;
      const fingerprint = this.pageFingerprint(page);
      if (cursor === 0) {
        firstFingerprint = fingerprint;
        sourceTotal = page.totalSize ?? null;
      }
      result.pages += 1;
      const rows = page.rows.filter((row) => this.rowInScope(row, mediaType, dateFrom, dateTo));
      result.returned += rows.length;
      if (apply && runId) {
        const persisted = await this.persistPage(runId, user, account, cursor, pageSize, fetched.attempts, fingerprint, rows);
        result.imported += persisted.imported;
        result.alreadyPresent += persisted.alreadyPresent;
        result.linked += persisted.linked;
        result.unresolved += persisted.unresolved;
        result.failed += persisted.failed;
        if (persisted.failed > 0) {
          result.status = "incomplete";
          result.errorCode = "PLEX_HISTORY_ROW_PERSIST_FAILED";
          break;
        }
      } else {
        for (const row of rows) {
          const preview = await this.previewRow(user.id, account.id, row);
          if (preview.existing) result.alreadyPresent += 1;
          else if (preview.resolved) result.imported += 1;
          else result.unresolved += 1;
          result.linked += preview.linked;
        }
      }
      if (page.rows.length === 0 || (page.totalSize !== undefined && cursor + page.rows.length >= page.totalSize) || (page.totalSize === undefined && page.rows.length < pageSize)) break;
      cursor += page.rows.length;
    }

    if (result.status === "completed" && firstFingerprint !== null) {
      const verification = await this.fetchPage(account.id, 0, pageSize);
      if (!verification.ok || this.pageFingerprint(verification.page) !== firstFingerprint || (sourceTotal !== null && verification.page.totalSize !== sourceTotal)) {
        result.status = "incomplete";
        result.errorCode = "PLEX_HISTORY_CHANGED_DURING_SCAN";
      }
    }
    if (runId) {
      Object.assign(result, this.persistedCounts(runId, user.id));
      this.persistUserResult(runId, result, account.id, cursor, firstFingerprint, sourceTotal);
    }
    return result;
  }

  private async persistPage(runId: string, user: TargetUser, account: PlexLocalAccount, start: number, pageSize: number, attempts: number, fingerprint: string, rows: PlexPlayHistoryRow[]): Promise<Counts> {
    const counts = this.emptyCounts();
    const timestamp = nowIso();
    const hydratedRows: PlexPlayHistoryRow[] = [];
    for (const row of rows) hydratedRows.push(await this.hydrateRow(row));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO plex_history_ingestion_pages (run_id,user_id,start_offset,page_length,attempt_count,status,page_fingerprint,created_at,updated_at)
        VALUES (?,?,?,?,?,'succeeded',?,?,?)
        ON CONFLICT(run_id,user_id,start_offset) DO UPDATE SET page_length=excluded.page_length,attempt_count=excluded.attempt_count,status='succeeded',page_fingerprint=excluded.page_fingerprint,error_code=NULL,updated_at=excluded.updated_at
      `).run(runId, user.id, start, rows.length, attempts, fingerprint, timestamp, timestamp);
      const pageId = Number((this.db.prepare("SELECT id FROM plex_history_ingestion_pages WHERE run_id=? AND user_id=? AND start_offset=?").get(runId, user.id, start) as { id: number }).id);
      for (const row of hydratedRows) {
        try {
          const persisted = this.persistArchiveEvent(user, account, row);
          const linked = this.reconcileEvent(persisted.eventId, user.id, row);
          const outcome = persisted.existing ? "already_present" : persisted.resolved ? "imported" : "unresolved";
          if (outcome === "already_present") counts.alreadyPresent += 1;
          if (outcome === "imported") counts.imported += 1;
          if (outcome === "unresolved") counts.unresolved += 1;
          counts.linked += linked;
          this.persistIngestionRow(pageId, runId, user.id, this.sourceRecordKey(account.id, row.historyKey), persisted.eventId, row, outcome, null, timestamp);
        } catch {
          counts.failed += 1;
          this.persistIngestionRow(pageId, runId, user.id, this.sourceRecordKey(account.id, row.historyKey), null, row, "failed", "PLEX_HISTORY_ROW_PERSIST_FAILED", timestamp);
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return counts;
  }

  private persistArchiveEvent(user: TargetUser, account: PlexLocalAccount, row: PlexPlayHistoryRow): { eventId: number; existing: boolean; resolved: boolean } {
    const sourceKey = this.sourceRecordKey(account.id, row.historyKey);
    const existing = this.db.prepare("SELECT id,resolution_status FROM archive_watch_events WHERE source='plex_api_history' AND source_record_key=?").get(sourceKey) as { id: number; resolution_status: string } | undefined;
    if (existing) return { eventId: Number(existing.id), existing: true, resolved: existing.resolution_status === "resolved" };
    const media = this.ensureArchiveMedia(row);
    const result = this.db.prepare(`
      INSERT INTO archive_watch_events (
        archive_media_id,user_id,source,source_record_key,source_account_key,source_guid,source_rating_key,
        title_snapshot,event_time,event_time_precision,completed,view_count,resolution_status,
        account_resolution_method,account_confidence,captured_at,metadata_json
      ) VALUES (?,?, 'plex_api_history',?,?,?,?,? ,?,'second',1,NULL,?,'exact_local_account','high',?,?)
    `).run(
      media.id ?? null, user.id, sourceKey, account.id, row.guid ?? null, row.ratingKey, row.title,
      row.viewedAt, media.status, nowIso(), JSON.stringify({
        mediaType: row.mediaType,
        librarySectionTitle: row.librarySectionTitle ?? null,
        grandparentRatingKey: row.grandparentRatingKey ?? null,
        grandparentTitle: row.grandparentTitle ?? null,
        parentRatingKey: row.parentRatingKey ?? null,
        parentTitle: row.parentTitle ?? null,
        seasonNumber: row.seasonNumber ?? null,
        episodeNumber: row.episodeNumber ?? null
      })
    );
    return { eventId: Number(result.lastInsertRowid), existing: false, resolved: media.status === "resolved" };
  }

  private ensureArchiveMedia(row: PlexPlayHistoryRow): { id?: number; status: "resolved" | "unresolved" | "ambiguous" } {
    const now = nowIso();
    if (!row.guid?.trim()) return { status: "unresolved" };
    const ids = (this.db.prepare("SELECT DISTINCT archive_media_id AS id FROM archive_media_aliases WHERE alias_type='guid' AND alias_value=?").all(row.guid) as Array<{ id: number }>).map((item) => Number(item.id));
    if (ids.length > 1) return { status: "ambiguous" };
    let id: number | undefined = ids[0];
    if (!id) {
      const key = `guid:${row.guid}`;
      const existing = this.db.prepare("SELECT id FROM archive_media WHERE canonical_key=?").get(key) as { id: number } | undefined;
      id = existing?.id;
      if (!id) {
        const inserted = this.db.prepare("INSERT INTO archive_media (canonical_key,media_type,title,status,created_at,updated_at) VALUES (?,?,?,'resolved',?,?)")
          .run(key, row.mediaType, row.title, now, now);
        id = Number(inserted.lastInsertRowid);
      }
    }
    this.db.prepare(`INSERT INTO archive_media_aliases (archive_media_id,source,alias_type,alias_value,title_snapshot,resolution_method,confidence,first_seen_at,last_seen_at)
      VALUES (?,'plex','guid',?,?,'exact_guid','high',?,?) ON CONFLICT(source,alias_type,alias_value) DO UPDATE SET last_seen_at=excluded.last_seen_at`).run(id, row.guid, row.title, now, now);
    this.db.prepare(`INSERT INTO archive_media_aliases (archive_media_id,source,alias_type,alias_value,title_snapshot,resolution_method,confidence,first_seen_at,last_seen_at)
      VALUES (?,'plex','rating_key',?,?,'source_record','medium',?,?) ON CONFLICT(source,alias_type,alias_value) DO UPDATE SET last_seen_at=excluded.last_seen_at`).run(id, row.ratingKey, row.title, now, now);
    return { id, status: "resolved" };
  }

  private reconcileEvent(eventId: number, userId: number, row: PlexPlayHistoryRow): number {
    if (!row.guid) return 0;
    const candidates = this.db.prepare(`
      SELECT id FROM playback_observations
      WHERE user_id=? AND media_type=? AND plex_guid=?
        AND session_start_at IS NOT NULL AND session_end_at IS NOT NULL
        AND strftime('%s', ?) BETWEEN strftime('%s', session_start_at, ?) AND strftime('%s', session_end_at, ?)
    `).all(userId, row.mediaType, row.guid, row.viewedAt, `-${RECONCILIATION_TOLERANCE_SECONDS} seconds`, `+${RECONCILIATION_TOLERANCE_SECONDS} seconds`) as Array<{ id: number }>;
    let created = 0;
    if (candidates.length === 1) {
      created += Number(this.db.prepare(`INSERT OR IGNORE INTO archive_observation_links (archive_event_id,playback_observation_id,relation,method,confidence,created_at)
        VALUES (?,?,'same_event','exact_identity_interval_v1','high',?)`).run(eventId, candidates[0]!.id, nowIso()).changes ?? 0);
    }
    const aggregate = this.db.prepare(`SELECT id FROM playback_observations WHERE user_id=? AND media_type=? AND plex_guid=? AND watched_at=? AND watched_at_provenance='plex_historical_last_view' LIMIT 1`)
      .get(userId, row.mediaType, row.guid, row.viewedAt) as { id: number } | undefined;
    if (aggregate) {
      created += Number(this.db.prepare(`INSERT OR IGNORE INTO archive_observation_links (archive_event_id,playback_observation_id,relation,method,confidence,created_at)
        VALUES (?,?,'duplicate','exact_plex_history_timestamp','high',?)`).run(eventId, aggregate.id, nowIso()).changes ?? 0);
    }
    return created;
  }

  private async previewRow(userId: number, accountId: string, rawRow: PlexPlayHistoryRow): Promise<{ existing: boolean; resolved: boolean; linked: number }> {
    const row = await this.hydrateRow(rawRow);
    const existing = Boolean(this.db.prepare("SELECT 1 FROM archive_watch_events WHERE source='plex_api_history' AND source_record_key=?").get(this.sourceRecordKey(accountId, row.historyKey)));
    if (!row.guid) return { existing, resolved: false, linked: 0 };
    const candidates = this.db.prepare(`SELECT id FROM playback_observations WHERE user_id=? AND media_type=? AND plex_guid=? AND session_start_at IS NOT NULL AND session_end_at IS NOT NULL AND strftime('%s', ?) BETWEEN strftime('%s', session_start_at, '-120 seconds') AND strftime('%s', session_end_at, '+120 seconds')`)
      .all(userId, row.mediaType, row.guid, row.viewedAt) as Array<{ id: number }>;
    return { existing, resolved: true, linked: candidates.length === 1 ? 1 : 0 };
  }

  private async hydrateRow(row: PlexPlayHistoryRow): Promise<PlexPlayHistoryRow> {
    if (row.guid) return row;
    try {
      const metadata = await this.plex.getRichMetadataByRatingKey(row.ratingKey);
      if (metadata.guid && (metadata.mediaType === "movie" || metadata.mediaType === "episode")) {
        return {
          ...row,
          guid: metadata.guid,
          mediaType: metadata.mediaType,
          title: metadata.title || row.title,
          librarySectionTitle: metadata.librarySectionTitle ?? row.librarySectionTitle,
          grandparentRatingKey: metadata.grandparentRatingKey ?? row.grandparentRatingKey,
          grandparentTitle: metadata.grandparentTitle ?? row.grandparentTitle,
          parentRatingKey: metadata.parentRatingKey ?? row.parentRatingKey,
          parentTitle: metadata.parentTitle ?? row.parentTitle
        };
      }
    } catch {
      // The raw source event is retained unresolved.
    }
    return row;
  }

  private resolveLocalAccount(user: TargetUser, accounts: PlexLocalAccount[]): { ok: true; account: PlexLocalAccount } | { ok: false; code: string } {
    const usernameMatches = accounts.filter((account) => account.username.toLowerCase() === user.plex_username.toLowerCase());
    if (usernameMatches.length !== 1) return { ok: false, code: usernameMatches.length ? "PLEX_HISTORY_ACCOUNT_AMBIGUOUS" : "PLEX_HISTORY_ACCOUNT_NOT_FOUND" };
    const usernameAccount = usernameMatches[0];
    const idAccount = user.plex_user_id ? accounts.find((account) => account.id === user.plex_user_id) : undefined;
    if (idAccount && idAccount.id !== usernameAccount.id) return { ok: false, code: "PLEX_HISTORY_ACCOUNT_MAPPING_CONFLICT" };
    return { ok: true, account: usernameAccount };
  }

  private async fetchPage(accountId: string, start: number, size: number): Promise<{ ok: true; page: PlexPlayHistoryPage; attempts: number } | { ok: false; attempts: number; errorCode: string }> {
    for (let attempts = 1; attempts <= MAX_PAGE_ATTEMPTS; attempts += 1) {
      try {
        return { ok: true, page: await this.plex.listPlayHistoryPage({ accountId, start, size }), attempts };
      } catch {
        if (attempts === MAX_PAGE_ATTEMPTS) return { ok: false, attempts, errorCode: "PLEX_HISTORY_PAGE_FETCH_FAILED" };
        await this.sleep(attempts * 100);
      }
    }
    return { ok: false, attempts: MAX_PAGE_ATTEMPTS, errorCode: "PLEX_HISTORY_PAGE_FETCH_FAILED" };
  }

  private persistIngestionRow(pageId: number, runId: string, userId: number, key: string, eventId: number | null, row: PlexPlayHistoryRow, outcome: "imported" | "already_present" | "unresolved" | "failed", errorCode: string | null, timestamp: string): void {
    this.db.prepare(`INSERT INTO plex_history_ingestion_rows (page_id,run_id,user_id,source_record_key,archive_event_id,media_type,viewed_at,outcome,error_code,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(run_id,user_id,source_record_key) DO UPDATE SET archive_event_id=excluded.archive_event_id,outcome=excluded.outcome,error_code=excluded.error_code`)
      .run(pageId, runId, userId, key, eventId, row.mediaType, row.viewedAt, outcome, errorCode, timestamp);
  }

  private persistFailedPage(runId: string, userId: number, start: number, pageSize: number, attempts: number, code: string): void {
    const timestamp = nowIso();
    this.db.prepare(`INSERT INTO plex_history_ingestion_pages (run_id,user_id,start_offset,page_length,attempt_count,status,error_code,created_at,updated_at)
      VALUES (?,?,?,?,?,'failed',?,?,?) ON CONFLICT(run_id,user_id,start_offset) DO UPDATE SET attempt_count=excluded.attempt_count,status='failed',error_code=excluded.error_code,updated_at=excluded.updated_at`)
      .run(runId, userId, start, pageSize, attempts, code, timestamp, timestamp);
  }

  private openRun(requestedRunId: string | undefined, users: TargetUser[], mediaType: MediaScope, pageSize: number, dateFrom: string | null, dateTo: string | null): string {
    if (requestedRunId) {
      const existing = this.db.prepare("SELECT id,status,media_type,page_size,date_from,date_to FROM plex_history_ingestion_runs WHERE id=?").get(requestedRunId) as any;
      if (!existing) throw new PlexPlayHistoryError("PLEX_HISTORY_RUN_NOT_FOUND", "The requested Plex history run was not found.");
      if (existing.status !== "incomplete" || existing.media_type !== mediaType || Number(existing.page_size) !== pageSize || (existing.date_from ?? null) !== dateFrom || (existing.date_to ?? null) !== dateTo) {
        throw new PlexPlayHistoryError("PLEX_HISTORY_RUN_MISMATCH", "Only an incomplete run with identical filters can resume.");
      }
      this.db.prepare("UPDATE plex_history_ingestion_runs SET status='running',updated_at=? WHERE id=?").run(nowIso(), requestedRunId);
      return requestedRunId;
    }
    const runId = randomUUID();
    const timestamp = nowIso();
    this.db.prepare(`INSERT INTO plex_history_ingestion_runs (id,mode,status,requested_user_id,media_type,page_size,date_from,date_to,started_at,updated_at)
      VALUES (?,'apply','running',?,?,?,?,?,?,?)`).run(runId, users.length === 1 ? users[0].id : null, mediaType, pageSize, dateFrom, dateTo, timestamp, timestamp);
    this.audit.record("plex_play_history_recovery_started", "cli", "started", { runId, mediaType, pageSize, userCount: users.length });
    return runId;
  }

  private markUserRunning(runId: string, user: TargetUser, accountId: string, cursor: number): void {
    this.db.prepare(`INSERT INTO plex_history_ingestion_users (run_id,user_id,plex_username,local_account_id,cursor,status,updated_at)
      VALUES (?,?,?,?,?,'running',?) ON CONFLICT(run_id,user_id) DO UPDATE SET local_account_id=excluded.local_account_id,status='running',updated_at=excluded.updated_at`)
      .run(runId, user.id, user.plex_username, accountId, cursor, nowIso());
  }

  private persistUserResult(runId: string, result: UserResult, accountId: string | null, cursor: number, fingerprint: string | null, sourceTotal: number | null): void {
    const timestamp = nowIso();
    this.db.prepare(`INSERT INTO plex_history_ingestion_users (
      run_id,user_id,plex_username,local_account_id,cursor,status,first_page_fingerprint,source_total,page_count,returned_count,imported_count,already_present_count,linked_count,unresolved_count,failed_count,last_error_code,updated_at,completed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(run_id,user_id) DO UPDATE SET local_account_id=excluded.local_account_id,cursor=excluded.cursor,status=excluded.status,first_page_fingerprint=excluded.first_page_fingerprint,source_total=excluded.source_total,page_count=excluded.page_count,returned_count=excluded.returned_count,imported_count=excluded.imported_count,already_present_count=excluded.already_present_count,linked_count=excluded.linked_count,unresolved_count=excluded.unresolved_count,failed_count=excluded.failed_count,last_error_code=excluded.last_error_code,updated_at=excluded.updated_at,completed_at=excluded.completed_at`)
      .run(runId, result.userId, result.username, accountId, cursor, result.status, fingerprint, sourceTotal, result.pages, result.returned, result.imported, result.alreadyPresent, result.linked, result.unresolved, result.failed, result.errorCode ?? null, timestamp, timestamp);
  }

  private resumeState(runId: string, userId: number): { cursor: number; firstFingerprint: string | null; sourceTotal: number | null } | undefined {
    const row = this.db.prepare("SELECT cursor,first_page_fingerprint,source_total FROM plex_history_ingestion_users WHERE run_id=? AND user_id=?").get(runId, userId) as { cursor: number; first_page_fingerprint: string | null; source_total: number | null } | undefined;
    return row ? { cursor: Number(row.cursor), firstFingerprint: row.first_page_fingerprint ?? null, sourceTotal: row.source_total == null ? null : Number(row.source_total) } : undefined;
  }

  private persistedCounts(runId: string, userId: number): Counts {
    const rowCounts = this.db.prepare(`
      SELECT COUNT(*) AS returned,
        SUM(CASE WHEN outcome='imported' THEN 1 ELSE 0 END) AS imported,
        SUM(CASE WHEN outcome='already_present' THEN 1 ELSE 0 END) AS alreadyPresent,
        SUM(CASE WHEN outcome='unresolved' THEN 1 ELSE 0 END) AS unresolved,
        SUM(CASE WHEN outcome='failed' THEN 1 ELSE 0 END) AS failed
      FROM plex_history_ingestion_rows WHERE run_id=? AND user_id=?
    `).get(runId, userId) as any;
    const pageCounts = this.db.prepare(`
      SELECT SUM(CASE WHEN status='succeeded' THEN 1 ELSE 0 END) AS pages,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failedPages
      FROM plex_history_ingestion_pages WHERE run_id=? AND user_id=?
    `).get(runId, userId) as any;
    const links = this.db.prepare(`
      SELECT COUNT(*) AS linked
      FROM plex_history_ingestion_rows historyRow
      JOIN archive_observation_links observationLink ON observationLink.archive_event_id=historyRow.archive_event_id
      WHERE historyRow.run_id=? AND historyRow.user_id=?
    `).get(runId, userId) as any;
    return {
      returned: Number(rowCounts?.returned ?? 0),
      imported: Number(rowCounts?.imported ?? 0),
      alreadyPresent: Number(rowCounts?.alreadyPresent ?? 0),
      linked: Number(links?.linked ?? 0),
      unresolved: Number(rowCounts?.unresolved ?? 0),
      unknown: 0,
      failed: Number(rowCounts?.failed ?? 0) + Number(pageCounts?.failedPages ?? 0),
      pages: Number(pageCounts?.pages ?? 0)
    };
  }

  private report(runId?: string): Record<string, unknown> {
    if (!runId) throw new PlexPlayHistoryError("PLEX_HISTORY_RUN_REQUIRED", "Provide --run-id with --report.");
    const run = this.db.prepare("SELECT id,status,media_type,page_size,date_from,date_to,started_at,completed_at,summary_json FROM plex_history_ingestion_runs WHERE id=?").get(runId) as any;
    if (!run) throw new PlexPlayHistoryError("PLEX_HISTORY_RUN_NOT_FOUND", "The requested Plex history run was not found.");
    const users = this.db.prepare(`SELECT user_id,plex_username,status,cursor,page_count,returned_count,imported_count,already_present_count,linked_count,unresolved_count,failed_count,last_error_code FROM plex_history_ingestion_users WHERE run_id=? ORDER BY user_id`).all(runId);
    return { mode: "report", historySource: "play_history", runId, status: run.status, mediaType: run.media_type, pageSize: run.page_size, dateRange: { from: run.date_from, to: run.date_to }, startedAt: run.started_at, completedAt: run.completed_at, users, totals: run.summary_json ? JSON.parse(run.summary_json) : null };
  }

  private selectUsers(value?: string): TargetUser[] {
    const rows = this.db.prepare("SELECT id,plex_username,plex_user_id,display_name FROM users WHERE enabled=1 ORDER BY id").all() as unknown as TargetUser[];
    if (!value) return rows;
    const normalized = value.toLowerCase();
    return rows.filter((user) => [user.plex_username, user.display_name].some((candidate) => candidate.toLowerCase() === normalized));
  }

  private rowInScope(row: PlexPlayHistoryRow, mediaType: MediaScope, dateFrom: string | null, dateTo: string | null): boolean {
    return (mediaType === "all" || row.mediaType === mediaType) && (!dateFrom || row.viewedAt >= dateFrom) && (!dateTo || row.viewedAt <= dateTo);
  }

  private pageSize(value?: number): number {
    const result = value ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(result) || result < 1 || result > MAX_PAGE_SIZE) throw new PlexPlayHistoryError("PLEX_HISTORY_INVALID_PAGE_SIZE", "page-size must be between 1 and 1000.");
    return result;
  }

  private mediaScope(value?: MediaScope): MediaScope {
    const result = value ?? "movie";
    if (!["movie", "episode", "all"].includes(result)) throw new PlexPlayHistoryError("PLEX_HISTORY_INVALID_MEDIA_TYPE", "media-type must be movie, episode, or all.");
    return result;
  }

  private isoBoundary(value: string | undefined, code: string): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new PlexPlayHistoryError(code, "Date filters must be valid ISO dates.");
    return parsed.toISOString();
  }

  private pageFingerprint(page: PlexPlayHistoryPage): string {
    return createHash("sha256").update(JSON.stringify(page.rows.map((row) => [row.historyKey, row.accountId, row.ratingKey, row.viewedAt]))).digest("hex");
  }

  private sourceRecordKey(accountId: string, historyKey: string): string {
    return `${accountId}:${historyKey}`;
  }

  private emptyCounts(): Counts {
    return { returned: 0, imported: 0, alreadyPresent: 0, linked: 0, unresolved: 0, unknown: 0, failed: 0, pages: 0 };
  }

  private summarize(users: UserResult[]): Counts {
    return users.reduce((total, user) => {
      for (const key of Object.keys(this.emptyCounts()) as Array<keyof Counts>) total[key] += user[key];
      return total;
    }, this.emptyCounts());
  }

  private createBackup(): boolean {
    const source = path.resolve(this.sqlitePath);
    if (!fs.existsSync(source)) return false;
    const directory = path.join(path.dirname(source), "backups");
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, `pre-plex-play-history-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
    const escaped = destination.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
    return fs.existsSync(destination) && fs.statSync(destination).size > 0;
  }
}
