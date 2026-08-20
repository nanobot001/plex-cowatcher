import { createHash, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/database.js";
import type { AudiobookProgressObservation } from "./audiobookProgressEvidence.js";
import { AuditService } from "./auditService.js";

export interface AudiobookPositionCaptureConfig {
  enabled: boolean;
  secret: string;
}

export type AudiobookPositionCaptureErrorCode =
  | "AUDIOBOOK_POSITION_CAPTURE_DISABLED"
  | "AUDIOBOOK_POSITION_CAPTURE_UNCONFIGURED"
  | "AUDIOBOOK_POSITION_CAPTURE_UNAUTHORIZED"
  | "AUDIOBOOK_POSITION_EVENT_INVALID"
  | "AUDIOBOOK_POSITION_IDENTITY_MISSING"
  | "AUDIOBOOK_POSITION_LISTENER_UNKNOWN"
  | "AUDIOBOOK_POSITION_LISTENER_CONFLICT"
  | "AUDIOBOOK_POSITION_ITEM_UNKNOWN"
  | "AUDIOBOOK_POSITION_ITEM_CONFLICT"
  | "AUDIOBOOK_POSITION_REVISION_STALE"
  | "AUDIOBOOK_POSITION_UNITS_INVALID";

export type AudiobookPositionCaptureResult =
  | { ok: true; status: "accepted" | "duplicate"; outOfOrder: boolean }
  | { ok: false; status: "rejected"; errorCode: AudiobookPositionCaptureErrorCode };

type NormalizedPositionEvent = {
  sourceUserKey: string;
  sourceUsername: string;
  sourceSessionKey: string;
  ratingKey: string;
  plexGuid: string | null;
  observedAt: string;
  sessionStartedAt: string | null;
  viewOffsetMs: number;
  durationMs: number;
};

const MAX_IDENTITY_LENGTH = 512;
const POSITION_DURATION_TOLERANCE = 1.05;

export class AudiobookPositionCaptureService {
  private readonly audit: AuditService;

  constructor(private readonly db: Db, private readonly config: AudiobookPositionCaptureConfig) {
    this.audit = new AuditService(db);
  }

  readiness(): "disabled" | "unconfigured" | "healthy" {
    if (!this.config.enabled) return "disabled";
    return configuredSecret(this.config.secret) ? "healthy" : "unconfigured";
  }

  isAuthorized(providedSecret: unknown): boolean {
    if (this.readiness() !== "healthy" || typeof providedSecret !== "string") return false;
    const expected = Buffer.from(this.config.secret);
    const provided = Buffer.from(providedSecret);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  }

  capture(payload: unknown): AudiobookPositionCaptureResult {
    if (!this.config.enabled) return this.reject("AUDIOBOOK_POSITION_CAPTURE_DISABLED");
    if (!configuredSecret(this.config.secret)) return this.reject("AUDIOBOOK_POSITION_CAPTURE_UNCONFIGURED");

    const normalized = normalizePositionEvent(payload);
    if (!normalized.ok) return this.reject(normalized.errorCode);

    const listener = this.resolveListener(normalized.event.sourceUserKey, normalized.event.sourceUsername);
    if (!listener.ok) return this.reject(listener.errorCode);

    const item = this.resolveAudiobookItem(normalized.event.ratingKey, normalized.event.plexGuid);
    if (!item.ok) return this.reject(item.errorCode);

    const event = normalized.event;
    const sourceEventKey = digest([
      "tautulli_stop",
      event.sourceUserKey,
      event.sourceSessionKey,
      event.ratingKey,
      event.observedAt,
      event.viewOffsetMs,
      event.durationMs
    ]);
    const payloadDigest = digest([
      event.sourceUserKey,
      event.sourceUsername.toLowerCase(),
      event.sourceSessionKey,
      event.ratingKey,
      event.plexGuid,
      event.observedAt,
      event.sessionStartedAt,
      event.viewOffsetMs,
      event.durationMs
    ]);
    const outOfOrder = Boolean(this.db.prepare(`
      SELECT 1 FROM audiobook_position_evidence
      WHERE audiobook_id = ? AND user_id = ? AND observed_at > ?
      LIMIT 1
    `).get(item.audiobookId, listener.userId, event.observedAt));
    const createdAt = new Date().toISOString();
    const inserted = this.db.prepare(`
      INSERT OR IGNORE INTO audiobook_position_evidence (
        source_type, source_event_key, source_user_key, source_session_key,
        user_id, audiobook_id, rating_key, plex_guid, observed_at,
        session_started_at, session_stopped_at, view_offset_ms, duration_ms,
        capture_reason, media_revision, payload_digest, created_at
      ) VALUES (
        'tautulli_stop', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        'playback_stop', ?, ?, ?
      )
    `).run(
      sourceEventKey,
      event.sourceUserKey,
      event.sourceSessionKey,
      listener.userId,
      item.audiobookId,
      event.ratingKey,
      event.plexGuid ?? item.plexGuid,
      event.observedAt,
      event.sessionStartedAt,
      event.observedAt,
      event.viewOffsetMs,
      event.durationMs,
      item.mediaRevision,
      payloadDigest,
      createdAt
    );
    const status = inserted.changes === 1 ? "accepted" : "duplicate";
    this.audit.record("audiobook_position_captured", "tautulli_stop", status === "accepted" ? "ok" : "skipped", {
      sourceType: "tautulli_stop",
      captureReason: "playback_stop",
      outcome: status,
      outOfOrder,
      mediaRevisionLinked: item.mediaRevision != null
    });
    return { ok: true, status, outOfOrder };
  }

  private resolveListener(sourceUserKey: string, sourceUsername: string):
    | { ok: true; userId: number }
    | { ok: false; errorCode: "AUDIOBOOK_POSITION_LISTENER_UNKNOWN" | "AUDIOBOOK_POSITION_LISTENER_CONFLICT" } {
    const byUsername = this.db.prepare(`
      SELECT id FROM users
      WHERE enabled = 1 AND lower(plex_username) = lower(?)
    `).all(sourceUsername) as Array<{ id: number }>;
    if (byUsername.length !== 1) return { ok: false, errorCode: "AUDIOBOOK_POSITION_LISTENER_UNKNOWN" };
    const priorSourceUsers = this.db.prepare(`
      SELECT DISTINCT user_id
      FROM audiobook_position_evidence
      WHERE source_type = 'tautulli_stop' AND source_user_key = ?
    `).all(sourceUserKey) as Array<{ user_id: number }>;
    if (priorSourceUsers.some((candidate) => Number(candidate.user_id) !== byUsername[0]!.id)) {
      return { ok: false, errorCode: "AUDIOBOOK_POSITION_LISTENER_CONFLICT" };
    }
    return { ok: true, userId: byUsername[0]!.id };
  }

  private resolveAudiobookItem(ratingKey: string, plexGuid: string | null):
    | { ok: true; audiobookId: number; plexGuid: string | null; mediaRevision: string | null }
    | { ok: false; errorCode: "AUDIOBOOK_POSITION_ITEM_UNKNOWN" | "AUDIOBOOK_POSITION_ITEM_CONFLICT" | "AUDIOBOOK_POSITION_REVISION_STALE" } {
    const catalog = this.db.prepare(`
      SELECT catalog.audiobook_id, catalog.guid, book.current_media_revision
      FROM content_catalog catalog
      JOIN audiobook_books book ON book.id = catalog.audiobook_id
      WHERE catalog.rating_key = ? AND catalog.audiobook_id IS NOT NULL
      LIMIT 1
    `).get(ratingKey) as { audiobook_id: number; guid: string | null; current_media_revision: string | null } | undefined;
    if (!catalog) return { ok: false, errorCode: "AUDIOBOOK_POSITION_ITEM_UNKNOWN" };
    if (plexGuid && catalog.guid && plexGuid !== catalog.guid) {
      return { ok: false, errorCode: "AUDIOBOOK_POSITION_ITEM_CONFLICT" };
    }
    if (catalog.current_media_revision) {
      const compatible = this.db.prepare(`
        SELECT 1
        FROM audiobook_media_revisions revision
        JOIN audiobook_media_revision_items item ON item.revision_id = revision.id
        WHERE revision.audiobook_id = ? AND revision.media_revision = ?
          AND (item.rating_key = ? OR (? IS NOT NULL AND item.guid = ?))
        LIMIT 1
      `).get(
        catalog.audiobook_id,
        catalog.current_media_revision,
        ratingKey,
        plexGuid,
        plexGuid
      );
      if (!compatible) return { ok: false, errorCode: "AUDIOBOOK_POSITION_REVISION_STALE" };
    }
    return {
      ok: true,
      audiobookId: Number(catalog.audiobook_id),
      plexGuid: catalog.guid,
      mediaRevision: catalog.current_media_revision
    };
  }

  private reject(errorCode: AudiobookPositionCaptureErrorCode): AudiobookPositionCaptureResult {
    this.audit.record("audiobook_position_capture_rejected", "tautulli_stop", "rejected", { errorCode });
    return { ok: false, status: "rejected", errorCode };
  }
}

export function getCapturedAudiobookProgressObservations(
  db: Db,
  audiobookId: number,
  userId: number,
  chapterRevision: string | null = null
): AudiobookProgressObservation[] {
  const rows = db.prepare(`
    SELECT id, user_id, rating_key, plex_guid, observed_at, session_started_at,
           session_stopped_at, view_offset_ms, media_revision, source_event_key,
           source_session_key
    FROM audiobook_position_evidence
    WHERE audiobook_id = ? AND user_id = ?
    ORDER BY observed_at, id
  `).all(audiobookId, userId) as Array<{
    id: number;
    user_id: number;
    rating_key: string;
    plex_guid: string | null;
    observed_at: string;
    session_started_at: string | null;
    session_stopped_at: string;
    view_offset_ms: number;
    media_revision: string | null;
    source_event_key: string;
    source_session_key: string;
  }>;
  return rows.map((row) => ({
    id: -Number(row.id),
    userId: Number(row.user_id),
    ratingKey: row.rating_key,
    plexGuid: row.plex_guid,
    watchedAt: row.observed_at,
    duration: null,
    viewOffset: Number(row.view_offset_ms),
    percentComplete: null,
    completed: false,
    sessionId: row.source_session_key,
    sessionStartAt: row.session_started_at,
    sessionEndAt: row.session_stopped_at,
    mediaRevision: row.media_revision,
    chapterRevision,
    positionEvidenceKind: "tautulli_exact_stop",
    sourceEventId: row.source_event_key
  }));
}

function configuredSecret(secret: string): boolean {
  const normalized = secret.trim();
  return normalized.length >= 16 && normalized !== "replace_me";
}

function digest(values: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function boundedString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized && normalized.length <= MAX_IDENTITY_LENGTH ? normalized : null;
}

function integer(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function timestampFromUnix(value: unknown): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const milliseconds = parsed > 10_000_000_000 ? parsed : parsed * 1000;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function optionalTimestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const unix = timestampFromUnix(value);
  if (unix) return unix;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizePositionEvent(payload: unknown):
  | { ok: true; event: NormalizedPositionEvent }
  | { ok: false; errorCode: AudiobookPositionCaptureErrorCode } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, errorCode: "AUDIOBOOK_POSITION_EVENT_INVALID" };
  }
  const raw = payload as Record<string, unknown>;
  const action = boundedString(raw.event ?? raw.action)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!action || !["stop", "on_stop", "playback_stop"].includes(action)) {
    return { ok: false, errorCode: "AUDIOBOOK_POSITION_EVENT_INVALID" };
  }
  const mediaType = boundedString(raw.media_type)?.toLowerCase();
  if (mediaType !== "track" && mediaType !== "audiobook") {
    return { ok: false, errorCode: "AUDIOBOOK_POSITION_EVENT_INVALID" };
  }
  const sourceUserKey = boundedString(raw.user_id);
  const sourceUsername = boundedString(raw.username ?? raw.user);
  const sourceSessionKey = boundedString(raw.session_key ?? raw.session_id);
  const ratingKey = boundedString(raw.rating_key);
  const observedAt = timestampFromUnix(raw.observed_at_unix ?? raw.unixtime);
  if (!sourceUserKey || !sourceUsername || !sourceSessionKey || !ratingKey || !observedAt) {
    return { ok: false, errorCode: "AUDIOBOOK_POSITION_IDENTITY_MISSING" };
  }
  const viewOffsetMs = integer(raw.view_offset ?? raw.view_offset_ms);
  const durationMs = integer(raw.duration_ms);
  if (viewOffsetMs == null || durationMs == null || viewOffsetMs < 0 || durationMs <= 0 ||
      viewOffsetMs > durationMs * POSITION_DURATION_TOLERANCE) {
    return { ok: false, errorCode: "AUDIOBOOK_POSITION_UNITS_INVALID" };
  }
  return {
    ok: true,
    event: {
      sourceUserKey,
      sourceUsername,
      sourceSessionKey,
      ratingKey,
      plexGuid: boundedString(raw.guid ?? raw.plex_guid),
      observedAt,
      sessionStartedAt: optionalTimestamp(raw.started_at ?? raw.started_timestamp),
      viewOffsetMs,
      durationMs
    }
  };
}
