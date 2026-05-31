import type { TautulliAdapter } from "../adapters/tautulliAdapter.js";
import type { Db } from "../db/database.js";
import { AppError, errorResult } from "../utils/errors.js";
import { nowIso } from "../utils/time.js";
import { AuditService } from "./auditService.js";
import { SyncService } from "./syncService.js";
import { UserService } from "./userService.js";

export interface PreviewCopyInput {
  sourceUser: string;
  targetUsers: string[];
  filters?: {
    mediaType?: string;
    showTitle?: string;
    seasonNumber?: number;
    dateFrom?: string;
    dateTo?: string;
    skipAlreadyWatched?: boolean;
  };
  dryRun?: boolean;
  actor?: string;
}

export class HistoryCopyService {
  private readonly audit: AuditService;
  private readonly users: UserService;

  constructor(
    private readonly db: Db,
    private readonly tautulli: TautulliAdapter,
    private readonly sync: SyncService
  ) {
    this.audit = new AuditService(db);
    this.users = new UserService(db);
  }

  async previewCopy(input: PreviewCopyInput) {
    try {
      const source = this.users.findByUsername(input.sourceUser);
      if (!source) throw new AppError("SOURCE_USER_NOT_FOUND", "Source user is not configured", { sourceUser: input.sourceUser });
      const targets = input.targetUsers.map((username) => this.users.findByUsername(username));
      if (targets.some((target) => !target)) {
        throw new AppError("TARGET_USER_NOT_FOUND", "One or more target users are not configured", { targetUsers: input.targetUsers });
      }

      const history = (await this.tautulli.getRecentHistory({ user: input.sourceUser })).filter((item) => {
        if (input.filters?.mediaType && item.mediaType !== input.filters.mediaType) return false;
        if (input.filters?.showTitle && item.showTitle !== input.filters.showTitle) return false;
        if (input.filters?.seasonNumber && item.seasonNumber !== input.filters.seasonNumber) return false;
        if (input.filters?.dateFrom && item.watchedAt < input.filters.dateFrom) return false;
        if (input.filters?.dateTo && item.watchedAt > `${input.filters.dateTo}T23:59:59`) return false;
        return true;
      });

      const now = nowIso();
      const targetIds = targets.map((target) => target!.id);
      const job = this.db
        .prepare(
          `INSERT INTO copy_jobs (
            source_user_id, target_user_ids_json, filter_json, status, preview_count,
            created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(source.id, JSON.stringify(targetIds), JSON.stringify(input.filters ?? {}), "previewed", history.length * targetIds.length, input.actor ?? "unknown", now);

      const insertItem = this.db.prepare(`
        INSERT OR IGNORE INTO copy_job_items (
          copy_job_id, target_user_id, rating_key, media_type, title, show_title,
          season_number, episode_number, watched_at, status, reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of history) {
        for (const targetId of targetIds) {
          insertItem.run(
            job.lastInsertRowid,
            targetId,
            item.ratingKey,
            item.mediaType,
            item.title,
            item.showTitle ?? null,
            item.seasonNumber ?? null,
            item.episodeNumber ?? null,
            item.watchedAt,
            "eligible",
            null,
            now,
            now
          );
        }
      }

      const response = {
        jobId: Number(job.lastInsertRowid),
        requiresConfirmation: true,
        summary: {
          itemsToCopy: history.length * targetIds.length,
          alreadyWatched: 0,
          unmatched: 0,
          failed: 0
        },
        items: history
      };
      this.audit.record("preview_history_copy", input.actor, "ok", response);
      return { ok: true, data: response };
    } catch (error) {
      this.audit.record("preview_history_copy", input.actor, "error", input, error instanceof Error ? error.message : String(error));
      return errorResult(error);
    }
  }

  async applyCopy(jobId: number, confirm: boolean, actor = "unknown") {
    try {
      if (!confirm) throw new AppError("CONFIRMATION_REQUIRED", "Copy apply requires confirm=true", { jobId });
      const job = this.db.prepare("SELECT * FROM copy_jobs WHERE id = ?").get(jobId);
      if (!job) throw new AppError("COPY_JOB_NOT_FOUND", "Copy job not found", { jobId }, false, 404);

      const items = this.db.prepare("SELECT * FROM copy_job_items WHERE copy_job_id = ? AND status = 'eligible'").all(jobId) as Array<{
        id: number;
        target_user_id: number;
        rating_key: string;
      }>;

      let copied = 0;
      let skipped = 0;
      let failed = 0;
      for (const item of items) {
        const target = this.users.findById(item.target_user_id);
        if (!target?.plex_user_id) {
          failed += 1;
          this.db.prepare("UPDATE copy_job_items SET status = ?, reason = ?, updated_at = ? WHERE id = ?").run("failed", "missing_target_plex_user_id", nowIso(), item.id);
          continue;
        }

        const result = await this.sync.markWatchedIfNeeded(target.plex_user_id, item.rating_key);
        if (result.ok) {
          const status = result.status === "already_watched" ? "skipped" : "copied";
          copied += status === "copied" ? 1 : 0;
          skipped += status === "skipped" ? 1 : 0;
          this.db.prepare("UPDATE copy_job_items SET status = ?, reason = ?, updated_at = ? WHERE id = ?").run(status, result.status, nowIso(), item.id);
        } else {
          failed += 1;
          this.db.prepare("UPDATE copy_job_items SET status = ?, reason = ?, updated_at = ? WHERE id = ?").run("failed", result.error ?? "plex_sync_failed", nowIso(), item.id);
          this.db.prepare("INSERT INTO sync_failures (action, copy_job_item_id, target_user_id, rating_key, error, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("apply_history_copy", item.id, item.target_user_id, item.rating_key, result.error ?? "plex_sync_failed", nowIso());
        }
      }

      this.db
        .prepare("UPDATE copy_jobs SET status = ?, copied_count = ?, skipped_count = ?, failed_count = ?, completed_at = ? WHERE id = ?")
        .run("applied", copied, skipped, failed, nowIso(), jobId);
      const response = { jobId, copied, skipped, failed };
      this.audit.record("apply_history_copy", actor, "ok", response);
      return { ok: true, data: response };
    } catch (error) {
      this.audit.record("apply_history_copy", actor, "error", { jobId, confirm }, error instanceof Error ? error.message : String(error));
      return errorResult(error);
    }
  }
}
