import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { Db } from "../db/database.js";
import type { PlexHistoricalMovieState, PlexUser } from "../types/index.js";
import { appConfig } from "../utils/config.js";
import { AuditService } from "./auditService.js";

const DEFAULT_CUTOFF = "2022-01-01T00:00:00.000Z";
const PROVENANCE = "plex_historical_last_view";

type BackfillOutcome =
  | "imported"
  | "dry_run_importable"
  | "already_covered"
  | "confirmed_not_watched"
  | "post_cutoff"
  | "missing_guid"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "ambiguous_identity"
  | "not_found_in_plex"
  | "not_plex_visible"
  | "plex_unavailable";

interface BackfillOptions {
  apply: boolean;
  confirm: boolean;
  user?: string;
  ratingKey?: string;
  plexGuid?: string;
  cutoffAt?: string;
}

interface BackfillUser {
  id: number;
  plex_user_id: string | null;
  plex_username: string;
  display_name: string;
}

interface Summary {
  users: number;
  visibleUsers: number;
  movies: number;
  imported: number;
  dryRunImportable: number;
  alreadyCovered: number;
  confirmedNotWatched: number;
  postCutoff: number;
  skipped: number;
  notFoundInPlex: number;
  notPlexVisible: number;
  plexUnavailable: number;
  outcomes: Record<string, number>;
}

interface BackfillResult {
  ok: boolean;
  runId: string;
  mode: "dry_run" | "apply";
  cutoffAt: string;
  backupCreated: boolean;
  summary: Summary;
  users: Array<Record<string, unknown>>;
}

interface SnapshotRow {
  userId: number;
  plexUserId: string | null;
  state: PlexHistoricalMovieState;
  cutoffAt: string;
  outcome: BackfillOutcome;
  errorCode?: string;
  importedObservationId?: number;
}

export class PlexHistoricalMovieBackfillService {
  private readonly audit: AuditService;

  constructor(private readonly db: Db, private readonly plex: PlexAdapter, private readonly sqlitePath = appConfig.SQLITE_PATH) {
    this.audit = new AuditService(db);
  }

  async run(options: BackfillOptions): Promise<BackfillResult> {
    const cutoffAt = this.parseCutoff(options.cutoffAt);
    const runId = randomUUID();
    const mode = options.apply ? "apply" : "dry_run";
    const summary = this.emptySummary();
    const userResults: Array<Record<string, unknown>> = [];

    if (options.apply && !options.confirm) {
      return {
        ok: false,
        runId,
        mode,
        cutoffAt,
        backupCreated: false,
        summary,
        users: [],
        error: { code: "CONFIRM_REQUIRED", message: "Apply mode requires --confirm." }
      } as BackfillResult;
    }

    const users = this.selectUsers(options.user);
    summary.users = users.length;
    let plexUsers: PlexUser[];
    try {
      plexUsers = await this.plex.listUsers();
    } catch {
      plexUsers = [];
    }

    if (options.apply) {
      this.createBackup();
      this.db.prepare(`
        INSERT INTO plex_historical_backfill_runs (id, cutoff_at, mode, status, started_at)
        VALUES (?, ?, ?, 'running', ?)
      `).run(runId, cutoffAt, mode, new Date().toISOString());
      this.audit.record("plex_historical_backfill_started", "cli", "started", {
        runId, mode, cutoffAt, userCount: users.length
      });
    }

    try {
      for (const user of users) {
        const visiblePlexUser = plexUsers.find((plexUser) =>
          (user.plex_user_id && String(plexUser.id) === String(user.plex_user_id)) ||
          plexUser.username.toLowerCase() === user.plex_username.toLowerCase()
        );
        const visible = Boolean(visiblePlexUser);
        if (!visible) {
          summary.notPlexVisible += 1;
          this.increment(summary, "not_plex_visible");
          const result = {
            userId: user.id,
            username: user.plex_username,
            status: "not_plex_visible",
            visibility: "not_plex_visible",
            outcome: "not_plex_visible"
          };
          userResults.push(result);
          if (options.apply) this.persistUserResult(runId, user, result);
          continue;
        }

        summary.visibleUsers += 1;
        const result = await this.processUser(user, visiblePlexUser!.id, runId, cutoffAt, options, summary);
        userResults.push(result);
        if (options.apply) this.persistUserResult(runId, user, result);
      }

      if (options.apply) {
        this.db.prepare(`
          UPDATE plex_historical_backfill_runs
          SET status = 'completed', completed_at = ?, summary_json = ?
          WHERE id = ?
        `).run(new Date().toISOString(), JSON.stringify(summary), runId);
        this.audit.record("plex_historical_backfill_completed", "cli", "completed", {
          runId, mode, cutoffAt, summary
        });
      }
      return { ok: true, runId, mode, cutoffAt, backupCreated: options.apply, summary, users: userResults };
    } catch (error) {
      if (options.apply) {
        this.db.prepare(`
          UPDATE plex_historical_backfill_runs
          SET status = 'failed', completed_at = ?, summary_json = ?
          WHERE id = ?
        `).run(new Date().toISOString(), JSON.stringify(summary), runId);
      }
      throw error;
    }
  }

