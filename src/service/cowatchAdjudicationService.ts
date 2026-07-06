import { createHash } from "node:crypto";
import type { Db } from "../db/database.js";
import { AppError, errorResult } from "../utils/errors.js";
import { nowIso } from "../utils/time.js";
import { AuditService } from "./auditService.js";
import { CowatchingIntelligenceService, type CowatchingEvent, type CowatchingParticipant } from "./cowatchingIntelligenceService.js";

export type CowatchDecision = "yes" | "no" | "not_sure" | "clear";

export interface CowatchReviewCandidate {
  candidateId: string;
  ratingKey: string;
  title: string;
  showTitle: string | null;
  mediaType: string;
  watchedAt: string;
  ruleVersion: string;
  source: CowatchingParticipant;
  target: CowatchingParticipant;
  supportingObservationIds: number[];
  decision: CowatchDecision | null;
  latestAdjudicationId: number | null;
  effectiveRelationship: "together" | "likely_together" | "suppressed";
}

export interface ApplyCowatchDecisionInput {
  candidateId: string;
  decision: CowatchDecision;
  actorKind: "web" | "discord" | "cli";
  method: "browser" | "discord_review" | "cli";
  requestId: string;
  apply?: boolean;
  confirm?: boolean;
}

export interface CowatchReviewPromptCandidate {
  reviewPromptId: number;
  candidateId: string;
  sourceName: string;
  targetName: string;
  title: string;
  watchedAt: string;
}

type AdjudicationRow = {
  id: number;
  candidate_id: string;
  decision: CowatchDecision;
  request_id: string;
  created_at: string;
};

export class CowatchAdjudicationService {
  private readonly intelligence: CowatchingIntelligenceService;
  private readonly audit: AuditService;

  constructor(private readonly db: Db) {
    this.intelligence = new CowatchingIntelligenceService(db);
    this.audit = new AuditService(db);
  }

  listCandidates(params: unknown): CowatchReviewCandidate[] {
    const events = this.intelligence.getCowatchingEvents(params);
    const rawCandidates: Array<Omit<CowatchReviewCandidate, "decision" | "latestAdjudicationId" | "effectiveRelationship">> = [];
    for (const event of events) {
      const source = event.participants.find((participant) => participant.role === "source");
      if (!source) continue;
      for (const target of event.participants) {
        if (target.userId === source.userId || target.evidenceState !== "inferred") continue;
        rawCandidates.push(this.buildCandidate(event, source, target));
      }
    }
    if (!rawCandidates.length) return [];
    const rows = this.db.prepare(`SELECT id, candidate_id, decision, request_id, created_at
      FROM cowatch_adjudications ORDER BY id DESC`).all() as AdjudicationRow[];
    const latestByCandidate = new Map<string, AdjudicationRow>();
    for (const row of rows) if (!latestByCandidate.has(row.candidate_id)) latestByCandidate.set(row.candidate_id, row);
    return rawCandidates.map((candidate) => {
      const latest = latestByCandidate.get(candidate.candidateId);
      const decision = latest?.decision === "clear" ? null : latest?.decision ?? null;
      return {
        ...candidate,
        decision,
        latestAdjudicationId: latest?.id ?? null,
        effectiveRelationship: decision === "yes" ? "together" : decision === "no" ? "suppressed" : "likely_together"
      };
    });
  }

  getDecision(candidateId: string): CowatchDecision | null {
    const row = this.db.prepare(`SELECT decision FROM cowatch_adjudications
      WHERE candidate_id=? ORDER BY id DESC LIMIT 1`).get(candidateId) as { decision: CowatchDecision } | undefined;
    return row?.decision ?? null;
  }

