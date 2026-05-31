import type { Db } from "../db/database.js";
import type { TautulliHistoryRow } from "../types/index.js";
import type { TautulliAdapter } from "../adapters/tautulliAdapter.js";
import { appConfig } from "../utils/config.js";
import { nowIso } from "../utils/time.js";
import { UserService } from "../service/userService.js";
import { AuditService } from "../service/auditService.js";
import { isDuplicateWithinWindow } from "./dedupe.js";

export function countsAsCompleted(row: Pick<TautulliHistoryRow, "completed" | "percentComplete" | "viewOffset" | "duration">, threshold = appConfig.WATCH_COMPLETION_THRESHOLD_PERCENT): boolean {
  if (row.completed) return true;
  if (typeof row.percentComplete === "number") return row.percentComplete >= threshold;
  if (typeof row.viewOffset === "number" && typeof row.duration === "number" && row.duration > 0) {
    return (row.viewOffset / row.duration) * 100 >= threshold;
  }
  return false;
}

export class WatcherService {
  private readonly users: UserService;
  private readonly audit: AuditService;

  constructor(
    private readonly db: Db,
    private readonly tautulli?: TautulliAdapter
  ) {
    this.users = new UserService(db);
    this.audit = new AuditService(db);
  }

  insertWatchEvent(row: TautulliHistoryRow): number | undefined {
    const source = this.users.findSourceByUsername(row.user);
    if (!source || !countsAsCompleted(row)) return undefined;
    if (this.hasNearbyDuplicate(source.id, row.ratingKey, row.watchedAt)) return undefined;

    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO watch_events (
          source_user_id, tautulli_row_id, rating_key, grandparent_rating_key, parent_rating_key,
          plex_guid, media_type, library_name, title, show_title, season_number, episode_number,
          watched_at, prompt_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        source.id,
        row.rowId ?? null,
        row.ratingKey,
        row.grandparentRatingKey ?? null,
        row.parentRatingKey ?? null,
        row.plexGuid ?? null,
        row.mediaType,
        row.libraryName ?? null,
        row.title,
        row.showTitle ?? null,
        row.seasonNumber ?? null,
        row.episodeNumber ?? null,
        row.watchedAt,
        "pending",
        now,
        now
      );

    if (result.changes === 0) return undefined;

    const watchEventId = Number(result.lastInsertRowid);
    this.audit.record("detect_watch_event", "watcher", "ok", {
      watchEventId,
      sourceUserId: source.id,
      ratingKey: row.ratingKey,
      mediaType: row.mediaType,
      watchedAt: row.watchedAt
    });
    return watchEventId;
  }

  async pollRecentHistory(): Promise<{ inserted: number; skipped: number }> {
    if (!this.tautulli) throw new Error("Tautulli adapter is required to poll recent history");

    let inserted = 0;
    let skipped = 0;
    for (const source of this.users.listSourceUsers()) {
      const rows = await this.tautulli.getRecentHistory({ user: source.plex_username });
      for (const row of rows) {
        if (this.insertWatchEvent(row)) {
          inserted += 1;
        } else {
          skipped += 1;
        }
      }
    }

    return { inserted, skipped };
  }

  private hasNearbyDuplicate(sourceUserId: number, ratingKey: string, watchedAt: string): boolean {
    const existingRows = this.db
      .prepare("SELECT watched_at FROM watch_events WHERE source_user_id = ? AND rating_key = ?")
      .all(sourceUserId, ratingKey) as { watched_at: string }[];

    return existingRows.some((existing) => isDuplicateWithinWindow(existing.watched_at, watchedAt));
  }
}