  private async processUser(
    user: BackfillUser,
    plexUserId: string,
    runId: string,
    cutoffAt: string,
    options: BackfillOptions,
    summary: Summary
  ): Promise<Record<string, unknown>> {
    let states: PlexHistoricalMovieState[];
    try {
      states = this.plex.listUserMovieStates ? await this.plex.listUserMovieStates(plexUserId) : [];
    } catch {
      summary.plexUnavailable += 1;
      this.increment(summary, "plex_unavailable");
      return {
        userId: user.id,
        username: user.plex_username,
        status: "plex_unavailable",
        visibility: "visible",
        outcome: "plex_unavailable"
      };
    }

    const filtered = states.filter((state) =>
      (!options.ratingKey || state.ratingKey === options.ratingKey) &&
      (!options.plexGuid || state.guid === options.plexGuid)
    );
    if (filtered.length === 0) {
      summary.notFoundInPlex += 1;
      this.increment(summary, "not_found_in_plex");
      return {
        userId: user.id,
        username: user.plex_username,
        status: "not_found_in_plex",
        visibility: "visible",
        outcome: "not_found_in_plex"
      };
    }

    const userSummary = { userId: user.id, username: user.plex_username, visibility: "visible", status: "completed", movies: filtered.length, outcomes: {} as Record<string, number> };
    for (const state of filtered) {
      summary.movies += 1;
      const snapshot = await this.classifyState(user, state, cutoffAt, options);
      this.increment(summary, snapshot.outcome);
      this.increment(userSummary, snapshot.outcome);
      if (snapshot.outcome === "imported") summary.imported += 1;
      if (snapshot.outcome === "dry_run_importable") summary.dryRunImportable += 1;
      if (snapshot.outcome === "already_covered") summary.alreadyCovered += 1;
      if (snapshot.outcome === "confirmed_not_watched") summary.confirmedNotWatched += 1;
      if (snapshot.outcome === "post_cutoff") summary.postCutoff += 1;
      if (["missing_guid", "missing_timestamp", "invalid_timestamp", "ambiguous_identity"].includes(snapshot.outcome)) summary.skipped += 1;
      if (options.apply) this.persistSnapshot(runId, snapshot);
    }
    return userSummary;
  }

