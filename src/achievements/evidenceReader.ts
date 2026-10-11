/**
 * Achievements Evidence Reader.
 *
 * Reads canonical evidence from SQLite using existing domain semantics:
 * - Direct playback observations merged with unlinked archive watch events
 * - Replay semantics via evaluateReplaySemantics
 * - People co-watch attribution reconciling Discord confirmations with latest browser adjudications
 * - Watermark computation over highest evidence IDs
 */

import type { Db } from '../db/database.js';
import { evaluateReplaySemantics, type ReplayObservation } from '../service/replaySemantics.js';
import type {
  SubjectEvidence,
  CanonicalPlay,
  ConfirmedCoWatch,
  EvidenceWatermark,
  SupportingEvidenceRef
} from './types.js';

export interface ReadEvidenceOptions {
  nowIso?: string;
}

export class AchievementEvidenceReader {
  constructor(private readonly db: Db) {}

  /**
   * Computes the evidence watermark over all underlying evidence tables.
   */
  public getWatermark(): EvidenceWatermark {
    const row = this.db.prepare(`
      SELECT
        (SELECT COALESCE(MAX(id), 0) FROM playback_observations) as max_obs_id,
        (SELECT COALESCE(MAX(id), 0) FROM archive_watch_events) as max_arch_id,
        (SELECT COALESCE(MAX(id), 0) FROM cowatch_confirmations) as max_conf_id,
        (SELECT COALESCE(MAX(id), 0) FROM cowatch_adjudications) as max_adj_id
    `).get() as {
      max_obs_id: number;
      max_arch_id: number;
      max_conf_id: number;
      max_adj_id: number;
    } | undefined;

    return {
      maxObservationId: Number(row?.max_obs_id ?? 0),
      maxArchiveEventId: Number(row?.max_arch_id ?? 0),
      maxConfirmationId: Number(row?.max_conf_id ?? 0),
      maxAdjudicationId: Number(row?.max_adj_id ?? 0)
    };
  }

  /**
   * Reads canonical evidence for all visible subjects.
   */
  public readAllSubjects(_options: ReadEvidenceOptions = {}): SubjectEvidence[] {
    const visibleUsers = this.db.prepare(`
      SELECT id, plex_username, display_name
      FROM users
      WHERE COALESCE(dashboard_shown, enabled) = 1
      ORDER BY id ASC
    `).all() as Array<{ id: number; plex_username: string; display_name: string }>;

    if (visibleUsers.length === 0) {
      return [];
    }

    const visibleUserIds = new Set(visibleUsers.map((u) => u.id));
    const playsByUser = this.readCanonicalPlays(visibleUserIds);
    const coWatchesByUser = this.readConfirmedCoWatches(visibleUserIds);
    const inferredOnlyByUser = this.checkInferredCoWatchOnly(visibleUserIds, coWatchesByUser);
    const audiobookCountsByUser = this.readCompletedAudiobookCounts(visibleUserIds);

    const subjects: SubjectEvidence[] = [];

    for (const user of visibleUsers) {
      const plays = playsByUser.get(user.id) ?? [];
      const confirmedCoWatches = coWatchesByUser.get(user.id) ?? [];
      const { replaysByRatingKey, replayEvidenceByRatingKey } = this.calculateReplays(plays);
      const completedAudiobookCount = audiobookCountsByUser.get(user.id) ?? 0;
      const hasInferredCoWatchOnly = inferredOnlyByUser.has(user.id);

      subjects.push({
        userId: user.id,
        username: user.plex_username,
        displayName: user.display_name || user.plex_username,
        plays,
        replaysByRatingKey,
        replayEvidenceByRatingKey,
        confirmedCoWatches,
        completedAudiobookCount,
        hasInferredCoWatchOnly
      });
    }

    return subjects;
  }

