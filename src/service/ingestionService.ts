import type { Db } from "../db/database.js";
import type { TautulliAdapter } from "../adapters/tautulliAdapter.js";
import type { TautulliHistoryRow } from "../types/index.js";
import { UserService } from "./userService.js";
import { AuditService } from "./auditService.js";
import { nowIso } from "../utils/time.js";
import { countsAsCompleted } from "../watcher/watcher.js";
import { isDuplicateWithinWindow } from "../watcher/dedupe.js";
import type { MetadataService } from "./metadataService.js";
import { isAudiobookMedia } from "./audiobookService.js";

export class IngestionService {
  private readonly users: UserService;
  private readonly audit: AuditService;

  constructor(
    private readonly db: Db,
    private readonly tautulli: TautulliAdapter,
    private readonly metadata?: MetadataService
  ) {
    this.users = new UserService(db);
    this.audit = new AuditService(db);
  }

  /**
   * Main polling entry point. Polls the recent history for all enabled configured users.
   */
  async pollRecentHistory(length = 100): Promise<{ inserted: number; skipped: number; errors: number }> {
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    const enabledUsers = this.users.listEnabledUsers();
    for (const user of enabledUsers) {
      try {
        const rows = await this.tautulli.getRecentHistory({ user: user.plex_username, length });
        for (const row of rows) {
          const result = this.ingestRow(user.id, row);
          if (result.inserted) {
            inserted++;
          } else {
            skipped++;
          }
        }
      } catch (err) {
        errors++;
        this.audit.record(
          "ingestion_poll_error",
          "ingestionService",
          "error",
          { username: user.plex_username },
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    if (this.metadata) {
      const repair = await this.metadata.repairMissingMetadata();
      if (repair.attempted > 0) {
        this.audit.record("metadata_auto_repair", "ingestionService", repair.failed > 0 ? "partial" : "ok", repair);
      }
    }

    return { inserted, skipped, errors };
  }

  /**
   * Backfills history fully for all enabled users or a specific user.
   */
  async backfillHistory(userId?: number, pageSize = 200): Promise<{ inserted: number; skipped: number; errors: number }> {
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    const enabledUsers = userId 
      ? [this.users.findById(userId)].filter(Boolean) as { id: number; plex_username: string }[]
      : this.users.listEnabledUsers();

    for (const user of enabledUsers) {
      let start = 0;
      let consecutiveEmpty = 0;

      while (true) {
        try {
          const rows = await this.tautulli.getRecentHistory({
            user: user.plex_username,
            start,
            length: pageSize
          });

          if (rows.length === 0) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 1) break; // stop paging
            start += pageSize;
            continue;
          }
          consecutiveEmpty = 0;

          for (const row of rows) {
            const result = this.ingestRow(user.id, row);
            if (result.inserted) {
              inserted++;
            } else {
              skipped++;
            }
          }

          start += pageSize;
          // Polite delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (err) {
          errors++;
          this.audit.record(
            "ingestion_backfill_error",
            "ingestionService",
            "error",
            { username: user.plex_username, start },
            err instanceof Error ? err.message : String(err)
          );
          break; // Stop backfill on error for this user
        }
      }
    }

    return { inserted, skipped, errors };
  }

  /**
   * Ingests a single Tautulli history row.
   * If it's a completed watch for a source user, it also inserts it into watch_events (Phase 1)
   * to ensure no duplicate prompts are generated while keeping Phase 1 functionality working.
   */
  ingestRow(userId: number, row: TautulliHistoryRow): { inserted: boolean; watchEventId?: number } {
    const now = nowIso();
    const completedVal = (row.completed || countsAsCompleted(row)) ? 1 : 0;

    const mediaType = isAudiobookMedia(row) ? "audiobook" : row.mediaType;
    const sourceUser = this.users.findSourceById(userId);
    const watchEventId = sourceUser && countsAsCompleted(row)
      ? this.maybeInsertWatchEvent(userId, row, mediaType, now)
      : undefined;

    // Check if the record already exists to determine if we should count it as inserted/skipped
    const existing = this.db.prepare(
      "SELECT id FROM playback_observations WHERE user_id = ? AND rating_key = ? AND watched_at = ?"
    ).get(userId, row.ratingKey, row.watchedAt);

    if (existing) {
      this.db.prepare(
        `UPDATE playback_observations SET
          tautulli_row_id = ?,
          media_type = ?,
          percent_complete = ?,
          percent_complete_provenance = ?,
          view_offset = ?,
          duration = ?,
          session_start_at = ?,
          session_end_at = ?,
          completed = ?,
          updated_at = ?
        WHERE id = ?`
      ).run(
        row.rowId ?? null,
        mediaType,
        row.percentComplete ?? null,
        row.percentCompleteProvenance ?? null,
        row.viewOffset ?? null,
        row.duration ?? null,
        row.sessionStartAt ?? null,
        row.sessionEndAt ?? null,
        completedVal,
        now,
        (existing as { id: number }).id
      );

      return { inserted: false, watchEventId };
    }

    // Insert new playback observation
    const insertResult = this.db.prepare(
      `INSERT INTO playback_observations (
        user_id, tautulli_row_id, rating_key, grandparent_rating_key, parent_rating_key,
        plex_guid, media_type, library_name, title, show_title, season_number, episode_number,
        watched_at, watched_at_provenance, percent_complete, percent_complete_provenance,
        view_offset, duration, session_start_at, session_end_at, completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      row.rowId ?? null,
      row.ratingKey,
      row.grandparentRatingKey ?? null,
      row.parentRatingKey ?? null,
      row.plexGuid ?? null,
      mediaType,
      row.libraryName ?? null,
      row.title,
      row.showTitle ?? null,
      row.seasonNumber ?? null,
      row.episodeNumber ?? null,
      row.watchedAt,
      row.watchedAtProvenance ?? null,
      row.percentComplete ?? null,
      row.percentCompleteProvenance ?? null,
      row.viewOffset ?? null,
      row.duration ?? null,
      row.sessionStartAt ?? null,
      row.sessionEndAt ?? null,
      completedVal,
      now,
      now
    );

    if (insertResult.changes === 0) {
      return { inserted: false };
    }

    if (this.metadata && (mediaType === "movie" || mediaType === "episode" || mediaType === "audiobook")) {
      const catalogKey = mediaType === "episode" ? row.grandparentRatingKey : (mediaType === "audiobook" ? row.grandparentRatingKey ?? row.parentRatingKey ?? row.ratingKey : row.ratingKey);
      if (catalogKey) {
        this.metadata.getMetadata(catalogKey, mediaType === "movie" ? row.plexGuid : undefined).catch(err => {
          console.warn(`[IngestionService] Failed to cache metadata for ${catalogKey}:`, err);
        });
      }
    }

    if (row.grandparentRatingKey && this.metadata) {
      this.metadata.checkAndAutoHealShow(row.grandparentRatingKey).catch(err => {
        console.warn(`[IngestionService] Failed to auto-heal show ${row.grandparentRatingKey}:`, err);
      });
    }

    return { inserted: true, watchEventId };
  }

  private hasNearbyWatchEventDuplicate(sourceUserId: number, ratingKey: string, watchedAt: string): boolean {
    const existingRows = this.db
      .prepare("SELECT watched_at FROM watch_events WHERE source_user_id = ? AND rating_key = ?")
      .all(sourceUserId, ratingKey) as { watched_at: string }[];

    return existingRows.some((existing) => isDuplicateWithinWindow(existing.watched_at, watchedAt));
  }

  private maybeInsertWatchEvent(
    sourceUserId: number,
    row: TautulliHistoryRow,
    mediaType: string,
    now: string
  ): number | undefined {
    // Tautulli may return a display name instead of the configured Plex username.
    // The polling loop has already resolved this row to a configured user ID.
    if (this.hasNearbyWatchEventDuplicate(sourceUserId, row.ratingKey, row.watchedAt)) {
      return undefined;
    }

    const eventDate = new Date(row.watchedAt).getTime();
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
    let initialPromptStatus = eventDate > twoDaysAgo ? "pending" : "dismissed";

    if (initialPromptStatus === "pending" && mediaType === "audiobook") {
      const settingRow = this.db.prepare("SELECT value FROM app_settings WHERE key = 'prompt_for_audiobooks'").get() as { value: string } | undefined;
      if (!settingRow || settingRow.value !== "true") {
        initialPromptStatus = "dismissed";
      }
    }

    const watchEventResult = this.db.prepare(
      `INSERT OR IGNORE INTO watch_events (
        source_user_id, tautulli_row_id, rating_key, grandparent_rating_key, parent_rating_key,
        plex_guid, media_type, library_name, title, show_title, season_number, episode_number,
        watched_at, prompt_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sourceUserId,
      row.rowId ?? null,
      row.ratingKey,
      row.grandparentRatingKey ?? null,
      row.parentRatingKey ?? null,
      row.plexGuid ?? null,
      mediaType,
      row.libraryName ?? null,
      row.title,
      row.showTitle ?? null,
      row.seasonNumber ?? null,
      row.episodeNumber ?? null,
      row.watchedAt,
      initialPromptStatus,
      now,
      now
    );

    if (watchEventResult.changes > 0) {
      const watchEventId = Number(watchEventResult.lastInsertRowid);
      this.audit.record("detect_watch_event", "ingestion", "ok", {
        watchEventId,
        sourceUserId,
        ratingKey: row.ratingKey,
        mediaType,
        watchedAt: row.watchedAt
      });
      return watchEventId;
    }

    return undefined;
  }
}