  getPromptStatuses(candidateIds: string[]): Map<string, string> {
    if (!candidateIds.length) return new Map();
    const placeholders = candidateIds.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT candidate_id,status FROM cowatch_review_prompts
      WHERE candidate_id IN (${placeholders}) ORDER BY id DESC`).all(...candidateIds) as Array<{ candidate_id: string; status: string }>;
    const statuses = new Map<string, string>();
    for (const row of rows) if (!statuses.has(row.candidate_id)) statuses.set(row.candidate_id, row.status);
    return statuses;
  }

  requestDiscordReview(input: { candidateId: string; actorKind: "web" | "cli"; requestId: string; apply?: boolean; confirm?: boolean }) {
    try {
      if (!/^[a-f0-9]{32}$/.test(input.candidateId)) throw new AppError("COWATCH_CANDIDATE_INVALID", "Review candidate is invalid", {}, false, 400);
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.requestId)) throw new AppError("REQUEST_ID_INVALID", "A stable request ID is required", {}, false, 400);
      const candidate = this.listCandidates({ days: 3650 }).find((item) => item.candidateId === input.candidateId);
      if (!candidate) throw new AppError("COWATCH_CANDIDATE_NOT_FOUND", "Review candidate is no longer available", { candidateId: input.candidateId }, false, 404);
      if (!this.candidateIsVisible(candidate)) throw new AppError("COWATCH_CANDIDATE_HIDDEN", "Review candidate is not included in the household dashboard", {}, false, 409);
      if (candidate.decision === "yes" || candidate.decision === "no") throw new AppError("COWATCH_CANDIDATE_RESOLVED", "Review candidate already has a definitive decision", {}, false, 409);
      const existing = this.db.prepare(`SELECT id,status,request_id FROM cowatch_review_prompts
        WHERE candidate_id=? AND status IN ('pending','sent') ORDER BY id DESC LIMIT 1`).get(input.candidateId) as { id: number; status: string; request_id: string } | undefined;
      const preview = { candidateId: input.candidateId, status: existing?.status ?? "pending", reviewPromptId: existing?.id ?? null };
      if (input.apply !== true) return { ok: true, data: { ...preview, dryRun: true, changed: !existing } };
      if (input.confirm !== true) throw new AppError("CONFIRMATION_REQUIRED", "Confirmation required", { candidateId: input.candidateId }, false, 400);
      if (existing) {
        this.audit.record("cowatch_review_prompt_requested", input.actorKind, "skipped", { candidateId: input.candidateId, reason: "already_open" });
        return { ok: true, data: { ...preview, dryRun: false, changed: false } };
      }
      const repeated = this.db.prepare("SELECT id,status FROM cowatch_review_prompts WHERE request_id=?").get(input.requestId) as { id: number; status: string } | undefined;
      if (repeated) return { ok: true, data: { candidateId: input.candidateId, reviewPromptId: repeated.id, status: repeated.status, dryRun: false, changed: false, repeated: true } };
      const now = nowIso();
      const result = this.db.prepare(`INSERT INTO cowatch_review_prompts
        (candidate_id,status,requested_by,request_id,created_at,updated_at)
        VALUES (?,'pending',?,?,?,?)`).run(input.candidateId, input.actorKind, input.requestId, now, now);
      const reviewPromptId = Number(result.lastInsertRowid);
      this.audit.record("cowatch_review_prompt_requested", input.actorKind, "ok", { candidateId: input.candidateId, reviewPromptId });
      return { ok: true, data: { candidateId: input.candidateId, reviewPromptId, status: "pending", dryRun: false, changed: true } };
    } catch (error) {
      this.audit.record("cowatch_review_prompt_requested", input.actorKind, "error", { candidateId: input.candidateId }, error instanceof Error ? error.message : String(error));
      return errorResult(error);
    }
  }

  listPendingReviewPrompts(limit = 10): CowatchReviewPromptCandidate[] {
    const candidates = this.listCandidates({ days: 3650 });
    const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
    const rows = this.db.prepare(`SELECT id,candidate_id FROM cowatch_review_prompts
      WHERE status='pending' ORDER BY created_at ASC LIMIT ?`).all(limit) as Array<{ id: number; candidate_id: string }>;
    const result: CowatchReviewPromptCandidate[] = [];
    for (const row of rows) {
      const candidate = candidateById.get(row.candidate_id);
      if (!candidate || !this.candidateIsVisible(candidate) || candidate.decision === "yes" || candidate.decision === "no") {
        this.cancelReviewPrompt(row.id, "candidate_ineligible");
        continue;
      }
      result.push({
        reviewPromptId: row.id,
        candidateId: candidate.candidateId,
        sourceName: candidate.source.displayName,
        targetName: candidate.target.displayName,
        title: candidate.showTitle || candidate.title,
        watchedAt: candidate.watchedAt
      });
    }
    return result;
  }

  recordReviewPromptSent(reviewPromptId: number, channelId: string, messageId: string) {
    const now = nowIso();
    const result = this.db.prepare(`UPDATE cowatch_review_prompts SET status='sent',discord_channel_id=?,discord_message_id=?,updated_at=?
      WHERE id=? AND status='pending'`).run(channelId, messageId, now, reviewPromptId);
    this.audit.record("cowatch_review_prompt_delivery", "discord_bot", result.changes ? "ok" : "skipped", { reviewPromptId });
    return { ok: true, sent: result.changes > 0 };
  }

  recordReviewPromptFailure(reviewPromptId: number, error: string) {
    const now = nowIso();
    const result = this.db.prepare(`UPDATE cowatch_review_prompts SET status='failed',error=?,updated_at=?
      WHERE id=? AND status='pending'`).run(error, now, reviewPromptId);
    this.audit.record("cowatch_review_prompt_delivery", "discord_bot", "error", { reviewPromptId }, error);
    return { ok: true, failed: result.changes > 0 };
  }

  async resolveReviewPrompt(reviewPromptId: number, decision: Exclude<CowatchDecision, "clear">, interactionId: string) {
    const row = this.db.prepare("SELECT id,candidate_id,status FROM cowatch_review_prompts WHERE id=?").get(reviewPromptId) as { id: number; candidate_id: string; status: string } | undefined;
    if (!row) return errorResult(new AppError("REVIEW_PROMPT_NOT_FOUND", "Review prompt not found", { reviewPromptId }, false, 404));
    if (["resolved", "cancelled"].includes(row.status)) return { ok: true, data: { reviewPromptId, status: row.status, changed: false } };
    if (row.status !== "sent") return errorResult(new AppError("REVIEW_PROMPT_NOT_SENT", "Review prompt is not awaiting an answer", { reviewPromptId, status: row.status }, false, 409));
    const candidate = this.listCandidates({ days: 3650 }).find((item) => item.candidateId === row.candidate_id);
    if (!candidate || !this.candidateIsVisible(candidate)) {
      this.cancelReviewPrompt(reviewPromptId, "candidate_ineligible");
      return { ok: true, data: { reviewPromptId, status: "cancelled", changed: true } };
    }
    const decided = await this.decide({
      candidateId: row.candidate_id,
      decision,
      actorKind: "discord",
      method: "discord_review",
      requestId: `discord-${interactionId}`.slice(0, 128),
      apply: true,
      confirm: true
    });
    if (!decided.ok) return decided;
    const now = nowIso();
    this.db.prepare("UPDATE cowatch_review_prompts SET status='resolved',resolved_at=?,updated_at=? WHERE id=?").run(now, now, reviewPromptId);
    this.audit.record("cowatch_review_prompt_resolved", "discord", "ok", { reviewPromptId, candidateId: row.candidate_id, decision });
    return { ok: true, data: { reviewPromptId, status: "resolved", decision, changed: true } };
  }

  async decide(input: ApplyCowatchDecisionInput) {
    try {
      if (!/^[a-f0-9]{32}$/.test(input.candidateId)) {
        throw new AppError("COWATCH_CANDIDATE_INVALID", "Review candidate is invalid", {}, false, 400);
      }
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.requestId)) {
        throw new AppError("REQUEST_ID_INVALID", "A stable request ID is required", {}, false, 400);
      }
      const candidate = this.listCandidates({ days: 3650 }).find((item) => item.candidateId === input.candidateId);
      if (!candidate) throw new AppError("COWATCH_CANDIDATE_NOT_FOUND", "Review candidate is no longer available", { candidateId: input.candidateId }, false, 404);
      const preview = {
        candidateId: candidate.candidateId,
        previousDecision: candidate.decision,
        decision: input.decision,
        effectiveRelationship: input.decision === "yes" ? "together" : input.decision === "no" ? "suppressed" : "likely_together"
      };
      if (input.apply !== true) return { ok: true, data: { ...preview, dryRun: true, changed: candidate.decision !== input.decision } };
      if (input.confirm !== true) throw new AppError("CONFIRMATION_REQUIRED", "Confirmation required", { candidateId: input.candidateId }, false, 400);

      const repeated = this.db.prepare("SELECT id, decision FROM cowatch_adjudications WHERE request_id=?").get(input.requestId) as { id: number; decision: CowatchDecision } | undefined;
      if (repeated) return { ok: true, data: { ...preview, dryRun: false, changed: false, adjudicationId: repeated.id, repeated: true } };
      if (candidate.decision === input.decision || (input.decision === "clear" && candidate.decision === null)) {
        this.audit.record("cowatch_adjudication_decided", input.actorKind, "skipped", { candidateId: input.candidateId, decision: input.decision, reason: "no_change" });
        return { ok: true, data: { ...preview, dryRun: false, changed: false } };
      }

      const now = nowIso();
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const result = this.db.prepare(`INSERT INTO cowatch_adjudications
          (candidate_id,source_user_id,target_user_id,rating_key,rule_version,supporting_observation_ids_json,decision,actor_kind,method,request_id,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
            candidate.candidateId,
            candidate.source.userId,
            candidate.target.userId,
            candidate.ratingKey,
            candidate.ruleVersion,
            JSON.stringify(candidate.supportingObservationIds),
            input.decision,
            input.actorKind,
            input.method,
            input.requestId,
            now
          );
        this.audit.record("cowatch_adjudication_decided", input.actorKind, candidate.decision ? "reversed" : "ok", {
          candidateId: candidate.candidateId,
          previousDecision: candidate.decision,
          decision: input.decision,
          method: input.method
        });
        if (input.method !== "discord_review") {
          this.db.prepare(`UPDATE cowatch_review_prompts SET status='cancelled',resolved_at=?,updated_at=?
            WHERE candidate_id=? AND status IN ('pending','sent')`).run(now, now, candidate.candidateId);
        }
        this.db.exec("COMMIT");
        return { ok: true, data: { ...preview, dryRun: false, changed: true, adjudicationId: Number(result.lastInsertRowid) } };
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      this.audit.record("cowatch_adjudication_decided", input.actorKind, "error", { candidateId: input.candidateId, decision: input.decision, method: input.method }, error instanceof Error ? error.message : String(error));
      return errorResult(error);
    }
  }

  private buildCandidate(event: CowatchingEvent, source: CowatchingParticipant, target: CowatchingParticipant) {
    const supportingObservationIds = [...new Set([
      ...(source.supportingObservationIds ?? []),
      ...(target.supportingObservationIds ?? [])
    ])].sort((a, b) => a - b);
    const identity = JSON.stringify({
      ruleVersion: event.ruleVersion,
      ratingKey: event.ratingKey,
      sourceUserId: source.userId,
      targetUserId: target.userId,
      supportingObservationIds
    });
    return {
      candidateId: createHash("sha256").update(identity).digest("hex").slice(0, 32),
      ratingKey: event.ratingKey,
      title: event.title,
      showTitle: event.showTitle,
      mediaType: event.mediaType,
      watchedAt: event.watchedAt,
      ruleVersion: event.ruleVersion,
      source,
      target,
      supportingObservationIds
    };
  }

  private candidateIsVisible(candidate: CowatchReviewCandidate): boolean {
    const rows = this.db.prepare(`SELECT id FROM users WHERE id IN (?,?) AND COALESCE(dashboard_shown,enabled)=1`).all(candidate.source.userId, candidate.target.userId);
    return rows.length === 2;
  }

  private cancelReviewPrompt(reviewPromptId: number, reason: string): void {
    const now = nowIso();
    const result = this.db.prepare(`UPDATE cowatch_review_prompts SET status='cancelled',error=?,resolved_at=?,updated_at=?
      WHERE id=? AND status IN ('pending','sent')`).run(reason, now, now, reviewPromptId);
    if (result.changes) this.audit.record("cowatch_review_prompt_cancelled", "system", "ok", { reviewPromptId, reason });
  }
}
