import { createHash, randomUUID } from "node:crypto";
import type { Db } from "../db/database.js";
import { PlexLibraryDatabaseAdapter } from "../adapters/plexLibraryDatabaseAdapter.js";
import { AuditService } from "./auditService.js";
import type { ArchiveImportOutcome, PlexLibraryMovieViewRecord } from "../types/index.js";
import { nowIso } from "../utils/time.js";

type ArchiveInput = {
  source: "plex_library_db";
  sourceRecordKey: string;
  sourceAccountKey?: string;
  userId?: number;
  guid?: string;
  ratingKey?: string;
  title: string;
  year?: number;
  eventTime?: string;
  completed?: number;
  viewCount?: number;
  stableIds: string[];
  metadata: Record<string, unknown>;
};

export interface ArchivePlexImportOptions {
  apply: boolean;
  confirm: boolean;
  limit?: number;
}

export interface ArchivePlexImportSummary {
  sourceRows: number;
  existingRows: number;
  imported: number;
  alreadyCovered: number;
  reconciled: number;
  unresolved: number;
  ambiguous: number;
  unknownAccount: number;
  failed: number;
  linksCreated: number;
  observationLinksCreated: number;
}

export interface ArchiveMovieHistoryRow {
  id: number;
  userId: number;
  displayName: string;
  canonicalTitle: string | null;
  sourceTitle: string;
  source: string;
  sourceGuid: string | null;
  sourceRatingKey: string | null;
  eventTime: string;
  eventTimePrecision: string;
  resolutionStatus: string;
  resolutionMethod: string | null;
  confidence: string | null;
  accountResolutionMethod: string;
  accountConfidence: string;
  capturedAt: string;
}

export interface ArchiveIdentityCandidate {
  archiveMediaId: number;
  title: string;
  year: number | null;
  status: string;
  eventCount: number;
  firstEventTime: string | null;
  lastEventTime: string | null;
  viewers: string[];
  unknownAccountCount: number;
  sourceGuids: string[];
  confidence: string;
  decision: "assign" | "unrelated" | "unresolved" | null;
  targetRatingKey: string | null;
  targetOptions: Array<{ ratingKey: string; title: string; year: number | null }>;
}

export type ArchiveIdentityDecision = "assign" | "unrelated" | "unresolved";

export interface ArchiveDashboardActivityRow {
  id: number;
  user_id: number;
  plex_username: string;
  synced_display_name?: string | null;
  dashboard_alias?: string | null;
  rating_key: string;
  plex_guid?: string | null;
  media_type: string;
  title: string;
  show_title?: string | null;
  library_name?: string | null;
  watched_at: string;
  duration?: number | null;
  view_offset?: number | null;
  percent_complete?: number | null;
  completed: number;
  grandparent_rating_key?: string | null;
  parent_rating_key?: string | null;
  audiobook_id?: number | null;
  audiobook_title?: string | null;
  catalog_parent_title?: string | null;
  catalog_grandparent_title?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
  confirmation_status?: string | null;
  confirmed_participants_json?: string | null;
  watched_at_provenance: string;
  archive_event_id: number;
}

export type ArchivePlexImportResult =
  | { ok: true; runId: string; mode: "dry_run" | "apply"; summary: ArchivePlexImportSummary }
  | { ok: false; code: string; message: string; runId?: string; summary?: ArchivePlexImportSummary };

function stableIdFromGuid(value: unknown): string | undefined {
  const guid = String(value ?? "").trim();
  const imdb = guid.match(/(?:imdb|com\.plexapp\.agents\.imdb):\/\/(tt\d+)/i);
  if (imdb) return `imdb:${imdb[1].toLowerCase()}`;
  const tmdb = guid.match(/(?:tmdb|com\.plexapp\.agents\.themoviedb):\/\/(\d+)/i);
  if (tmdb) return `tmdb:${tmdb[1]}`;
  return undefined;
}

