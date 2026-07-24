import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { Db } from "../db/database.js";
import type { PlexHistoricalMediaState, PlexUser } from "../types/index.js";
import { appConfig } from "../utils/config.js";
import { AuditService } from "./auditService.js";

const DEFAULT_CUTOFF = "2022-01-01T00:00:00.000Z";
const PROVENANCE = "plex_historical_last_view";
const RECONCILIATION_WINDOW_SECONDS = 900;

type MediaScope = "movie" | "episode" | "all";
type SourceStatus = "unknown" | "plex_only" | "tautulli_backed" | "reconciled";
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
  mediaType?: MediaScope;
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
  episodes: number;
  imported: number;
  dryRunImportable: number;
  alreadyCovered: number;
  confirmedNotWatched: number;
  postCutoff: number;
  skipped: number;
  notFoundInPlex: number;
  notPlexVisible: number;
  plexUnavailable: number;
  mediaTypes: Record<string, number>;
  sourceStatuses: Record<SourceStatus, number>;
  outcomes: Record<string, number>;
}

interface BackfillResult {
  ok: boolean;
  runId: string;
  mode: "dry_run" | "apply";
  cutoffAt: string;
  mediaType: MediaScope;
  backupCreated: boolean;
  summary: Summary;
  users: Array<Record<string, unknown>>;
}