  private readCanonicalPlays(visibleUserIds: Set<number>): Map<number, CanonicalPlay[]> {
    const playsByUser = new Map<number, CanonicalPlay[]>();

    // 1. Direct playback observations
    const obsRows = this.db.prepare(`
      SELECT
        po.id,
        po.user_id,
        po.rating_key,
        po.grandparent_rating_key,
        po.media_type,
        po.library_name,
        po.title,
        po.show_title,
        po.watched_at,
        po.completed,
        po.duration,
        po.view_offset,
        po.percent_complete,
        COALESCE(cat.genres_json, gp_cat.genres_json) as genres_json
      FROM playback_observations po
      LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key
      LEFT JOIN content_catalog gp_cat ON gp_cat.rating_key = po.grandparent_rating_key
      ORDER BY po.watched_at ASC, po.id ASC
    `).all() as any[];

    for (const row of obsRows) {
      const userId = Number(row.user_id);
      if (!visibleUserIds.has(userId)) continue;

      let genres: string[] | undefined;
      if (row.genres_json) {
        try {
          const parsed = JSON.parse(row.genres_json);
          if (Array.isArray(parsed)) {
            genres = parsed.map(String);
          }
        } catch {
          genres = undefined;
        }
      }

      const category = this.normalizeCategory(row.media_type, row.library_name);
      const play: CanonicalPlay = {
        id: Number(row.id),
        sourceKind: 'playback_observation',
        userId,
        ratingKey: String(row.rating_key),
        mediaType: String(row.media_type ?? 'movie'),
        category,
        title: String(row.title ?? ''),
        showTitle: row.show_title ? String(row.show_title) : null,
        genres,
        watchedAt: row.watched_at ?? null,
        completed: Boolean(row.completed),
        durationSeconds: row.duration != null ? normalizeDurationSeconds(row.duration) : null,
        viewOffsetSeconds: row.view_offset != null ? Number(row.view_offset) : null,
        percentComplete: row.percent_complete != null ? Number(row.percent_complete) : null
      };

      const list = playsByUser.get(userId) ?? [];
      list.push(play);
      playsByUser.set(userId, list);
    }

    // 2. Unlinked archive watch events (deduplicated against playback_observations)
    const archiveRows = this.db.prepare(`
      SELECT
        awe.id,
        awe.user_id,
        awe.source_rating_key,
        awe.title_snapshot,
        awe.event_time,
        awe.completed
      FROM archive_watch_events awe
      WHERE awe.user_id IS NOT NULL
        AND awe.completed = 1
        AND NOT EXISTS (
          SELECT 1 FROM archive_observation_links aol
          WHERE aol.archive_event_id = awe.id
            AND aol.relation IN ('same_event', 'duplicate')
        )
      ORDER BY awe.event_time ASC, awe.id ASC
    `).all() as any[];

    for (const row of archiveRows) {
      const userId = Number(row.user_id);
      if (!visibleUserIds.has(userId)) continue;

      const play: CanonicalPlay = {
        id: Number(row.id),
        sourceKind: 'archive_watch_event',
        userId,
        ratingKey: String(row.source_rating_key || `archive-${row.id}`),
        mediaType: 'movie',
        category: 'movie',
        title: String(row.title_snapshot ?? ''),
        watchedAt: row.event_time ?? null,
        completed: Boolean(row.completed)
      };

      const list = playsByUser.get(userId) ?? [];
      list.push(play);
      playsByUser.set(userId, list);
    }

    return playsByUser;
  }

