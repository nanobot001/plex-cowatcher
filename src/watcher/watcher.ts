import type { Db } from "../db/database.js";
import type { TautulliHistoryRow } from "../types/index.js";
import { appConfig } from "../utils/config.js";
import { nowIso } from "../utils/time.js";
import { UserService } from "../service/userService.js";

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

  constructor(private readonly db: Db) {
    this.users = new UserService(db);
  }

  insertWatchEvent(row: TautulliHistoryRow): number | undefined {
    const source = this.users.findByUsername(row.user);
    if (!source || !countsAsCompleted(row)) return undefined;
    const now = nowIso();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO watch_events (
          source_user_id, tautulli_row_id, rating_key, media_type, title, show_title,
          season_number, episode_number, watched_at, prompt_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(source.id, row.rowId ?? null, row.ratingKey, row.mediaType, row.title, row.showTitle ?? null, row.seasonNumber ?? null, row.episodeNumber ?? null, row.watchedAt, "pending", now, now);

    return result.lastInsertRowid ? Number(result.lastInsertRowid) : undefined;
  }
}