interface SnapshotRow {
  userId: number;
  plexUserId: string | null;
  state: PlexHistoricalMediaState;
  cutoffAt: string;
  outcome: BackfillOutcome;
  sourceStatus: SourceStatus;
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
    const mediaType = this.parseMediaScope(options.mediaType);
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
        mediaType,
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
        runId, mode, mediaType, cutoffAt, userCount: users.length
      });
    }

    try {
      for (const user of users) {
        const visiblePlexUser = plexUsers.find((plexUser) =>
          (user.plex_user_id && String(plexUser.id) === String(user.plex_user_id)) ||
          plexUser.username.toLowerCase() === user.plex_username.toLowerCase()
        );
        if (!visiblePlexUser) {
          summary.notPlexVisible += 1;
          this.increment(summary, "not_plex_visible");
          this.incrementSourceStatus(summary, "unknown");
          const result = {
            userId: user.id,
            username: user.plex_username,
            status: "not_plex_visible",
            visibility: "not_plex_visible",
            outcome: "not_plex_visible",
            mediaType
          };
          userResults.push(result);
          if (options.apply) this.persistUserResult(runId, user, result);
          continue;
        }

        summary.visibleUsers += 1;
        const result = await this.processUser(user, visiblePlexUser.id, runId, cutoffAt, mediaType, options, summary);
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
          runId, mode, mediaType, cutoffAt, summary
        });
      }
      return { ok: true, runId, mode, cutoffAt, mediaType, backupCreated: options.apply, summary, users: userResults };
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
    mediaType: MediaScope,
    options: BackfillOptions,
    summary: Summary
  ): Promise<Record<string, unknown>> {
    let states: PlexHistoricalMediaState[];
    try {
      states = await this.listStates(plexUserId, mediaType);
    } catch {
      summary.plexUnavailable += 1;
      this.increment(summary, "plex_unavailable");
      this.incrementSourceStatus(summary, "unknown");
      return {
        userId: user.id,
        username: user.plex_username,
        status: "plex_unavailable",
        visibility: "visible",
        outcome: "plex_unavailable",
        mediaType
      };
    }

    const filtered = states.filter((state) =>
      (!options.ratingKey || state.ratingKey === options.ratingKey) &&
      (!options.plexGuid || state.guid === options.plexGuid)
    );
    if (filtered.length === 0) {
      summary.notFoundInPlex += 1;
      this.increment(summary, "not_found_in_plex");
      this.incrementSourceStatus(summary, "unknown");
      return {
        userId: user.id,
        username: user.plex_username,
        status: "not_found_in_plex",
        visibility: "visible",
        outcome: "not_found_in_plex",
        mediaType
      };
    }

    const userSummary = {
      userId: user.id,
      username: user.plex_username,
      visibility: "visible",
      status: "completed",
      mediaType,
      items: filtered.length,
      movies: filtered.filter((state) => state.mediaType === "movie").length,
      episodes: filtered.filter((state) => state.mediaType === "episode").length,
      outcomes: {} as Record<string, number>,
      sourceStatuses: {} as Record<string, number>
    };
    const seenPlexIdentities = new Set(filtered.map((state) => state.guid ?? `rating:${state.mediaType}:${state.ratingKey}`));
    for (const state of filtered) {
      summary.mediaTypes[state.mediaType] = (summary.mediaTypes[state.mediaType] ?? 0) + 1;
      if (state.mediaType === "movie") summary.movies += 1;
      if (state.mediaType === "episode") summary.episodes += 1;
      const snapshot = await this.classifyState(user, state, cutoffAt, options);
      this.increment(summary, snapshot.outcome);
      this.increment(userSummary, snapshot.outcome);
      this.incrementSourceStatus(summary, snapshot.sourceStatus);
      this.incrementSourceStatus(userSummary, snapshot.sourceStatus);
      if (snapshot.outcome === "imported") summary.imported += 1;
      if (snapshot.outcome === "dry_run_importable") summary.dryRunImportable += 1;
      if (snapshot.outcome === "already_covered") summary.alreadyCovered += 1;
      if (snapshot.outcome === "confirmed_not_watched") summary.confirmedNotWatched += 1;
      if (snapshot.outcome === "post_cutoff") summary.postCutoff += 1;
      if (["missing_guid", "missing_timestamp", "invalid_timestamp", "ambiguous_identity"].includes(snapshot.outcome)) summary.skipped += 1;
      if (options.apply) this.persistSnapshot(runId, snapshot);
    }

    if (!options.ratingKey && !options.plexGuid) {
      this.countTautulliBacked(user.id, cutoffAt, mediaType, seenPlexIdentities, summary, userSummary);
    }
    return userSummary;
  }

  private async listStates(userId: string, mediaType: MediaScope): Promise<PlexHistoricalMediaState[]> {
    const states: PlexHistoricalMediaState[] = [];
    if (mediaType === "movie" || mediaType === "all") {
      if (this.plex.listUserMovieStates) states.push(...await this.plex.listUserMovieStates(userId));
    }
    if (mediaType === "episode" || mediaType === "all") {
      if (this.plex.listUserEpisodeStates) states.push(...await this.plex.listUserEpisodeStates(userId));
    }
    return states;
  }

  private async classifyState(user: BackfillUser, state: PlexHistoricalMediaState, cutoffAt: string, options: BackfillOptions): Promise<SnapshotRow> {
    let outcome: BackfillOutcome;
    let sourceStatus: SourceStatus = "unknown";
    let errorCode: string | undefined;
    let importedObservationId: number | undefined;
    const timestamp = state.lastViewedAt ? new Date(state.lastViewedAt) : undefined;

    if (!state.guid) {
      outcome = "missing_guid";
      errorCode = "PLEX_GUID_REQUIRED";
    } else if (!state.lastViewedAt) {
      outcome = "missing_timestamp";
      errorCode = "LAST_VIEWED_AT_REQUIRED";
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
        const reconciled = this.hasTautulliMatch(user.id, state, timestamp);
        sourceStatus = reconciled ? "reconciled" : "plex_only";
        const existing = this.db.prepare(`
          SELECT id FROM playback_observations
          WHERE user_id = ? AND media_type = ? AND watched_at = ?
            AND (rating_key = ? OR (plex_guid = ? AND plex_guid IS NOT NULL))
          LIMIT 1
        `).get(user.id, state.mediaType, timestamp.toISOString(), ratingKey, state.guid) as { id: number } | undefined;
        if (existing) {
          outcome = "already_covered";
          importedObservationId = existing.id;
        } else if (options.apply) {
          const episode = state.mediaType === "episode" ? state : undefined;
          const result = this.db.prepare(`
            INSERT INTO playback_observations (
              user_id, rating_key, grandparent_rating_key, parent_rating_key, plex_guid,
              media_type, library_name, title, show_title, season_number, episode_number,
              watched_at, watched_at_provenance, percent_complete_provenance,
              completed, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', 1, ?, ?)
          `).run(
            user.id,
            ratingKey,
            episode?.grandparentRatingKey ?? null,
            episode?.parentRatingKey ?? null,
            state.guid,
            state.mediaType,
            state.librarySectionTitle ?? null,
            state.title,
            episode?.grandparentTitle ?? null,
            episode?.seasonNumber ?? null,
            episode?.episodeNumber ?? null,
            timestamp.toISOString(),
            PROVENANCE,
            new Date().toISOString(),
            new Date().toISOString()
          );
          importedObservationId = Number(result.lastInsertRowid);
          outcome = "imported";
        } else {
          outcome = "dry_run_importable";
        }
      }
    }

    return { userId: user.id, plexUserId: user.plex_user_id, state, cutoffAt, outcome, sourceStatus, errorCode, importedObservationId };
  }

  private async resolveIdentity(userId: number, state: PlexHistoricalMediaState): Promise<{ ratingKey: string; ambiguous: boolean }> {
    const matching = this.db.prepare(`
      SELECT DISTINCT rating_key, plex_guid AS guid FROM playback_observations
      WHERE user_id = ? AND media_type = ?
        AND ((plex_guid = ? AND plex_guid IS NOT NULL) OR rating_key = ?)
      UNION
      SELECT DISTINCT rating_key, guid FROM content_catalog
      WHERE media_type = ? AND ((guid = ? AND guid IS NOT NULL) OR rating_key = ?)
    `).all(userId, state.mediaType, state.guid ?? null, state.ratingKey, state.mediaType, state.guid ?? null, state.ratingKey) as Array<{ rating_key: string; guid?: string | null }>;
    const keys = new Set(matching.map((row) => row.rating_key).filter(Boolean));
    const conflictingIdentity = matching.some((row) => row.guid && row.guid !== state.guid);
    if (this.plex.resolveActiveRatingKey) {
      try {
        keys.add(await this.plex.resolveActiveRatingKey(state.ratingKey, state.guid));
      } catch {
        // Exact GUID and returned rating key remain the bounded fallback.
      }
    }
    return { ratingKey: [...keys][0] ?? state.ratingKey, ambiguous: conflictingIdentity };
  }

  private hasTautulliMatch(userId: number, state: PlexHistoricalMediaState, timestamp: Date): boolean {
    const row = this.db.prepare(`
      SELECT 1 FROM playback_observations
      WHERE user_id = ? AND media_type = ? AND tautulli_row_id IS NOT NULL
        AND plex_guid = ? AND abs(strftime('%s', watched_at) - strftime('%s', ?)) <= ?
      LIMIT 1
    `).get(userId, state.mediaType, state.guid ?? null, timestamp.toISOString(), RECONCILIATION_WINDOW_SECONDS);
    return Boolean(row);
  }

  private countTautulliBacked(
    userId: number,
    cutoffAt: string,
    mediaType: MediaScope,
    seenPlexIdentities: Set<string>,
    summary: Summary,
    userSummary: Record<string, unknown>
  ): void {
    const types = mediaType === "all" ? ["movie", "episode"] : [mediaType];
    const placeholders = types.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT plex_guid, rating_key FROM playback_observations
      WHERE user_id = ? AND tautulli_row_id IS NOT NULL AND watched_at < ?
        AND media_type IN (${placeholders})
    `).all(userId, cutoffAt, ...types) as Array<{ plex_guid?: string | null; rating_key: string }>;
    for (const row of rows) {
      const identity = row.plex_guid ?? `rating:${row.rating_key}`;
      if (seenPlexIdentities.has(identity)) continue;
      this.incrementSourceStatus(summary, "tautulli_backed");
      this.incrementSourceStatus(userSummary, "tautulli_backed");
      seenPlexIdentities.add(identity);
    }
  }

  private persistSnapshot(runId: string, row: SnapshotRow): void {
    const now = new Date().toISOString();
    const state = row.state;
    const episode = state.mediaType === "episode" ? state : undefined;
    const snapshotKey = createHash("sha256").update(JSON.stringify({
      userId: row.userId,
      mediaType: state.mediaType,
      guid: state.guid ?? null,
      ratingKey: state.ratingKey,
      lastViewedAt: state.lastViewedAt ?? null,
      viewCount: state.viewCount ?? null
    })).digest("hex");
    this.db.prepare(`
      INSERT INTO plex_historical_recovery_items (
        snapshot_key, run_id, user_id, plex_user_id, media_type, rating_key, plex_guid,
        grandparent_rating_key, parent_rating_key, title, show_title, season_number,
        episode_number, library_name, view_count, last_viewed_at, cutoff_at, queried_at,
        outcome, source_status, error_code, imported_observation_id, first_seen_at, last_seen_at, seen_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(snapshot_key) DO UPDATE SET
        run_id = excluded.run_id, queried_at = excluded.queried_at,
        outcome = excluded.outcome, source_status = excluded.source_status,
        error_code = excluded.error_code,
        imported_observation_id = COALESCE(excluded.imported_observation_id, plex_historical_recovery_items.imported_observation_id),
        last_seen_at = excluded.last_seen_at, seen_count = plex_historical_recovery_items.seen_count + 1
    `).run(
      snapshotKey, runId, row.userId, row.plexUserId, state.mediaType, state.ratingKey, state.guid ?? null,
      episode?.grandparentRatingKey ?? null, episode?.parentRatingKey ?? null, state.title,
      episode?.grandparentTitle ?? null, episode?.seasonNumber ?? null, episode?.episodeNumber ?? null,
      state.librarySectionTitle ?? null, state.viewCount ?? null, state.lastViewedAt ?? null,
      row.cutoffAt, now, row.outcome, row.sourceStatus, row.errorCode ?? null, row.importedObservationId ?? null, now, now
    );
    if (state.mediaType === "movie") this.persistMovieSnapshot(runId, row, snapshotKey, now);
  }

  private persistMovieSnapshot(runId: string, row: SnapshotRow, snapshotKey: string, now: string): void {
    const state = row.state;
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
      snapshotKey, runId, row.userId, row.plexUserId, state.ratingKey, state.guid ?? null,
      state.title, state.librarySectionTitle ?? null, state.viewCount ?? null,
      state.lastViewedAt ?? null, row.cutoffAt, now, row.outcome, row.errorCode ?? null,
      row.importedObservationId ?? null, now, now
    );
  }

  private persistUserResult(runId: string, user: BackfillUser, result: Record<string, unknown>): void {
    const now = new Date().toISOString();
    const outcomes = (result.outcomes ?? {}) as Record<string, number>;
    this.db.prepare(`
      INSERT INTO plex_historical_backfill_users (
        run_id, user_id, plex_user_id, plex_username, visibility_status, status,
        movie_count, episode_count, imported_count, duplicate_count, skipped_count, failed_count,
        error_code, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId, user.id, user.plex_user_id, user.plex_username,
      String(result.visibility ?? "visible"), String(result.status ?? "completed"),
      Number(result.movies ?? 0), Number(result.episodes ?? 0), outcomes.imported ?? 0, outcomes.already_covered ?? 0,
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

  private parseMediaScope(value?: MediaScope): MediaScope {
    if (!value || value === "movie" || value === "episode" || value === "all") return value ?? "movie";
    throw new Error("INVALID_MEDIA_TYPE");
  }

  private emptySummary(): Summary {
    return {
      users: 0,
      visibleUsers: 0,
      movies: 0,
      episodes: 0,
      imported: 0,
      dryRunImportable: 0,
      alreadyCovered: 0,
      confirmedNotWatched: 0,
      postCutoff: 0,
      skipped: 0,
      notFoundInPlex: 0,
      notPlexVisible: 0,
      plexUnavailable: 0,
      mediaTypes: {},
      sourceStatuses: { unknown: 0, plex_only: 0, tautulli_backed: 0, reconciled: 0 },
      outcomes: {}
    };
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

  private incrementSourceStatus(target: { sourceStatuses?: Record<string, number> }, key: SourceStatus): void {
    if (target.sourceStatuses) target.sourceStatuses[key] = (target.sourceStatuses[key] ?? 0) + 1;
  }
}

export type { BackfillOptions, BackfillResult, MediaScope, SourceStatus };
export { PlexHistoricalMovieBackfillService as PlexSupplementalHistoricalRecoveryService };