  private async classifyState(user: BackfillUser, state: PlexHistoricalMovieState, cutoffAt: string, options: BackfillOptions): Promise<SnapshotRow> {
    let outcome: BackfillOutcome;
    let errorCode: string | undefined;
    let importedObservationId: number | undefined;
    const timestamp = state.lastViewedAt ? new Date(state.lastViewedAt) : undefined;

    if (!state.guid) {
      outcome = "missing_guid";
      errorCode = "PLEX_GUID_REQUIRED";
    } else if (!state.lastViewedAt) {
      outcome = state.viewCount === 0 ? "confirmed_not_watched" : "missing_timestamp";
      errorCode = state.viewCount === 0 ? undefined : "LAST_VIEWED_AT_REQUIRED";
    } else if (!timestamp || Number.isNaN(timestamp.getTime())) {
      outcome = "invalid_timestamp";
      errorCode = "INVALID_LAST_VIEWED_AT";
    } else if (timestamp.toISOString() >= cutoffAt) {
      outcome = "post_cutoff";
    } else {
      const identity = await this.resolveIdentity(user.id, state);
      if (identity.ambiguous) {
        outcome = "ambiguous_identity";
        errorCode = "AMBIGUOUS_EXACT_GUID";
      } else {
        const ratingKey = identity.ratingKey;
        const existing = this.db.prepare(`
          SELECT id FROM playback_observations
          WHERE user_id = ? AND watched_at = ? AND (rating_key = ? OR (plex_guid = ? AND plex_guid IS NOT NULL))
          LIMIT 1
        `).get(user.id, timestamp.toISOString(), ratingKey, state.guid) as { id: number } | undefined;
        if (existing) {
          outcome = "already_covered";
          importedObservationId = existing.id;
        } else if (options.apply) {
          const result = this.db.prepare(`
            INSERT INTO playback_observations (
              user_id, rating_key, plex_guid, media_type, library_name, title,
              watched_at, watched_at_provenance, percent_complete_provenance,
              completed, created_at, updated_at
            ) VALUES (?, ?, ?, 'movie', ?, ?, ?, ?, 'unknown', 1, ?, ?)
          `).run(
            user.id, ratingKey, state.guid, state.librarySectionTitle ?? null, state.title,
            timestamp.toISOString(), PROVENANCE, new Date().toISOString(), new Date().toISOString()
          );
          importedObservationId = Number(result.lastInsertRowid);
          outcome = "imported";
        } else {
          outcome = "dry_run_importable";
        }
      }
    }

    return { userId: user.id, plexUserId: user.plex_user_id, state, cutoffAt, outcome, errorCode, importedObservationId };
  }

  private async resolveIdentity(userId: number, state: PlexHistoricalMovieState): Promise<{ ratingKey: string; ambiguous: boolean }> {
    const matching = this.db.prepare(`
      SELECT DISTINCT rating_key, plex_guid AS guid FROM playback_observations
      WHERE user_id = ? AND ((plex_guid = ? AND plex_guid IS NOT NULL) OR rating_key = ?)
      UNION
      SELECT DISTINCT rating_key, guid FROM content_catalog
      WHERE (guid = ? AND guid IS NOT NULL) OR rating_key = ?
    `).all(userId, state.guid ?? null, state.ratingKey, state.guid ?? null, state.ratingKey) as Array<{ rating_key: string; guid?: string | null }>;
    const keys = new Set(matching.map((row) => row.rating_key).filter(Boolean));
    const conflictingIdentity = matching.some((row) => row.guid && row.guid !== state.guid);
    if (this.plex.resolveActiveRatingKey) {
      try {
        keys.add(await this.plex.resolveActiveRatingKey(state.ratingKey, state.guid));
      } catch {
        // The exact Plex GUID and returned rating key remain the bounded fallback.
      }
    }
    return { ratingKey: [...keys][0] ?? state.ratingKey, ambiguous: conflictingIdentity };
  }

