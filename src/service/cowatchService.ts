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
  resolution?: "selected" | "everyone" | "none" | "dismiss";
}

export interface PromptCandidate {
  watchEventId: number;
  sourceUser: string;
  title: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  watchedAt: string;
}

export interface TypicalCowatcher {
  id: number;
  display_name: string;
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

  listPendingPromptCandidates(limit = 10): PromptCandidate[] {
    return this.db
      .prepare(
        `SELECT
          watch_events.id AS watchEventId,
          users.display_name AS sourceUser,
          watch_events.title,
          watch_events.show_title AS showTitle,
          watch_events.season_number AS seasonNumber,
          watch_events.episode_number AS episodeNumber,
          watch_events.watched_at AS watchedAt
        FROM watch_events
        JOIN users ON users.id = watch_events.source_user_id
        WHERE watch_events.prompt_status = 'pending'
          AND watch_events.discord_prompt_message_id IS NULL
        ORDER BY watch_events.watched_at ASC
        LIMIT ?`
      )
      .all(limit) as unknown as PromptCandidate[];
  }

  listTypicalCowatchers(): TypicalCowatcher[] {
    return this.users.listTypicalCowatchers() as TypicalCowatcher[];
  }

  getTypicalCowatcherIds(): number[] {
    return this.listTypicalCowatchers().map((user) => user.id);
  }

  recordPromptSent(watchEventId: number, channelId: string, messageId: string, actor = "discord_bot") {
    const now = nowIso();
    const result = this.db
      .prepare(
        `UPDATE watch_events
        SET prompt_status = 'prompted',
          discord_prompt_channel_id = ?,
          discord_prompt_message_id = ?,
          discord_prompt_sent_at = ?,
          updated_at = ?
        WHERE id = ? AND discord_prompt_message_id IS NULL`
      )
      .run(channelId, messageId, now, now, watchEventId);

    if (result.changes === 0) {
      this.audit.record("create_cowatch_prompt", actor, "skipped", { watchEventId, reason: "Prompt already sent or missing" });
      return { ok: true, sent: false };
    }

    this.audit.record("create_cowatch_prompt", actor, "ok", { watchEventId, channelId, messageId });
    return { ok: true, sent: true };
  }

  recordPromptFailure(watchEventId: number, error: string, actor = "discord_bot"): void {
    this.audit.record("create_cowatch_prompt", actor, "error", { watchEventId }, error);
  }

  dismissPrompt(watchEventId: number, confirm: boolean, actor = "web") {
    try {
      if (!confirm) throw new AppError("CONFIRMATION_REQUIRED", "Confirmation required", { watchEventId }, false, 400);
      const event = this.db.prepare("SELECT id, prompt_status FROM watch_events WHERE id = ?").get(watchEventId) as { id: number; prompt_status: string } | undefined;
      if (!event) throw new AppError("WATCH_EVENT_NOT_FOUND", "Watch event not found", { watchEventId }, false, 404);
      if (event.prompt_status === "dismissed") {
        this.audit.record("dashboard_prompt_dismissed", actor, "skipped", { watchEventId, reason: "already_dismissed" });
        return { ok: true, data: { watchEventId, status: "dismissed", changed: false } };
      }
      if (!["pending", "prompted", "failed"].includes(event.prompt_status)) {
        throw new AppError("PROMPT_NOT_DISMISSIBLE", "Prompt is not eligible for dismissal", { watchEventId, status: event.prompt_status }, false, 409);
      }
      const now = nowIso();
      this.db.prepare("UPDATE watch_events SET prompt_status='dismissed', updated_at=? WHERE id=?").run(now, watchEventId);
      this.audit.record("dashboard_prompt_dismissed", actor, "ok", { watchEventId, previousStatus: event.prompt_status });
      return { ok: true, data: { watchEventId, status: "dismissed", changed: true } };
    } catch (error) {
      this.audit.record("dashboard_prompt_dismissed", actor, "error", { watchEventId }, error instanceof Error ? error.message : String(error));
      return errorResult(error);
    }
  }

  reprompt(watchEventId: number, confirm: boolean, actor = "web") {
    try {
      if (!confirm) throw new AppError("CONFIRMATION_REQUIRED", "Confirmation required", { watchEventId }, false, 400);
      const event = this.db.prepare("SELECT id, prompt_status, discord_prompt_message_id FROM watch_events WHERE id = ?").get(watchEventId) as
        | { id: number; prompt_status: string; discord_prompt_message_id: string | null }
        | undefined;
      if (!event) throw new AppError("WATCH_EVENT_NOT_FOUND", "Watch event not found", { watchEventId }, false, 404);
      if (event.prompt_status === "pending" && !event.discord_prompt_message_id) {
        this.audit.record("dashboard_prompt_reprompted", actor, "skipped", { watchEventId, reason: "already_pending" });
        return { ok: true, data: { watchEventId, status: "pending", changed: false } };
      }
      if (!["prompted", "failed", "dismissed"].includes(event.prompt_status)) {
        throw new AppError("PROMPT_NOT_REPROMPTABLE", "Prompt is not eligible to be sent again", { watchEventId, status: event.prompt_status }, false, 409);
      }
      const now = nowIso();
      this.db.prepare(`UPDATE watch_events
        SET prompt_status='pending', discord_prompt_channel_id=NULL, discord_prompt_message_id=NULL,
          discord_prompt_sent_at=NULL, updated_at=?
        WHERE id=?`).run(now, watchEventId);
      this.audit.record("dashboard_prompt_reprompted", actor, "ok", { watchEventId, previousStatus: event.prompt_status });
      return { ok: true, data: { watchEventId, status: "pending", changed: true } };
    } catch (error) {
      this.audit.record("dashboard_prompt_reprompted", actor, "error", { watchEventId }, error instanceof Error ? error.message : String(error));
      return errorResult(error);
    }
  }

  async resolvePrompt(input: ResolvePromptInput) {
    try {
      const event = this.db.prepare("SELECT * FROM watch_events WHERE id = ?").get(input.watchEventId) as
        | { id: number; rating_key: string; plex_guid?: string }
        | undefined;
      if (!event) throw new AppError("WATCH_EVENT_NOT_FOUND", "Watch event not found", { watchEventId: input.watchEventId }, false, 404);
      const resolution = input.resolution ?? (input.selectedTargetUserIds.length === 0 ? "none" : "selected");
      if (input.selectedTargetUserIds.length === 0) {
        const status = resolution === "dismiss" ? "dismissed" : "none";
        this.db.prepare("UPDATE watch_events SET prompt_status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), input.watchEventId);
        this.audit.record("resolve_cowatch_prompt", input.actor, status, input);
        return { ok: true, data: { status, results: [] } };
      }

      const results = [];
      for (const targetUserId of [...new Set(input.selectedTargetUserIds)]) {
        const user = this.users.findById(targetUserId);
        if (!user?.plex_user_id) {
          results.push({
            targetUserId,
            status: "failed",
            plexSyncStatus: "target_unavailable",
            errorCode: "PLEX_TARGET_UNAVAILABLE",
            error: "Target user missing Plex user id"
          });
          continue;
        }

        const syncResult = await this.sync.markWatchedIfNeeded(user.plex_user_id, event.rating_key, event.plex_guid);
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
        results.push({ targetUserId, status, plexSyncStatus: syncResult.status, errorCode: syncResult.errorCode, error: syncResult.error });
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
