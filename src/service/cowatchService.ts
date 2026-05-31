import type { Db } from "../db/database.js";
import { AppError, errorResult } from "../utils/errors.js";
import { nowIso } from "../utils/time.js";
import { AuditService } from "./auditService.js";
import { SyncService } from "./syncService.js";
import { UserService } from "./userService.js";

export interface ResolvePromptInput {
  watchEventId: number;
  selectedTargetUserIds: number[];
  actor: string;
  method: "discord_prompt" | "browser" | "cli";
}

export class CowatchService {
  private readonly audit: AuditService;
  private readonly users: UserService;

  constructor(
    private readonly db: Db,
    private readonly sync: SyncService
  ) {
    this.audit = new AuditService(db);
    this.users = new UserService(db);
  }

  createPrompt(watchEventId: number, actor = "system") {
    const event = this.db.prepare("SELECT * FROM watch_events WHERE id = ?").get(watchEventId);
    if (!event) throw new AppError("WATCH_EVENT_NOT_FOUND", "Watch event not found", { watchEventId }, false, 404);
    this.audit.record("create_cowatch_prompt", actor, "ok", { watchEventId });
    return { ok: true, watchEventId };
  }

  async resolvePrompt(input: ResolvePromptInput) {
    try {
      const event = this.db.prepare("SELECT * FROM watch_events WHERE id = ?").get(input.watchEventId) as
        | { id: number; rating_key: string }
        | undefined;
      if (!event) throw new AppError("WATCH_EVENT_NOT_FOUND", "Watch event not found", { watchEventId: input.watchEventId }, false, 404);
      if (input.selectedTargetUserIds.length === 0) {
        this.db.prepare("UPDATE watch_events SET prompt_status = ?, updated_at = ? WHERE id = ?").run("dismissed", nowIso(), input.watchEventId);
        this.audit.record("resolve_cowatch_prompt", input.actor, "dismissed", input);
        return { ok: true, data: { status: "dismissed", results: [] } };
      }

      const results = [];
      for (const targetUserId of [...new Set(input.selectedTargetUserIds)]) {
        const user = this.users.findById(targetUserId);
        if (!user?.plex_user_id) {
          results.push({ targetUserId, status: "failed", error: "Target user missing Plex user id" });
          continue;
        }

        const syncResult = await this.sync.markWatchedIfNeeded(user.plex_user_id, event.rating_key);
        const status = syncResult.ok ? "confirmed" : "failed";
        const now = nowIso();
        this.db
          .prepare(
            `INSERT INTO cowatch_confirmations (
              watch_event_id, target_user_id, confirmed_by_discord_user_id, confirmation_method,
              status, plex_sync_status, plex_sync_error, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(watch_event_id, target_user_id) DO UPDATE SET
              confirmation_method = excluded.confirmation_method,
              status = excluded.status,
              plex_sync_status = excluded.plex_sync_status,
              plex_sync_error = excluded.plex_sync_error,
              updated_at = excluded.updated_at`
          )
          .run(
            input.watchEventId,
            targetUserId,
            input.method === "discord_prompt" ? input.actor : null,
            input.method,
            status,
            syncResult.status,
            syncResult.error ?? null,
            now,
            now
          );
        results.push({ targetUserId, status, plexSyncStatus: syncResult.status, error: syncResult.error });
      }

      this.db.prepare("UPDATE watch_events SET prompt_status = ?, updated_at = ? WHERE id = ?").run("resolved", nowIso(), input.watchEventId);
      this.audit.record("resolve_cowatch_prompt", input.actor, "ok", { ...input, results });
      return { ok: true, data: { status: "resolved", results } };
    } catch (error) {
      this.audit.record("resolve_cowatch_prompt", input.actor, "error", input, error instanceof Error ? error.message : String(error));
      return errorResult(error);
    }
  }
}