  private persistSnapshot(runId: string, row: SnapshotRow): void {
    const now = new Date().toISOString();
    const snapshotKey = createHash("sha256").update(JSON.stringify({
      userId: row.userId,
      guid: row.state.guid ?? null,
      ratingKey: row.state.ratingKey,
      lastViewedAt: row.state.lastViewedAt ?? null,
      viewCount: row.state.viewCount ?? null
    })).digest("hex");
    this.db.prepare(`
      INSERT INTO plex_historical_movie_snapshots (
        snapshot_key, run_id, user_id, plex_user_id, rating_key, plex_guid, title,
        library_name, view_count, last_viewed_at, cutoff_at, queried_at, outcome,
        error_code, imported_observation_id, first_seen_at, last_seen_at, seen_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(snapshot_key) DO UPDATE SET
        run_id = excluded.run_id, queried_at = excluded.queried_at,
        outcome = excluded.outcome, error_code = excluded.error_code,
        imported_observation_id = COALESCE(excluded.imported_observation_id, plex_historical_movie_snapshots.imported_observation_id),
        last_seen_at = excluded.last_seen_at, seen_count = plex_historical_movie_snapshots.seen_count + 1
    `).run(
      snapshotKey, runId, row.userId, row.plexUserId, row.state.ratingKey, row.state.guid ?? null,
      row.state.title, row.state.librarySectionTitle ?? null, row.state.viewCount ?? null,
      row.state.lastViewedAt ?? null, row.cutoffAt, now, row.outcome, row.errorCode ?? null,
      row.importedObservationId ?? null, now, now
    );
  }

  private persistUserResult(runId: string, user: BackfillUser, result: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const outcomes = (result.outcomes ?? {}) as Record<string, number>;
    this.db.prepare(`
      INSERT INTO plex_historical_backfill_users (
        run_id, user_id, plex_user_id, plex_username, visibility_status, status,
        movie_count, imported_count, duplicate_count, skipped_count, failed_count,
        error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId, user.id, user.plex_user_id, user.plex_username,
      String(result.visibility ?? "visible"), String(result.status ?? "completed"),
      Number(result.movies ?? 0), outcomes.imported ?? 0, outcomes.already_covered ?? 0,
      Object.entries(outcomes).filter(([key]) => ["missing_guid", "missing_timestamp", "invalid_timestamp", "ambiguous_identity"].includes(key)).reduce((sum, [, value]) => sum + value, 0),
      outcomes.plex_unavailable ?? 0, null, now, now
    );
  }

  private selectUsers(username?: string): BackfillUser[] {
    const rows = this.db.prepare(`
      SELECT id, plex_user_id, plex_username, display_name
      FROM users WHERE enabled = 1 AND plex_user_id IS NOT NULL
      ORDER BY display_name ASC
    `).all() as unknown as BackfillUser[];
    return username ? rows.filter((row) => row.plex_username.toLowerCase() === username.toLowerCase()) : rows;
  }

  private parseCutoff(value?: string): string {
    const cutoff = value ?? DEFAULT_CUTOFF;
    const date = new Date(cutoff);
    if (Number.isNaN(date.getTime())) throw new Error("INVALID_CUTOFF");
    return date.toISOString();
  }

  private emptySummary(): Summary {
    return { users: 0, visibleUsers: 0, movies: 0, imported: 0, dryRunImportable: 0, alreadyCovered: 0, confirmedNotWatched: 0, postCutoff: 0, skipped: 0, notFoundInPlex: 0, notPlexVisible: 0, plexUnavailable: 0, outcomes: {} };
  }

  private createBackup(): void {
    const source = path.resolve(this.sqlitePath);
    if (!fs.existsSync(source)) throw new Error("PLEX_HISTORICAL_BACKFILL_DATABASE_NOT_FOUND");
    const backupDir = path.join(path.dirname(source), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const destination = path.join(backupDir, `pre-plex-historical-backfill-${timestamp}.sqlite`);
    const escaped = destination.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
    if (!fs.existsSync(destination) || fs.statSync(destination).size === 0) {
      throw new Error("PLEX_HISTORICAL_BACKFILL_BACKUP_FAILED");
    }
  }

  private increment(target: { outcomes?: Record<string, number> } | Record<string, unknown>, key: string): void {
    const outcomes = "outcomes" in target && target.outcomes ? target.outcomes as Record<string, number> : undefined;
    if (outcomes) outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
}

export type { BackfillOptions, BackfillResult };