  private calculateReplays(plays: CanonicalPlay[]): {
    replaysByRatingKey: Map<string, number>;
    replayEvidenceByRatingKey: Map<string, SupportingEvidenceRef[]>;
  } {
    const replaysByRatingKey = new Map<string, number>();
    const replayEvidenceByRatingKey = new Map<string, SupportingEvidenceRef[]>();

    const playsByRatingKey = new Map<string, CanonicalPlay[]>();
    for (const play of plays) {
      const list = playsByRatingKey.get(play.ratingKey) ?? [];
      list.push(play);
      playsByRatingKey.set(play.ratingKey, list);
    }

    for (const [ratingKey, keyPlays] of playsByRatingKey.entries()) {
      if (keyPlays.length <= 1) continue;

      const replayObservations: ReplayObservation[] = keyPlays.map((p) => {
        const observedAt = p.watchedAt ?? new Date(0).toISOString();
        return {
          observedAt,
          localDate: observedAt.slice(0, 10),
          completed: p.completed,
          progressPercent: p.percentComplete != null ? p.percentComplete : null,
          source: p.sourceKind === 'playback_observation' ? 'detailed_playback' : 'point_completed_play'
        };
      });

      const semantics = evaluateReplaySemantics(replayObservations);
      if (semantics.replayCount > 0) {
        replaysByRatingKey.set(ratingKey, semantics.replayCount);

        const refs: SupportingEvidenceRef[] = keyPlays
          .filter((p) => p.completed)
          .slice(1) // Qualifying replays after first completed play
          .map((p) => ({
            kind: p.sourceKind,
            id: p.id,
            eventTime: p.watchedAt,
            title: p.title
          }));
        replayEvidenceByRatingKey.set(ratingKey, refs);
      }
    }

    return { replaysByRatingKey, replayEvidenceByRatingKey };
  }

  private readConfirmedCoWatches(visibleUserIds: Set<number>): Map<number, ConfirmedCoWatch[]> {
    const coWatchesByUser = new Map<number, ConfirmedCoWatch[]>();

    const addCoWatch = (userId: number, cowatch: ConfirmedCoWatch) => {
      if (!visibleUserIds.has(userId)) return;
      const list = coWatchesByUser.get(userId) ?? [];
      list.push(cowatch);
      coWatchesByUser.set(userId, list);
    };

    // Track confirmed session keys to avoid duplicate confirmation counting
    const seenSessions = new Set<string>();

    // 1. Discord confirmations (status='confirmed')
    const discordRows = this.db.prepare(`
      SELECT
        cc.id,
        we.source_user_id,
        cc.target_user_id,
        we.rating_key,
        we.watched_at,
        we.title
      FROM cowatch_confirmations cc
      JOIN watch_events we ON we.id = cc.watch_event_id
      WHERE cc.status = 'confirmed'
      ORDER BY we.watched_at ASC, cc.id ASC
    `).all() as any[];

    for (const row of discordRows) {
      const sourceId = Number(row.source_user_id);
      const targetId = Number(row.target_user_id);
      const pair = [sourceId, targetId].sort((a, b) => a - b).join(':');
      const sessionKey = `${pair}:${row.rating_key}:${row.watched_at}`;
      if (seenSessions.has(sessionKey)) continue;
      seenSessions.add(sessionKey);

      addCoWatch(sourceId, {
        sourceKind: 'cowatch_confirmation',
        id: Number(row.id),
        userId: sourceId,
        cowatcherUserId: targetId,
        ratingKey: String(row.rating_key),
        watchedAt: row.watched_at ?? null,
        title: row.title ?? undefined
      });

      addCoWatch(targetId, {
        sourceKind: 'cowatch_confirmation',
        id: Number(row.id),
        userId: targetId,
        cowatcherUserId: sourceId,
        ratingKey: String(row.rating_key),
        watchedAt: row.watched_at ?? null,
        title: row.title ?? undefined
      });
    }

    // 2. Latest browser adjudications (decision='yes')
    const adjudicationRows = this.db.prepare(`
      SELECT
        ca.id,
        ca.candidate_id,
        ca.source_user_id,
        ca.target_user_id,
        ca.rating_key,
        ca.decision,
        ca.created_at
      FROM cowatch_adjudications ca
      WHERE ca.id = (
        SELECT MAX(latest.id)
        FROM cowatch_adjudications latest
        WHERE latest.candidate_id = ca.candidate_id
      )
      ORDER BY ca.id ASC
    `).all() as any[];

    for (const row of adjudicationRows) {
      if (row.decision !== 'yes') continue; // 'clear', 'no', 'not_sure' do not confirm!

      const sourceId = Number(row.source_user_id);
      const targetId = Number(row.target_user_id);
      const pair = [sourceId, targetId].sort((a, b) => a - b).join(':');
      const sessionKey = `${pair}:${row.rating_key}:adj-${row.id}`;
      if (seenSessions.has(sessionKey)) continue;
      seenSessions.add(sessionKey);

      addCoWatch(sourceId, {
        sourceKind: 'cowatch_adjudication',
        id: Number(row.id),
        userId: sourceId,
        cowatcherUserId: targetId,
        ratingKey: String(row.rating_key),
        watchedAt: row.created_at ?? null
      });

      addCoWatch(targetId, {
        sourceKind: 'cowatch_adjudication',
        id: Number(row.id),
        userId: targetId,
        cowatcherUserId: sourceId,
        ratingKey: String(row.rating_key),
        watchedAt: row.created_at ?? null
      });
    }

    return coWatchesByUser;
  }