function hashKey(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function outcomeForStatus(status: string): ArchiveImportOutcome {
  if (status === "ambiguous") return "ambiguous";
  if (status === "unresolved" || status === "metadata_incomplete") return "unresolved";
  return "imported";
}

export class ArchivePlexViewRecoveryService {
  constructor(
    private readonly db: Db,
    private readonly plexLibrary = new PlexLibraryDatabaseAdapter()
  ) {}

  run(options: ArchivePlexImportOptions): ArchivePlexImportResult {
    if (options.apply && !options.confirm) {
      return { ok: false, code: "CONFIRM_REQUIRED", message: "Archive apply requires --apply and --confirm." };
    }

    const runId = randomUUID();
    const mode = options.apply ? "apply" : "dry_run";
    const summary: ArchivePlexImportSummary = {
      sourceRows: 0,
      existingRows: 0,
      imported: 0,
      alreadyCovered: 0,
      reconciled: 0,
      unresolved: 0,
      ambiguous: 0,
      unknownAccount: 0,
      failed: 0,
      linksCreated: 0,
      observationLinksCreated: 0
    };

    let inputs: ArchiveInput[];
    try {
      inputs = [
        ...this.loadPlexViews(options.limit)
      ];
    } catch (error) {
      return {
        ok: false,
        code: error instanceof Error && "code" in error ? String((error as Error & { code?: unknown }).code) : "ARCHIVE_SOURCE_READ_FAILED",
        message: error instanceof Error ? error.message : "Archive source read failed."
      };
    }

    summary.sourceRows = inputs.length;
    summary.existingRows = this.countExistingArchiveEvents(inputs);

    if (!options.apply) {
      for (const input of inputs) {
        if (this.hasArchiveEvent(input)) {
          summary.alreadyCovered += 1;
          continue;
        }
        const status = this.resolveExistingMediaStatus(input);
        if (status === "ambiguous") summary.ambiguous += 1;
        else if (status === "unresolved" || status === "metadata_incomplete") summary.unresolved += 1;
        else summary.imported += 1;
        const resolvedUserId = input.userId ?? this.findUserId(input.sourceAccountKey);
        if (input.sourceAccountKey && !resolvedUserId) summary.unknownAccount += 1;
      }
      summary.observationLinksCreated = this.countPotentialPlaybackLinks(inputs);
      summary.reconciled = summary.observationLinksCreated;
      return { ok: true, runId, mode, summary };
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const startedAt = nowIso();
      this.db.prepare(`
        INSERT INTO archive_ingest_runs (id, source, mode, status, started_at)
        VALUES (?, 'plex_and_cowatcher_movie_views', 'apply', 'running', ?)
      `).run(runId, startedAt);

      for (const input of inputs) {
        try {
          const result = this.importInput(input);
          if (result.outcome === "already_covered") summary.alreadyCovered += 1;
          else if (result.outcome === "imported") summary.imported += 1;
          else if (result.outcome === "unresolved") summary.unresolved += 1;
          else if (result.outcome === "ambiguous") summary.ambiguous += 1;
          if (result.unknownAccount) summary.unknownAccount += 1;
        } catch {
          summary.failed += 1;
        }
      }
      summary.observationLinksCreated = this.linkPlaybackObservations();
      summary.linksCreated = this.linkRelatedEvents();
      summary.reconciled = summary.observationLinksCreated + summary.linksCreated;
      this.db.prepare(`
        UPDATE archive_ingest_runs
        SET status = 'completed', completed_at = ?, summary_json = ?
        WHERE id = ?
      `).run(nowIso(), JSON.stringify(summary), runId);
      new AuditService(this.db).record("archive_plex_view_recovery_completed", "cli", "ok", { runId, mode, ...summary });
      this.db.exec("COMMIT");
      return { ok: true, runId, mode, summary };
    } catch (error) {
      this.db.exec("ROLLBACK");
      return {
        ok: false,
        code: "ARCHIVE_IMPORT_FAILED",
        message: error instanceof Error ? error.message : "Archive import failed.",
        runId,
        summary
      };
    }
  }

  queryMovieHistory(ratingKey?: string, plexGuid?: string, limit = 100, includePlexPlayHistory = false): ArchiveMovieHistoryRow[] {
    const aliases: string[] = [];
    if (plexGuid) aliases.push(plexGuid);
    if (ratingKey) aliases.push(ratingKey);
    if (!aliases.length) return [];
    const placeholders = aliases.map(() => "?").join(",");
    const sourceFilter = includePlexPlayHistory
      ? `(e.source = 'plex_library_db' OR (e.source = 'plex_api_history' AND EXISTS (
          SELECT 1 FROM plex_history_ingestion_rows historyRow
          JOIN plex_history_ingestion_runs historyRun ON historyRun.id = historyRow.run_id
          WHERE historyRow.archive_event_id = e.id AND historyRun.status = 'completed'
        )))`
      : `e.source = 'plex_library_db'`;
    return this.db.prepare(`
      SELECT e.id, e.user_id AS userId, COALESCE(NULLIF(u.dashboard_alias, ''), u.display_name, e.source_account_key) AS displayName,
        m.title AS canonicalTitle, e.title_snapshot AS sourceTitle, e.source, e.source_guid AS sourceGuid,
        e.source_rating_key AS sourceRatingKey, e.event_time AS eventTime, e.event_time_precision AS eventTimePrecision,
        e.resolution_status AS resolutionStatus,
        aliasSummary.resolutionMethod, aliasSummary.confidence,
        COALESCE(e.account_resolution_method, 'unknown') AS accountResolutionMethod,
        COALESCE(e.account_confidence, 'unknown') AS accountConfidence,
        e.captured_at AS capturedAt
      FROM archive_watch_events e
      JOIN archive_media m ON m.id = e.archive_media_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN (
        SELECT archive_media_id,
          GROUP_CONCAT(DISTINCT resolution_method) AS resolutionMethod,
          GROUP_CONCAT(DISTINCT confidence) AS confidence
        FROM archive_media_aliases
        GROUP BY archive_media_id
      ) aliasSummary ON aliasSummary.archive_media_id = e.archive_media_id
      WHERE ${sourceFilter}
        AND COALESCE(u.dashboard_shown, u.enabled) = 1
        AND e.event_time IS NOT NULL
        AND (
          e.archive_media_id IN (
            SELECT archive_media_id FROM archive_media_aliases
            WHERE alias_value IN (${placeholders}) AND alias_type IN ('guid', 'rating_key')
          )
          OR e.archive_media_id IN (
            SELECT archive_media_id FROM archive_identity_decisions
            WHERE decision = 'assign' AND target_rating_key = ?
              AND id IN (SELECT MAX(id) FROM archive_identity_decisions GROUP BY archive_media_id)
          )
        )
      ORDER BY e.event_time DESC, e.id DESC
      LIMIT ?
    `).all(...aliases, ratingKey ?? "", Math.max(1, Math.min(limit, 500))) as unknown as ArchiveMovieHistoryRow[];
  }

  queryIdentityCandidates(ratingKey: string, plexGuid: string | null, title: string): ArchiveIdentityCandidate[] {
    const aliases = [plexGuid, ratingKey].filter((value): value is string => Boolean(value));
    const placeholders = aliases.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT
        am.id AS archiveMediaId,
        am.title,
        am.year,
        am.status,
        COUNT(e.id) AS eventCount,
        MIN(e.event_time) AS firstEventTime,
        MAX(e.event_time) AS lastEventTime,
        GROUP_CONCAT(DISTINCT CASE WHEN u.id IS NOT NULL THEN COALESCE(NULLIF(u.dashboard_alias, ''), u.display_name, u.plex_username) END) AS viewers,
        SUM(CASE WHEN e.user_id IS NULL OR COALESCE(e.account_confidence, 'unknown') = 'unknown' THEN 1 ELSE 0 END) AS unknownAccountCount,
        GROUP_CONCAT(DISTINCT e.source_guid) AS sourceGuids,
        COALESCE(decision.confidence, CASE WHEN am.status = 'resolved' THEN 'medium' ELSE 'unknown' END) AS confidence,
        decision.decision,
        decision.target_rating_key AS targetRatingKey
      FROM archive_media am
      JOIN archive_watch_events e ON e.archive_media_id = am.id
      LEFT JOIN users u ON u.id = e.user_id
      LEFT JOIN (
        SELECT d.archive_media_id, d.decision, d.target_rating_key, d.confidence
        FROM archive_identity_decisions d
        JOIN (SELECT archive_media_id, MAX(id) AS id FROM archive_identity_decisions GROUP BY archive_media_id) latest
          ON latest.archive_media_id = d.archive_media_id AND latest.id = d.id
      ) decision ON decision.archive_media_id = am.id
      WHERE e.source = 'plex_library_db'
        AND e.event_time IS NOT NULL
        AND lower(trim(COALESCE(am.title, ''))) = lower(trim(?))
        AND NOT EXISTS (
          SELECT 1 FROM archive_media_aliases exactAlias
          WHERE exactAlias.archive_media_id = am.id
            AND exactAlias.alias_type IN ('guid', 'rating_key')
            AND exactAlias.alias_value IN (${placeholders || "NULL"})
        )
      GROUP BY am.id
      ORDER BY CASE WHEN decision.decision IS NULL THEN 0 ELSE 1 END, MAX(e.event_time) DESC, am.id
    `).all(title, ...aliases) as Array<any>;
    const options = this.db.prepare(`
      SELECT rating_key AS ratingKey, title, NULL AS year
      FROM content_catalog
      WHERE lower(media_type) = 'movie'
        AND lower(trim(title)) = lower(trim(?))
      ORDER BY CASE WHEN rating_key = ? THEN 0 ELSE 1 END, rating_key
      LIMIT 20
    `).all(title, ratingKey) as Array<{ ratingKey: string; title: string; year: number | null }>;
    if (!options.some((option) => option.ratingKey === ratingKey)) {
      options.unshift({ ratingKey, title, year: null });
    }
    return rows.map((row) => ({
      archiveMediaId: Number(row.archiveMediaId),
      title: String(row.title),
      year: row.year == null ? null : Number(row.year),
      status: String(row.status),
      eventCount: Number(row.eventCount),
      firstEventTime: row.firstEventTime ?? null,
      lastEventTime: row.lastEventTime ?? null,
      viewers: row.viewers ? String(row.viewers).split(",").filter(Boolean).sort() : [],
      unknownAccountCount: Number(row.unknownAccountCount ?? 0),
      sourceGuids: row.sourceGuids ? String(row.sourceGuids).split(",").filter(Boolean).sort() : [],
      confidence: String(row.confidence),
      decision: row.decision ?? null,
      targetRatingKey: row.targetRatingKey ?? null,
      targetOptions: options
    }));
  }

  recordIdentityDecision(input: {
    archiveMediaId: number;
    decision: ArchiveIdentityDecision;
    targetRatingKey?: string | null;
    actor: string;
    reason?: string | null;
  }): { id: number; decision: ArchiveIdentityDecision; targetRatingKey: string | null; alreadyApplied: boolean } | { ok: false; code: string; message: string } {
    const media = this.db.prepare("SELECT id FROM archive_media WHERE id = ?").get(input.archiveMediaId);
    if (!media) return { ok: false, code: "ARCHIVE_MEDIA_NOT_FOUND", message: "Archive media candidate was not found." };
    const targetRatingKey = input.decision === "assign" ? String(input.targetRatingKey ?? "").trim() : null;
    if (input.decision === "assign" && !targetRatingKey) {
      return { ok: false, code: "TARGET_RATING_KEY_REQUIRED", message: "An assigned catalog item is required." };
    }
    if (targetRatingKey) {
      const target = this.db.prepare(`
        SELECT 1 FROM content_catalog WHERE rating_key = ?
        UNION SELECT 1 FROM playback_observations WHERE rating_key = ?
        LIMIT 1
      `).get(targetRatingKey, targetRatingKey);
      if (!target) return { ok: false, code: "TARGET_MEDIA_NOT_FOUND", message: "The target catalog item was not found." };
    }
    const latest = this.db.prepare(`
      SELECT id, decision, target_rating_key AS targetRatingKey, reason
      FROM archive_identity_decisions WHERE archive_media_id = ? ORDER BY id DESC LIMIT 1
    `).get(input.archiveMediaId) as any;
    if (latest && latest.decision === input.decision && (latest.targetRatingKey ?? null) === targetRatingKey && (latest.reason ?? null) === (input.reason ?? null)) {
      return { id: Number(latest.id), decision: input.decision, targetRatingKey, alreadyApplied: true };
    }
    const result = this.db.prepare(`
      INSERT INTO archive_identity_decisions
        (archive_media_id, decision, target_rating_key, method, confidence, actor, reason, created_at)
      VALUES (?, ?, ?, 'manual_review', ?, ?, ?, ?)
    `).run(input.archiveMediaId, input.decision, targetRatingKey, input.decision === "unresolved" ? "unknown" : "high", input.actor, input.reason ?? null, nowIso());
    const id = Number(result.lastInsertRowid);
    new AuditService(this.db).record("archive_identity_decision_recorded", input.actor, "ok", {
      decisionId: id, archiveMediaId: input.archiveMediaId, decision: input.decision, targetRatingKey
    });
    return { id, decision: input.decision, targetRatingKey, alreadyApplied: false };
  }

  queryDashboardActivity(limit = 100_000, includePlexPlayHistory = false): ArchiveDashboardActivityRow[] {
    const sourceFilter = includePlexPlayHistory
      ? `(e.source = 'plex_library_db' OR (e.source = 'plex_api_history' AND EXISTS (
          SELECT 1 FROM plex_history_ingestion_rows historyRow
          JOIN plex_history_ingestion_runs historyRun ON historyRun.id = historyRow.run_id
          WHERE historyRow.archive_event_id = e.id AND historyRun.status = 'completed'
        )))`
      : `e.source = 'plex_library_db'`;
    return this.db.prepare(`
      SELECT
        -e.id AS id,
        e.id AS archive_event_id,
        e.user_id,
        u.plex_username,
        u.display_name AS synced_display_name,
        u.dashboard_alias,
        cat.rating_key,
        cat.guid AS plex_guid,
        cat.media_type,
        cat.title,
        COALESCE(cat.grandparent_title, json_extract(e.metadata_json, '$.grandparentTitle')) AS show_title,
        cat.library_title AS library_name,
        e.event_time AS watched_at,
        NULL AS session_start_at,
        NULL AS session_end_at,
        cat.duration,
        NULL AS view_offset,
        CASE WHEN COALESCE(e.completed, 1) = 1 THEN 100 ELSE NULL END AS percent_complete,
        COALESCE(e.completed, 1) AS completed,
        cat.grandparent_rating_key,
        cat.parent_rating_key,
        cat.audiobook_id,
        ab.title AS audiobook_title,
        cat.parent_title AS catalog_parent_title,
        cat.grandparent_title AS catalog_grandparent_title,
        json_extract(e.metadata_json, '$.seasonNumber') AS season_number,
        json_extract(e.metadata_json, '$.episodeNumber') AS episode_number,
        NULL AS confirmation_status,
        NULL AS confirmed_participants_json,
        CASE WHEN e.source = 'plex_api_history' THEN 'plex_play_history' ELSE 'plex_archive_recovery' END AS watched_at_provenance
      FROM archive_watch_events e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN archive_media_aliases archiveAlias
        ON archiveAlias.archive_media_id = e.archive_media_id
       AND archiveAlias.alias_type IN ('guid', 'rating_key')
      LEFT JOIN archive_identity_decisions identityDecision
        ON identityDecision.archive_media_id = e.archive_media_id
       AND identityDecision.id = (SELECT MAX(id) FROM archive_identity_decisions WHERE archive_media_id = e.archive_media_id)
      JOIN content_catalog cat
        ON ((archiveAlias.alias_type = 'guid' AND cat.guid = archiveAlias.alias_value)
        OR (archiveAlias.alias_type = 'rating_key' AND cat.rating_key = archiveAlias.alias_value)
        OR (identityDecision.decision = 'assign' AND cat.rating_key = identityDecision.target_rating_key))
      LEFT JOIN audiobook_books ab ON ab.id = cat.audiobook_id
      WHERE ${sourceFilter}
        AND e.event_time IS NOT NULL
        AND (e.source = 'plex_api_history' OR lower(cat.media_type) = 'movie')
        AND COALESCE(u.dashboard_shown, u.enabled) = 1
        AND NOT EXISTS (
          SELECT 1
          FROM archive_observation_links observationLink
          WHERE observationLink.archive_event_id = e.id
            AND observationLink.relation IN ('same_event', 'duplicate')
        )
      GROUP BY e.id
      ORDER BY e.event_time DESC, e.id DESC
      LIMIT ?
    `).all(Math.max(1, Math.min(limit, 100_000))) as unknown as ArchiveDashboardActivityRow[];
  }

  private loadPlexViews(limit?: number): ArchiveInput[] {
    return this.plexLibrary.readMovieViews(limit).map((row) => this.plexInput(row));
  }

  private plexInput(row: PlexLibraryMovieViewRecord): ArchiveInput {
    return {
      source: "plex_library_db",
      sourceRecordKey: `plex-view:${hashKey([row.accountId ?? null, row.guid ?? null, row.title, row.viewedAt])}`,
      sourceAccountKey: row.accountName,
      guid: row.guid,
      title: row.title,
      year: row.year,
      eventTime: row.viewedAt,
      completed: 1,
      stableIds: dedupe([...row.stableIds, stableIdFromGuid(row.guid) ?? ""]),
      metadata: { sourceRowId: row.sourceRowId, accountId: row.accountId ?? null, year: row.year ?? null }
    };
  }

  private findUserId(accountKey?: string): number | undefined {
    if (!accountKey) return undefined;
    const row = this.db.prepare(`
      SELECT id FROM users
      WHERE lower(plex_username) = lower(?)
      LIMIT 1
    `).get(accountKey) as { id?: number } | undefined;
    return row?.id == null ? undefined : Number(row.id);
  }

  private findMediaIds(input: ArchiveInput): number[] {
    const values: Array<{ type: string; value: string }> = [];
    for (const stable of input.stableIds) values.push({ type: "stable", value: stable });
    if (input.guid) values.push({ type: "guid", value: input.guid });
    if (input.ratingKey) values.push({ type: "rating_key", value: input.ratingKey });
    if (!values.length) return [];
    const result = new Set<number>();
    for (const value of values) {
      const rows = this.db.prepare(`
        SELECT archive_media_id AS id FROM archive_media_aliases
        WHERE alias_type = ? AND alias_value = ?
      `).all(value.type, value.value) as Array<{ id: number }>;
      for (const row of rows) result.add(Number(row.id));
    }
    return [...result];
  }

  private resolveExistingMediaStatus(input: ArchiveInput): string {
    const ids = this.findMediaIds(input);
    if (ids.length > 1) return "ambiguous";
    if (ids.length === 1) return "resolved";
    return input.guid || input.stableIds.length ? (input.stableIds.length ? "resolved" : "metadata_incomplete") : "unresolved";
  }

  private countExistingArchiveEvents(inputs: ArchiveInput[]): number {
    return inputs.filter((input) => this.hasArchiveEvent(input)).length;
  }

  private hasArchiveEvent(input: ArchiveInput): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1 FROM archive_watch_events WHERE source = ? AND source_record_key = ? LIMIT 1
    `).get(input.source, input.sourceRecordKey));
  }

  private importInput(input: ArchiveInput): { outcome: Exclude<ArchiveImportOutcome, "reconciled" | "unknown_account" | "failed">; unknownAccount: boolean } {
    if (this.hasArchiveEvent(input)) return { outcome: "already_covered", unknownAccount: false };
    const now = nowIso();
    const media = this.ensureMedia(input, now);
    const userId = input.userId ?? this.findUserId(input.sourceAccountKey);
    const unknownAccount = Boolean(input.sourceAccountKey && !userId);
    const accountResolutionMethod = userId == null ? "unknown" : "exact_account_key";
    const accountConfidence = userId == null ? "unknown" : "high";
    this.db.prepare(`
      INSERT INTO archive_watch_events (
        archive_media_id, user_id, source, source_record_key, source_account_key,
        source_guid, source_rating_key, title_snapshot, event_time, event_time_precision,
        completed, view_count, resolution_status, account_resolution_method, account_confidence,
        captured_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      media.mediaId ?? null,
      userId ?? null,
      input.source,
      input.sourceRecordKey,
      input.sourceAccountKey ?? null,
      input.guid ?? null,
      input.ratingKey ?? null,
      input.title,
      input.eventTime ?? null,
      input.eventTime ? "second" : "unknown",
      input.completed ?? null,
      input.viewCount ?? null,
      media.status,
      accountResolutionMethod,
      accountConfidence,
      now,
      JSON.stringify(input.metadata)
    );
    return { outcome: outcomeForStatus(media.status) as Exclude<ArchiveImportOutcome, "reconciled" | "unknown_account" | "failed">, unknownAccount };
  }

  private ensureMedia(input: ArchiveInput, now: string): { mediaId?: number; status: "resolved" | "unresolved" | "ambiguous" | "metadata_incomplete" } {
    let ids = this.findMediaIds(input);
    if (ids.length > 1) {
      const promotedId = this.promoteStableIdentity(input, ids);
      if (promotedId) ids = [promotedId];
    }
    if (ids.length > 1) return { status: "ambiguous" };
    let mediaId: number | undefined = ids[0];
    const status = input.stableIds.length ? "resolved" : input.guid ? "metadata_incomplete" : "unresolved";
    if (!mediaId) {
      const canonicalKey = input.stableIds[0]
        ? `stable:${input.stableIds[0]}`
        : input.guid
          ? `guid:${input.guid}`
          : `source:${input.source}:${hashKey([input.title, input.year ?? null])}`;
      const existing = this.db.prepare("SELECT id FROM archive_media WHERE canonical_key = ?").get(canonicalKey) as { id?: number } | undefined;
      mediaId = existing?.id == null ? undefined : Number(existing.id);
      if (!mediaId) {
        const result = this.db.prepare(`
          INSERT INTO archive_media (canonical_key, media_type, title, year, status, created_at, updated_at)
          VALUES (?, 'movie', ?, ?, ?, ?, ?)
        `).run(canonicalKey, input.title, input.year ?? null, status, now, now);
        mediaId = Number(result.lastInsertRowid);
      }
    } else {
      this.db.prepare(`
        UPDATE archive_media SET
          title = CASE WHEN title LIKE 'Unknown Media (%)' THEN ? ELSE title END,
          year = COALESCE(year, ?),
          status = CASE WHEN status = 'metadata_incomplete' AND ? = 'resolved' THEN 'resolved' ELSE status END,
          updated_at = ?
        WHERE id = ?
      `).run(input.title, input.year ?? null, status, now, mediaId);
    }
    const aliases = [
      ...input.stableIds.map((value) => ({ source: "provider", type: "stable", value, method: "verified_provider_id", confidence: "high" })),
      ...(input.guid ? [{ source: "plex", type: "guid", value: input.guid, method: stableIdFromGuid(input.guid) ? "provider_guid" : "exact_guid", confidence: stableIdFromGuid(input.guid) ? "high" : "medium" }] : []),
      ...(input.ratingKey ? [{ source: "plex", type: "rating_key", value: input.ratingKey, method: "source_record", confidence: "medium" }] : [])
    ];
    for (const alias of aliases) {
      this.db.prepare(`
        INSERT INTO archive_media_aliases (
          archive_media_id, source, alias_type, alias_value, title_snapshot, year_snapshot,
          resolution_method, confidence, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, alias_type, alias_value) DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          title_snapshot = COALESCE(archive_media_aliases.title_snapshot, excluded.title_snapshot),
          year_snapshot = COALESCE(archive_media_aliases.year_snapshot, excluded.year_snapshot)
      `).run(mediaId, alias.source, alias.type, alias.value, input.title, input.year ?? null, alias.method, alias.confidence, now, now);
    }
    return { mediaId, status };
  }

  private promoteStableIdentity(input: ArchiveInput, ids: number[]): number | undefined {
    if (input.stableIds.length !== 1) return undefined;
    const stableRows = this.db.prepare(`
      SELECT archive_media_id AS id FROM archive_media_aliases
      WHERE alias_type = 'stable' AND alias_value = ?
    `).all(input.stableIds[0]) as Array<{ id: number }>;
    if (stableRows.length !== 1) return undefined;
    const targetId = Number(stableRows[0].id);
    const weakIds = ids.filter((id) => id !== targetId).filter((id) => {
      const row = this.db.prepare("SELECT status FROM archive_media WHERE id = ?").get(id) as { status?: string } | undefined;
      return row?.status === "metadata_incomplete";
    });
    if (!weakIds.length) return undefined;
    for (const weakId of weakIds) {
      this.db.prepare("UPDATE archive_watch_events SET archive_media_id = ? WHERE archive_media_id = ?").run(targetId, weakId);
      this.db.prepare("UPDATE archive_media_aliases SET archive_media_id = ? WHERE archive_media_id = ?").run(targetId, weakId);
      this.db.prepare("DELETE FROM archive_media WHERE id = ?").run(weakId);
    }
    return targetId;
  }

  private linkRelatedEvents(): number {
    const rows = this.db.prepare(`
      SELECT leftEvent.id AS leftId, rightEvent.id AS rightId
      FROM archive_watch_events leftEvent
      JOIN archive_watch_events rightEvent
        ON leftEvent.id < rightEvent.id
       AND leftEvent.archive_media_id IS NOT NULL
       AND leftEvent.archive_media_id = rightEvent.archive_media_id
       AND leftEvent.user_id IS NOT NULL
       AND leftEvent.user_id = rightEvent.user_id
       AND leftEvent.source <> rightEvent.source
       AND leftEvent.event_time IS NOT NULL
       AND rightEvent.event_time IS NOT NULL
       AND abs(strftime('%s', leftEvent.event_time) - strftime('%s', rightEvent.event_time)) <= 900
    `).all() as Array<{ leftId: number; rightId: number }>;
    let created = 0;
    for (const row of rows) {
      const result = this.db.prepare(`
        INSERT OR IGNORE INTO archive_event_links (left_event_id, right_event_id, relation, method, confidence, created_at)
        VALUES (?, ?, 'same_event', 'same_canonical_media_user_time_window', 'medium', ?)
      `).run(row.leftId, row.rightId, nowIso());
      created += Number(result.changes ?? 0);
    }
    return created;
  }

  private linkPlaybackObservations(): number {
    const rows = this.db.prepare(`
      SELECT e.id AS archiveEventId, po.id AS observationId
      FROM archive_watch_events e
      JOIN playback_observations po
        ON po.user_id = e.user_id
       AND po.media_type = 'movie'
       AND po.plex_guid IS NOT NULL
       AND e.event_time IS NOT NULL
       AND abs(strftime('%s', po.watched_at) - strftime('%s', e.event_time)) <= 900
      JOIN archive_media_aliases alias
        ON alias.archive_media_id = e.archive_media_id
       AND alias.alias_type = 'guid'
       AND alias.alias_value = po.plex_guid
      WHERE e.source = 'plex_library_db'
    `).all() as Array<{ archiveEventId: number; observationId: number }>;
    let created = 0;
    for (const row of rows) {
      const result = this.db.prepare(`
        INSERT OR IGNORE INTO archive_observation_links (
          archive_event_id, playback_observation_id, relation, method, confidence, created_at
        ) VALUES (?, ?, 'same_event', 'exact_guid_user_time_window', 'high', ?)
      `).run(row.archiveEventId, row.observationId, nowIso());
      created += Number(result.changes ?? 0);
    }
    return created;
  }

  private countPotentialPlaybackLinks(inputs: ArchiveInput[]): number {
    const links = new Set<string>();
    for (const input of inputs) {
      if (!input.guid || !input.eventTime) continue;
      const userId = input.userId ?? this.findUserId(input.sourceAccountKey);
      if (!userId) continue;
      const rows = this.db.prepare(`
        SELECT po.id
        FROM playback_observations po
        WHERE po.user_id = ?
          AND po.media_type = 'movie'
          AND po.plex_guid = ?
          AND abs(strftime('%s', po.watched_at) - strftime('%s', ?)) <= 900
      `).all(userId, input.guid, input.eventTime) as Array<{ id: number }>;
      for (const row of rows) links.add(`${input.sourceRecordKey}:${row.id}`);
    }
    return links.size;
  }
}