  private checkInferredCoWatchOnly(
    visibleUserIds: Set<number>,
    coWatchesByUser: Map<number, ConfirmedCoWatch[]>
  ): Set<number> {
    const inferredOnly = new Set<number>();

    // Check if there are unconfirmed candidates or review prompts
    const candidateRows = this.db.prepare(`
      SELECT DISTINCT source_user_id, target_user_id
      FROM cowatch_adjudications
    `).all() as Array<{ source_user_id: number; target_user_id: number }>;

    for (const row of candidateRows) {
      for (const uid of [Number(row.source_user_id), Number(row.target_user_id)]) {
        if (!visibleUserIds.has(uid)) continue;
        const confirmed = coWatchesByUser.get(uid) ?? [];
        if (confirmed.length === 0) {
          inferredOnly.add(uid);
        }
      }
    }

    return inferredOnly;
  }

  private readCompletedAudiobookCounts(visibleUserIds: Set<number>): Map<number, number> {
    const countsByUser = new Map<number, number>();

    // Audiobook books milestone: NEVER count individual track observations as books.
    // Query audiobook_position_evidence for completed books (view_offset_ms >= duration_ms).
    const tableExists = this.db.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_position_evidence'
    `).get();
    if (!tableExists) {
      return countsByUser;
    }

    const rows = this.db.prepare(`
      SELECT user_id, COUNT(DISTINCT audiobook_id) as count
      FROM audiobook_position_evidence
      WHERE duration_ms > 0 AND view_offset_ms >= duration_ms
      GROUP BY user_id
    `).all() as Array<{ user_id: number; count: number }>;

    for (const row of rows) {
      const uid = Number(row.user_id);
      if (visibleUserIds.has(uid)) {
        countsByUser.set(uid, Number(row.count));
      }
    }

    return countsByUser;
  }

  private normalizeCategory(
    mediaType?: string | null,
    libraryName?: string | null
  ): 'movie' | 'tv' | 'anime' | 'classic_tv' | 'audiobook' {
    const m = (mediaType ?? '').toLowerCase();
    const lib = (libraryName ?? '').toLowerCase();

    if (m === 'track' || m === 'audiobook' || lib.includes('audiobook')) {
      return 'audiobook';
    }
    if (lib.includes('anime')) {
      return 'anime';
    }
    if (lib.includes('classic')) {
      return 'classic_tv';
    }
    if (m === 'episode' || lib.includes('tv') || lib.includes('show')) {
      return 'tv';
    }
    return 'movie';
  }
}

function normalizeDurationSeconds(duration?: number | null): number {
  const val = Number(duration ?? 0);
  if (!Number.isFinite(val) || val <= 0) return 0;
  return val > 100000 ? Math.round(val / 1000) : Math.round(val);
}

