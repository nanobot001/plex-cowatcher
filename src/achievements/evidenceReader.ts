/**
 * Achievements Evidence Reader.
 *
 * Reads canonical evidence from SQLite using existing domain semantics:
 * - Direct playback observations merged with unlinked archive watch events
 * - Replay semantics via evaluateReplaySemantics
 * - People co-watch attribution reconciling Discord confirmations with latest browser adjudications
 * - Watermark computation over highest evidence IDs
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/database.js';
import { evaluateReplaySemantics, type ReplayObservation } from '../service/replaySemantics.js';
import { readShowOverrides, cleanShowTitle } from '../service/tvCanonicalMetadataService.js';
import type {
  SubjectEvidence,
  CanonicalPlay,
  ConfirmedCoWatch,
  EvidenceWatermark,
  SupportingEvidenceRef,
  ShowProgressEvidence,
  EpisodeReplayDetail,
  AudiobookProgressEvidence,
  MovieCollectionEvidence,
  MovieReplayEvidence,
  MovieProgressEvidence
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
    const { progressByUser: audiobookProgressByUser, secondsByUser: audiobookSecondsByUser } = this.readAudiobookProgress(visibleUserIds, playsByUser);
    const audiobookCountsByUser = this.readCompletedAudiobookCounts(visibleUserIds, audiobookProgressByUser);
    const {
      collectionsByUser: movieCollectionsByUser,
      replaysByUser: movieReplaysByUser,
      progressByUser: movieProgressByUser
    } = this.readMovieCollectionsAndReplays(visibleUserIds, playsByUser);

    const subjects: SubjectEvidence[] = [];

    for (const user of visibleUsers) {
      const plays = playsByUser.get(user.id) ?? [];
      const confirmedCoWatches = coWatchesByUser.get(user.id) ?? [];
      const { replaysByRatingKey, replayEvidenceByRatingKey } = this.calculateReplays(plays);
      const completedAudiobookCount = audiobookCountsByUser.get(user.id) ?? 0;
      const hasInferredCoWatchOnly = inferredOnlyByUser.has(user.id);
      const showProgress = this.calculateShowProgress(plays, replaysByRatingKey);
      const audiobookProgress = audiobookProgressByUser.get(user.id);
      const totalAudiobookSeconds = audiobookSecondsByUser.get(user.id) ?? 0;
      const movieCollectionProgress = movieCollectionsByUser.get(user.id);
      const movieReplayProgress = movieReplaysByUser.get(user.id);
      const movieProgress = movieProgressByUser.get(user.id);

      subjects.push({
        userId: user.id,
        username: user.plex_username,
        displayName: user.display_name || user.plex_username,
        plays,
        replaysByRatingKey,
        replayEvidenceByRatingKey,
        confirmedCoWatches,
        completedAudiobookCount,
        showProgress,
        audiobookProgress,
        totalAudiobookSeconds,
        movieCollectionProgress,
        movieReplayProgress,
        movieProgress,
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
        po.plex_guid,
        po.media_type,
        COALESCE(NULLIF(po.library_name, ''), cat.library_title, gp_cat.library_title) as library_name,
        po.title,
        po.show_title,
        po.season_number,
        po.episode_number,
        po.watched_at,
        po.completed,
        po.duration,
        po.view_offset,
        po.percent_complete,
        po.session_start_at,
        po.session_end_at,
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

      const category = this.normalizeCategory(row.media_type, row.library_name, genres, row.title, row.plex_guid);
      if (category === 'other') continue;

      let isCompleted = Boolean(row.completed);
      let durationSec = row.duration != null ? normalizeDurationSeconds(row.duration) : null;
      let viewOffsetSec = row.view_offset != null ? Number(row.view_offset) : null;
      let percentComplete = row.percent_complete != null ? Number(row.percent_complete) : null;

      // Intelligent Movie Completion Guard:
      // If a playback observation was flagged completed (e.g. via credit skipping or Plex 90% mark),
      // but the actual wall-clock session duration is far less than the movie runtime (< 70%),
      // the user only scrubbed or played part of the film. Treat as in-progress rather than earned.
      if (category === 'movie' && isCompleted && row.session_start_at && row.session_end_at) {
        const startMs = Date.parse(row.session_start_at);
        const endMs = Date.parse(row.session_end_at);
        if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
          const sessionSec = Math.round((endMs - startMs) / 1000);
          const expectedDur = durationSec || 7200;
          if (expectedDur > 0 && sessionSec < expectedDur * 0.70) {
            isCompleted = false;
            percentComplete = Math.min(89, Math.max(2, Math.round((sessionSec / expectedDur) * 100)));
            viewOffsetSec = sessionSec;
          }
        }
      }

      const play: CanonicalPlay = {
        id: Number(row.id),
        sourceKind: 'playback_observation',
        userId,
        ratingKey: String(row.rating_key),
        grandparentRatingKey: row.grandparent_rating_key ? String(row.grandparent_rating_key) : null,
        mediaType: String(row.media_type ?? 'movie'),
        category,
        title: String(row.title ?? ''),
        showTitle: row.show_title ? String(row.show_title) : null,
        seasonNumber: row.season_number != null ? Number(row.season_number) : null,
        episodeNumber: row.episode_number != null ? Number(row.episode_number) : null,
        genres,
        watchedAt: row.watched_at ?? null,
        completed: isCompleted,
        durationSeconds: durationSec,
        viewOffsetSeconds: viewOffsetSec,
        percentComplete: percentComplete
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
        awe.completed,
        awe.metadata_json
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

      const list = playsByUser.get(userId) ?? [];

      if (row.source_rating_key) {
        const alreadyHasDirect = list.some(
          (p) =>
            p.ratingKey === String(row.source_rating_key) &&
            Math.abs(new Date(p.watchedAt ?? 0).getTime() - new Date(row.event_time ?? 0).getTime()) <= 2 * 3600 * 1000
        );
        if (alreadyHasDirect) continue;
      }

      let mediaType = 'movie';
      let showTitle: string | null = null;
      let grandparentRatingKey: string | null = null;
      let libraryName: string | null = null;
      let seasonNumber: number | null = null;
      let episodeNumber: number | null = null;
      if (row.metadata_json) {
        try {
          const meta = JSON.parse(row.metadata_json);
          if (meta.mediaType) mediaType = String(meta.mediaType);
          if (meta.showTitle || meta.grandparentTitle) showTitle = String(meta.showTitle || meta.grandparentTitle);
          if (meta.grandparentRatingKey) grandparentRatingKey = String(meta.grandparentRatingKey);
          if (meta.librarySectionTitle) libraryName = String(meta.librarySectionTitle);
          if (meta.seasonNumber != null) seasonNumber = Number(meta.seasonNumber);
          if (meta.episodeNumber != null) episodeNumber = Number(meta.episodeNumber);
        } catch {}
      }

      const category = this.normalizeCategory(mediaType, libraryName, undefined, row.title_snapshot);
      if (category === 'other') continue;
      const play: CanonicalPlay = {
        id: Number(row.id),
        sourceKind: 'archive_watch_event',
        userId,
        ratingKey: String(row.source_rating_key || `archive-${row.id}`),
        grandparentRatingKey,
        mediaType,
        category,
        title: String(row.title_snapshot ?? ''),
        showTitle,
        seasonNumber,
        episodeNumber,
        watchedAt: row.event_time ?? null,
        completed: Boolean(row.completed)
      };

      list.push(play);
      playsByUser.set(userId, list);
    }

    // 3. Confirmed co-watched plays attributed to co-watching partners
    // A) Discord confirmations (status='confirmed')
    const confirmationRows = this.db.prepare(`
      SELECT
        cc.id AS confirmation_id,
        we.id AS event_id,
        we.source_user_id,
        cc.target_user_id,
        we.rating_key,
        we.grandparent_rating_key AS we_gp_key,
        we.media_type AS we_media_type,
        COALESCE(NULLIF(po.library_name, ''), NULLIF(we.library_name, ''), cat.library_title, gp_cat.library_title) AS resolved_library_name,
        we.title AS we_title,
        we.show_title AS we_show_title,
        we.season_number AS we_season_number,
        we.episode_number AS we_episode_number,
        we.watched_at,
        po.id AS observation_id,
        po.grandparent_rating_key AS po_gp_key,
        po.media_type AS po_media_type,
        po.title AS po_title,
        po.show_title AS po_show_title,
        po.season_number AS po_season_number,
        po.episode_number AS po_episode_number,
        COALESCE(po.completed, 1) AS completed,
        po.duration,
        po.view_offset,
        po.percent_complete,
        COALESCE(cat.genres_json, gp_cat.genres_json) as genres_json
      FROM cowatch_confirmations cc
      JOIN watch_events we ON we.id = cc.watch_event_id
      LEFT JOIN playback_observations po ON po.id = (
        SELECT po2.id FROM playback_observations po2
        WHERE po2.user_id = we.source_user_id AND po2.rating_key = we.rating_key
          AND po2.watched_at >= strftime('%Y-%m-%dT%H:%M:%fZ', we.watched_at, '-1800 seconds')
          AND po2.watched_at <= strftime('%Y-%m-%dT%H:%M:%fZ', we.watched_at, '+1800 seconds')
        ORDER BY po2.watched_at DESC, po2.id DESC
        LIMIT 1
      )
      LEFT JOIN content_catalog cat ON cat.rating_key = we.rating_key
      LEFT JOIN content_catalog gp_cat ON gp_cat.rating_key = COALESCE(po.grandparent_rating_key, we.grandparent_rating_key)
      WHERE cc.status = 'confirmed'
      ORDER BY we.watched_at ASC, cc.id ASC
    `).all() as any[];

    for (const row of confirmationRows) {
      const sourceId = Number(row.source_user_id);
      const targetId = Number(row.target_user_id);

      // Attribute to target if target is visible
      if (visibleUserIds.has(targetId)) {
        const targetPlays = playsByUser.get(targetId) ?? [];
        const alreadyHasDirect = targetPlays.some(
          (p) =>
            p.ratingKey === String(row.rating_key) &&
            Math.abs(new Date(p.watchedAt ?? 0).getTime() - new Date(row.watched_at ?? 0).getTime()) <= 2 * 3600 * 1000
        );

        if (!alreadyHasDirect) {
          let genres: string[] | undefined;
          if (row.genres_json) {
            try {
              const parsed = JSON.parse(row.genres_json);
              if (Array.isArray(parsed)) genres = parsed.map(String);
            } catch {
              genres = undefined;
            }
          }

          const mediaType = String(row.po_media_type || row.we_media_type || 'movie');
          const libraryName = row.resolved_library_name || row.po_library_name || row.we_library_name;
          const category = this.normalizeCategory(mediaType, libraryName, genres, row.po_title || row.we_title);
          if (category === 'other') continue;
          const play: CanonicalPlay = {
            id: Number(row.observation_id || row.event_id),
            sourceKind: 'cowatch_confirmation',
            userId: targetId,
            ratingKey: String(row.rating_key),
            grandparentRatingKey: (row.po_gp_key || row.we_gp_key) ? String(row.po_gp_key || row.we_gp_key) : null,
            mediaType,
            category,
            title: String(row.po_title || row.we_title || ''),
            showTitle: (row.po_show_title || row.we_show_title) ? String(row.po_show_title || row.we_show_title) : null,
            seasonNumber: (row.po_season_number ?? row.we_season_number) != null ? Number(row.po_season_number ?? row.we_season_number) : null,
            episodeNumber: (row.po_episode_number ?? row.we_episode_number) != null ? Number(row.po_episode_number ?? row.we_episode_number) : null,
            genres,
            watchedAt: row.watched_at ?? null,
            completed: Boolean(row.completed),
            durationSeconds: row.duration != null ? normalizeDurationSeconds(row.duration) : null,
            viewOffsetSeconds: row.view_offset != null ? Number(row.view_offset) : null,
            percentComplete: row.percent_complete != null ? Number(row.percent_complete) : null
          };

          targetPlays.push(play);
          playsByUser.set(targetId, targetPlays);
        }
      }
    }

    // B) Browser adjudications (decision='yes' latest)
    const adjudicationRows = this.db.prepare(`
      SELECT
        ca.id,
        ca.candidate_id,
        ca.source_user_id,
        ca.target_user_id,
        ca.rating_key,
        ca.supporting_observation_ids_json,
        ca.created_at
      FROM cowatch_adjudications ca
      WHERE ca.id = (
        SELECT MAX(latest.id)
        FROM cowatch_adjudications latest
        WHERE latest.candidate_id = ca.candidate_id
      )
      AND ca.decision = 'yes'
      ORDER BY ca.id ASC
    `).all() as any[];

    for (const row of adjudicationRows) {
      let observationIds: number[] = [];
      try {
        observationIds = JSON.parse(row.supporting_observation_ids_json);
      } catch {
        observationIds = [];
      }

      const sourceId = Number(row.source_user_id);
      const targetId = Number(row.target_user_id);

      // Attribute from source to target if target is visible
      if (visibleUserIds.has(targetId)) {
        const targetPlays = playsByUser.get(targetId) ?? [];
        const sourcePlays = playsByUser.get(sourceId) ?? [];

        for (const obsId of observationIds) {
          const sourcePlay = sourcePlays.find((p) => p.id === Number(obsId) && p.sourceKind === 'playback_observation');
          if (sourcePlay) {
            const alreadyHasPlay = targetPlays.some(
              (p) =>
                p.ratingKey === sourcePlay.ratingKey &&
                Math.abs(new Date(p.watchedAt ?? 0).getTime() - new Date(sourcePlay.watchedAt ?? 0).getTime()) <= 2 * 3600 * 1000
            );
            if (!alreadyHasPlay) {
              targetPlays.push({
                ...sourcePlay,
                userId: targetId,
                sourceKind: 'cowatch_adjudication'
              });
              playsByUser.set(targetId, targetPlays);
            }
          }
        }
      }
    }

    // Sort all user play streams by watchedAt ASC, id ASC
    for (const plays of playsByUser.values()) {
      plays.sort((a, b) => {
        if (!a.watchedAt && !b.watchedAt) return a.id - b.id;
        if (!a.watchedAt) return 1;
        if (!b.watchedAt) return -1;
        return a.watchedAt.localeCompare(b.watchedAt) || a.id - b.id;
      });
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

        const completedPlays = keyPlays
          .filter((p) => p.completed)
          .sort((a, b) => {
            if (!a.watchedAt && !b.watchedAt) return a.id - b.id;
            if (!a.watchedAt) return 1;
            if (!b.watchedAt) return -1;
            return a.watchedAt.localeCompare(b.watchedAt) || a.id - b.id;
          });

        const sessionFirstPlays: CanonicalPlay[] = [];
        for (const play of completedPlays) {
          const lastPlay = sessionFirstPlays[sessionFirstPlays.length - 1];
          if (!lastPlay) {
            sessionFirstPlays.push(play);
            continue;
          }
          const lastMs = lastPlay.watchedAt ? new Date(lastPlay.watchedAt).getTime() : 0;
          const currMs = play.watchedAt ? new Date(play.watchedAt).getTime() : 0;
          const diffMs = Math.abs(currMs - lastMs);
          if (diffMs >= 2 * 60 * 60 * 1000) {
            sessionFirstPlays.push(play);
          }
        }

        const refs: SupportingEvidenceRef[] = sessionFirstPlays
          .slice(1) // Qualifying replays after first completed session
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

    // 1. Check if there are candidate adjudications
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

    // 2. Check pending watch events with co-watch review prompts
    try {
      const pendingEvents = this.db.prepare(`
        SELECT DISTINCT source_user_id
        FROM watch_events
        WHERE prompt_status IN ('pending', 'delivered')
      `).all() as Array<{ source_user_id: number }>;

      for (const row of pendingEvents) {
        const uid = Number(row.source_user_id);
        if (visibleUserIds.has(uid)) {
          const confirmed = coWatchesByUser.get(uid) ?? [];
          if (confirmed.length === 0) {
            inferredOnly.add(uid);
          }
        }
      }
    } catch {}

    // 3. Check cowatch_review_prompts table if present
    try {
      const reviewPrompts = this.db.prepare(`
        SELECT 1 FROM sqlite_master WHERE type='table' AND name='cowatch_review_prompts'
      `).get();
      if (reviewPrompts) {
        const promptRows = this.db.prepare(`
          SELECT DISTINCT ca.source_user_id, ca.target_user_id
          FROM cowatch_review_prompts crp
          JOIN cowatch_adjudications ca ON ca.candidate_id = crp.candidate_id
        `).all() as Array<{ source_user_id: number; target_user_id: number }>;
        for (const row of promptRows) {
          for (const uid of [Number(row.source_user_id), Number(row.target_user_id)]) {
            if (!visibleUserIds.has(uid)) continue;
            const confirmed = coWatchesByUser.get(uid) ?? [];
            if (confirmed.length === 0) {
              inferredOnly.add(uid);
            }
          }
        }
      }
    } catch {}

    return inferredOnly;
  }

  private calculateShowProgress(
    plays: CanonicalPlay[],
    replaysByRatingKey: Map<string, number>
  ): Map<string, ShowProgressEvidence> {
    const showProgress = new Map<string, ShowProgressEvidence>();

    // Group episodic plays by show key
    const playsByShowKey = new Map<string, CanonicalPlay[]>();
    for (const play of plays) {
      if (play.category !== 'tv' && play.category !== 'anime' && play.category !== 'classic_tv') {
        continue;
      }
      if (play.seasonNumber === 0) {
        // Exclude Season 0 specials from canonical series progress & show mastery
        continue;
      }
      const showKey = play.grandparentRatingKey || play.showTitle || play.title;
      if (!showKey) continue;
      const list = playsByShowKey.get(showKey) ?? [];
      list.push(play);
      playsByShowKey.set(showKey, list);
    }

    const showOverrides = readShowOverrides();

    for (const [showKey, showPlays] of playsByShowKey.entries()) {
      const sample = showPlays[0];
      let catalogRow: any = null;

      if (sample.grandparentRatingKey) {
        try {
          catalogRow = this.db.prepare(`
            SELECT rating_key, title, leaf_count, canonical_total_episodes, series_status, aired_episodes_count, next_air_at, media_type, library_title, genres_json
            FROM content_catalog
            WHERE rating_key = ?
          `).get(sample.grandparentRatingKey);
        } catch {}
      }

      if (!catalogRow && sample.showTitle) {
        try {
          catalogRow = this.db.prepare(`
            SELECT rating_key, title, leaf_count, canonical_total_episodes, series_status, aired_episodes_count, next_air_at, media_type, library_title, genres_json
            FROM content_catalog
            WHERE media_type = 'show' AND title = ?
            LIMIT 1
          `).get(sample.showTitle);
        } catch {}
      }

      const rawShowTitle = catalogRow?.title || sample.showTitle || sample.title || '';
      const cleanTitle = cleanShowTitle(rawShowTitle);
      const showOverride = showOverrides[rawShowTitle] || (sample.showTitle ? showOverrides[sample.showTitle] : undefined) || showOverrides[cleanTitle];

      let totalEpisodes: number | null = null;
      let availableOnPlex: number | null = null;
      let missingOffServerCount: number | null = null;
      let seriesStatus: string | null = (showOverride?.seriesStatus ? String(showOverride.seriesStatus).toLowerCase() : null) ?? catalogRow?.series_status ?? null;
      const airedEpisodesCount: number | null =
        showOverride?.airedEpisodesCount !== undefined
          ? showOverride.airedEpisodesCount
          : (catalogRow?.aired_episodes_count != null ? Number(catalogRow.aired_episodes_count) : null);
      const nextAirAt: string | null =
        showOverride?.nextAirAt !== undefined
          ? showOverride.nextAirAt
          : (catalogRow?.next_air_at ?? null);

      const leafCount = catalogRow?.leaf_count != null && Number(catalogRow.leaf_count) > 0 ? Number(catalogRow.leaf_count) : null;
      availableOnPlex = leafCount;

      if (showOverride?.canonicalTotalEpisodes != null && Number(showOverride.canonicalTotalEpisodes) > 0) {
        totalEpisodes = Number(showOverride.canonicalTotalEpisodes);
      } else if (catalogRow?.canonical_total_episodes != null && Number(catalogRow.canonical_total_episodes) > 0) {
        totalEpisodes = Number(catalogRow.canonical_total_episodes);
      } else if (leafCount !== null) {
        totalEpisodes = leafCount;
      } else {
        const lookupKey = catalogRow?.rating_key || sample.grandparentRatingKey;
        if (lookupKey) {
          try {
            const countRow = this.db.prepare(`
              SELECT COUNT(DISTINCT rating_key) as ep_count
              FROM content_catalog
              WHERE grandparent_rating_key = ? AND media_type = 'episode'
                AND (parent_title IS NULL OR (parent_title NOT LIKE '%Special%' AND parent_title != 'Season 0'))
            `).get(lookupKey) as any;
            if (countRow?.ep_count > 0) {
              totalEpisodes = Number(countRow.ep_count);
              if (availableOnPlex === null) {
                availableOnPlex = totalEpisodes;
              }
            }
          } catch {}
        }
      }

      const effectiveAired = airedEpisodesCount != null
        ? Math.max(airedEpisodesCount, availableOnPlex ?? 0)
        : totalEpisodes;

      if (effectiveAired !== null && availableOnPlex !== null) {
        missingOffServerCount = Math.max(0, effectiveAired - availableOnPlex);
      }

      const showRatingKey = catalogRow?.rating_key || sample.grandparentRatingKey || showKey;
      const showTitle = catalogRow?.title || sample.showTitle || sample.title;
      const posterUrl = `/api/artwork/${encodeURIComponent(showRatingKey)}?variant=poster`;

      const allCompletedPlays = showPlays
        .filter((p) => p.completed)
        .sort((a, b) => {
          if (!a.watchedAt && !b.watchedAt) return a.id - b.id;
          if (!a.watchedAt) return 1;
          if (!b.watchedAt) return -1;
          return a.watchedAt.localeCompare(b.watchedAt) || a.id - b.id;
        });

      const completedEpisodeKeys = new Set<string>();
      const completedRatingKeys = new Set<string>();
      const replaysByEpisode = new Map<string, number>();
      const firstWatchedByEpisode = new Map<string, CanonicalPlay>();

      for (const p of allCompletedPlays) {
        completedRatingKeys.add(p.ratingKey);
        const epKey = (p.seasonNumber != null && p.episodeNumber != null)
          ? `s${p.seasonNumber}e${p.episodeNumber}`
          : p.ratingKey;
        completedEpisodeKeys.add(epKey);
        if (!firstWatchedByEpisode.has(epKey)) {
          firstWatchedByEpisode.set(epKey, p);
        }
        const rep = replaysByRatingKey.get(p.ratingKey) ?? 0;
        if (rep > 0) {
          replaysByEpisode.set(epKey, Math.max(replaysByEpisode.get(epKey) ?? 0, rep));
        }
      }

      // Group completed plays by episode key to compute replay details
      const episodePlaysMap = new Map<string, CanonicalPlay[]>();
      for (const p of allCompletedPlays) {
        const epKey = (p.seasonNumber != null && p.episodeNumber != null)
          ? `s${p.seasonNumber}e${p.episodeNumber}`
          : p.ratingKey;
        const list = episodePlaysMap.get(epKey) ?? [];
        list.push(p);
        episodePlaysMap.set(epKey, list);
      }

      const episodeReplayDetails: EpisodeReplayDetail[] = [];
      for (const [epKey, plays] of episodePlaysMap.entries()) {
        const samplePlay = plays[0];
        const latestPlay = plays[plays.length - 1];
        const repCount = replaysByEpisode.get(epKey) ?? Math.max(0, plays.length - 1);
        episodeReplayDetails.push({
          ratingKey: samplePlay.ratingKey,
          episodeKey: epKey,
          title: samplePlay.title || (samplePlay.seasonNumber != null && samplePlay.episodeNumber != null ? `Season ${samplePlay.seasonNumber}, Episode ${samplePlay.episodeNumber}` : `Episode ${epKey}`),
          seasonNumber: samplePlay.seasonNumber ?? null,
          episodeNumber: samplePlay.episodeNumber ?? null,
          playCount: plays.length,
          replayCount: repCount,
          firstWatchedAt: samplePlay.watchedAt ?? null,
          lastWatchedAt: latestPlay.watchedAt ?? samplePlay.watchedAt ?? null
        });
      }

      // Sort episodes naturally by season, episode number, then first watched
      episodeReplayDetails.sort((a, b) => {
        if (a.seasonNumber != null && b.seasonNumber != null && a.seasonNumber !== b.seasonNumber) {
          return a.seasonNumber - b.seasonNumber;
        }
        if (a.seasonNumber != null && b.seasonNumber == null) return -1;
        if (a.seasonNumber == null && b.seasonNumber != null) return 1;

        if (a.episodeNumber != null && b.episodeNumber != null && a.episodeNumber !== b.episodeNumber) {
          return a.episodeNumber - b.episodeNumber;
        }
        if (a.episodeNumber != null && b.episodeNumber == null) return -1;
        if (a.episodeNumber == null && b.episodeNumber != null) return 1;

        return (a.firstWatchedAt || '').localeCompare(b.firstWatchedAt || '');
      });

      let lastCompletedWatchedAt: string | null = null;
      let firstCompletedEpisodeTitle: string | null = null;
      let firstCompletedEpisodeSeason: number | null = null;
      let firstCompletedEpisodeNumber: number | null = null;

      const isRunning = seriesStatus === 'running' || Boolean(nextAirAt);
      const hasMissingOffServer = (missingOffServerCount ?? 0) > 0;
      const isComplete = !isRunning && totalEpisodes != null && completedEpisodeKeys.size >= totalEpisodes && allCompletedPlays.length > 0 && !hasMissingOffServer;
      if (isComplete && totalEpisodes !== null) {
        const firstCompletions = [...firstWatchedByEpisode.values()].sort((a, b) => {
          if (!a.watchedAt && !b.watchedAt) return a.id - b.id;
          if (!a.watchedAt) return 1;
          if (!b.watchedAt) return -1;
          return a.watchedAt.localeCompare(b.watchedAt) || a.id - b.id;
        });
        const crossingIndex = Math.min(totalEpisodes - 1, firstCompletions.length - 1);
        const crossingPlay = firstCompletions[crossingIndex];
        lastCompletedWatchedAt = crossingPlay?.watchedAt ?? (allCompletedPlays[allCompletedPlays.length - 1]?.watchedAt ?? null);
        firstCompletedEpisodeTitle = crossingPlay?.title ?? null;
        firstCompletedEpisodeSeason = crossingPlay?.seasonNumber ?? null;
        firstCompletedEpisodeNumber = crossingPlay?.episodeNumber ?? null;
      }

      // Rolling-storage protection: if the user has watched more episodes historically than currently exist on Plex
      // (e.g. old seasons were deleted while a new season is on Plex), verify they have either watched all aired
      // episodes or every cataloged episode currently on the server.
      let hasUnwatchedRollingStorage = false;
      if (availableOnPlex !== null && completedEpisodeKeys.size > availableOnPlex) {
        if (effectiveAired !== null && completedEpisodeKeys.size < effectiveAired) {
          hasUnwatchedRollingStorage = true;
        } else {
          const lookupKey = catalogRow?.rating_key || sample.grandparentRatingKey;
          if (lookupKey) {
            try {
              const currentCatalogEps = this.db.prepare(`
                SELECT rating_key
                FROM content_catalog
                WHERE grandparent_rating_key = ? AND media_type = 'episode'
                  AND (parent_title IS NULL OR (parent_title NOT LIKE '%Special%' AND parent_title != 'Season 0'))
              `).all(lookupKey) as Array<{ rating_key: string }>;
              if (currentCatalogEps.length > 0 && currentCatalogEps.some((ep) => !completedRatingKeys.has(String(ep.rating_key)))) {
                hasUnwatchedRollingStorage = true;
              }
            } catch {}
          }
        }
      }

      const hasUnreleasedOrMissing =
        hasMissingOffServer ||
        isRunning ||
        (totalEpisodes !== null && availableOnPlex !== null && availableOnPlex < totalEpisodes);

      const isCaughtUpOnPlex = !isComplete && (
        showOverride?.caughtUp === true ||
        (availableOnPlex !== null &&
          completedEpisodeKeys.size >= availableOnPlex &&
          !hasUnwatchedRollingStorage &&
          hasUnreleasedOrMissing)
      );

      let resolvedCategory = sample.category;
      if (catalogRow?.library_title?.toLowerCase().includes('anime')) {
        resolvedCategory = 'anime';
      } else if (catalogRow?.genres_json) {
        try {
          const g = JSON.parse(catalogRow.genres_json);
          if (Array.isArray(g) && g.some((x: string) => String(x).toLowerCase() === 'anime')) {
            resolvedCategory = 'anime';
          }
        } catch {}
      }

      showProgress.set(showRatingKey, {
        grandparentRatingKey: showRatingKey,
        showTitle,
        category: resolvedCategory as 'tv' | 'anime' | 'classic_tv',
        totalEpisodes,
        availableOnPlex,
        missingOffServerCount,
        airedEpisodesCount,
        nextAirAt,
        isCaughtUpOnPlex,
        seriesStatus,
        completedEpisodeKeys,
        allCompletedPlays,
        replaysByEpisode,
        posterUrl,
        lastCompletedWatchedAt,
        latestWatchedAt: allCompletedPlays[allCompletedPlays.length - 1]?.watchedAt ?? null,
        firstCompletedEpisodeTitle,
        firstCompletedEpisodeSeason,
        firstCompletedEpisodeNumber,
        episodeReplayDetails
      });
    }

    return showProgress;
  }

  private readCompletedAudiobookCounts(
    visibleUserIds: Set<number>,
    progressByUser?: Map<number, Map<number, AudiobookProgressEvidence>>
  ): Map<number, number> {
    const countsByUser = new Map<number, number>();
    for (const userId of visibleUserIds) {
      const userBooks = progressByUser?.get(userId);
      if (!userBooks) {
        countsByUser.set(userId, 0);
        continue;
      }
      let completed = 0;
      for (const book of userBooks.values()) {
        if (book.isCompleted) completed++;
      }
      countsByUser.set(userId, completed);
    }
    return countsByUser;
  }

  private readAudiobookProgress(
    visibleUserIds: Set<number>,
    playsByUser: Map<number, CanonicalPlay[]>
  ): {
    progressByUser: Map<number, Map<number, AudiobookProgressEvidence>>;
    secondsByUser: Map<number, number>;
  } {
    const progressByUser = new Map<number, Map<number, AudiobookProgressEvidence>>();
    const secondsByUser = new Map<number, number>();

    const hasAudiobookBooks = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_books'").get());
    const hasPlaybackObservations = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'playback_observations'").get());
    const hasContentCatalog = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'content_catalog'").get());
    const hasRevisions = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_media_revisions'").get());
    const hasRevisionItems = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_media_revision_items'").get());
    const hasPositionEvidence = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_position_evidence'").get());
    const hasChapters = Boolean(this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_chapters'").get());

    if (!hasAudiobookBooks) {
      return { progressByUser, secondsByUser };
    }

    const userBookMap = new Map<number, Map<number, AudiobookProgressEvidence>>();

    const books = this.db.prepare(`
      SELECT id, title, subtitle, authors_json, series_title, series_index,
             total_duration_seconds, chapter_count, cover_url
      FROM audiobook_books
    `).all() as any[];

    const bookMetaMap = new Map<number, {
      id: number;
      title: string;
      subtitle: string | null;
      authors: string[];
      seriesTitle: string | null;
      seriesIndex: number | null;
      totalDurationSeconds: number;
      chapterCount: number | null;
      coverUrl: string | null;
    }>();

    for (const b of books) {
      let authors: string[] = [];
      if (b.authors_json) {
        try {
          const parsed = JSON.parse(b.authors_json);
          if (Array.isArray(parsed)) authors = parsed.map(String);
        } catch {}
      }
      bookMetaMap.set(Number(b.id), {
        id: Number(b.id),
        title: String(b.title ?? ''),
        subtitle: b.subtitle ? String(b.subtitle) : null,
        authors,
        seriesTitle: b.series_title ? String(b.series_title) : null,
        seriesIndex: b.series_index != null ? Number(b.series_index) : null,
        totalDurationSeconds: Number(b.total_duration_seconds ?? 0),
        chapterCount: b.chapter_count != null ? Number(b.chapter_count) : null,
        coverUrl: b.cover_url ?? null
      });
    }

    const rkToBookId = new Map<string, number>();
    const guidToBookId = new Map<string, number>();

    if (hasContentCatalog) {
      try {
        const catRows = this.db.prepare(`
          SELECT rating_key, guid, audiobook_id
          FROM content_catalog
          WHERE audiobook_id IS NOT NULL
        `).all() as any[];
        for (const row of catRows) {
          if (row.rating_key) rkToBookId.set(String(row.rating_key), Number(row.audiobook_id));
          if (row.guid) guidToBookId.set(String(row.guid), Number(row.audiobook_id));
        }
      } catch {}
    }

    if (hasRevisions && hasRevisionItems) {
      try {
        const revRows = this.db.prepare(`
          SELECT rev_item.rating_key, rev_item.guid, rev.audiobook_id
          FROM audiobook_media_revision_items rev_item
          JOIN audiobook_media_revisions rev ON rev.id = rev_item.revision_id
          WHERE rev.audiobook_id IS NOT NULL
        `).all() as any[];
        for (const row of revRows) {
          if (row.rating_key && !rkToBookId.has(String(row.rating_key))) {
            rkToBookId.set(String(row.rating_key), Number(row.audiobook_id));
          }
          if (row.guid && !guidToBookId.has(String(row.guid))) {
            guidToBookId.set(String(row.guid), Number(row.audiobook_id));
          }
        }
      } catch {}
    }

    // 1. Query historical and ongoing playback observations linked through revisions or content_catalog
    if (hasPlaybackObservations) {
      try {
        const obsRows = this.db.prepare(`
          SELECT id, user_id, rating_key, plex_guid, duration, view_offset, percent_complete, completed, watched_at
          FROM playback_observations
          WHERE media_type IN ('track', 'audiobook')
          ORDER BY watched_at ASC, id ASC
        `).all() as any[];

        for (const row of obsRows) {
          const userId = Number(row.user_id);
          if (!visibleUserIds.has(userId)) continue;

          let bookId = rkToBookId.get(String(row.rating_key));
          if (!bookId && row.plex_guid) {
            bookId = guidToBookId.get(String(row.plex_guid));
          }
          if (!bookId) continue;

          const meta = bookMetaMap.get(bookId);
          if (!meta) continue;

          if (!userBookMap.has(userId)) userBookMap.set(userId, new Map());
          const userBooks = userBookMap.get(userId)!;

          let entry = userBooks.get(bookId);
          if (!entry) {
            entry = {
              audiobookId: bookId,
              title: meta.title,
              subtitle: meta.subtitle,
              authors: meta.authors,
              seriesTitle: meta.seriesTitle,
              seriesIndex: meta.seriesIndex,
              totalDurationSeconds: meta.totalDurationSeconds,
              viewOffsetSeconds: 0,
              percentComplete: 0,
              chapterCount: meta.chapterCount,
              completedChaptersCount: null,
              isCompleted: false,
              relistenCount: 0,
              firstCompletedAt: null,
              latestWatchedAt: null,
              coverUrl: meta.coverUrl,
              posterUrl: `/api/artwork/${encodeURIComponent(`audiobook:${bookId}`)}?variant=poster`
            };
            userBooks.set(bookId, entry);
          }

          const obsPercent = Number(row.percent_complete ?? 0);
          const obsDur = Number(row.duration ?? 0);
          const obsOffset = Number(row.view_offset ?? 0);
          const isCompletedObs = (Number(row.completed) === 1 && obsPercent >= 80) || obsPercent >= 95;

          if (isCompletedObs) {
            if (!entry.isCompleted) {
              entry.isCompleted = true;
              entry.firstCompletedAt = row.watched_at ?? null;
            }
          }

          entry.latestWatchedAt = row.watched_at ?? entry.latestWatchedAt;
          if (entry.isCompleted) {
            entry.percentComplete = 100;
            entry.viewOffsetSeconds = entry.totalDurationSeconds;
          } else {
            entry.percentComplete = Math.max(entry.percentComplete, obsPercent);
            entry.viewOffsetSeconds = Math.max(entry.viewOffsetSeconds, obsOffset || obsDur);
          }
        }
      } catch {}
    }

    // 2. Query exact stop captures from audiobook_position_evidence and merge timeline
    if (hasPositionEvidence) {
      try {
        const apeRows = this.db.prepare(`
          SELECT id, user_id, audiobook_id, view_offset_ms, duration_ms, observed_at
          FROM audiobook_position_evidence
          WHERE duration_ms > 0
          ORDER BY observed_at ASC, id ASC
        `).all() as any[];

        const apesByUserBook = new Map<string, any[]>();
        for (const a of apeRows) {
          const userId = Number(a.user_id);
          if (!visibleUserIds.has(userId)) continue;
          const key = `${userId}:${a.audiobook_id}`;
          let list = apesByUserBook.get(key);
          if (!list) {
            list = [];
            apesByUserBook.set(key, list);
          }
          list.push(a);
        }

        for (const [key, rows] of apesByUserBook.entries()) {
          const [uIdStr, bIdStr] = key.split(':');
          const userId = Number(uIdStr);
          const bookId = Number(bIdStr);
          const meta = bookMetaMap.get(bookId);
          if (!meta) continue;

          if (!userBookMap.has(userId)) userBookMap.set(userId, new Map());
          const userBooks = userBookMap.get(userId)!;

          let entry = userBooks.get(bookId);
          if (!entry) {
            entry = {
              audiobookId: bookId,
              title: meta.title,
              subtitle: meta.subtitle,
              authors: meta.authors,
              seriesTitle: meta.seriesTitle,
              seriesIndex: meta.seriesIndex,
              totalDurationSeconds: meta.totalDurationSeconds,
              viewOffsetSeconds: 0,
              percentComplete: 0,
              chapterCount: meta.chapterCount,
              completedChaptersCount: null,
              isCompleted: false,
              relistenCount: 0,
              firstCompletedAt: null,
              latestWatchedAt: null,
              coverUrl: meta.coverUrl,
              posterUrl: `/api/artwork/${encodeURIComponent(`audiobook:${bookId}`)}?variant=poster`
            };
            userBooks.set(bookId, entry);
          }

          const latestRow = rows[rows.length - 1];
          const latestOffsetMs = Number(latestRow.view_offset_ms ?? 0);
          const latestDurationMs = Number(latestRow.duration_ms ?? 0);
          const apeDurationSec = latestDurationMs > 0 ? Math.round(latestDurationMs / 1000) : entry.totalDurationSeconds;
          if (apeDurationSec > 0 && (!entry.totalDurationSeconds || entry.totalDurationSeconds === 0)) {
            entry.totalDurationSeconds = apeDurationSec;
          }

          const latestPercent = latestDurationMs > 0 ? Math.min(100, Math.round((latestOffsetMs / latestDurationMs) * 100)) : 0;
          const latestOffsetSec = Math.round(latestOffsetMs / 1000);

          const completedApeRow = rows.find((r) => {
            const dur = Number(r.duration_ms ?? 0);
            const off = Number(r.view_offset_ms ?? 0);
            return dur > 0 && (off >= dur * 0.98 || off >= dur);
          });

          const isApeCompleted = Boolean(completedApeRow) || latestPercent >= 98;

          if (isApeCompleted) {
            entry.isCompleted = true;
            entry.percentComplete = 100;
            entry.viewOffsetSeconds = entry.totalDurationSeconds;
            if (!entry.firstCompletedAt && completedApeRow) {
              entry.firstCompletedAt = completedApeRow.observed_at;
            }
          } else {
            // High-fidelity stop captures override older or glitchy observation completion
            entry.isCompleted = false;
            entry.firstCompletedAt = null;
            entry.percentComplete = latestPercent;
            entry.viewOffsetSeconds = latestOffsetSec;
          }

          entry.latestWatchedAt = latestRow.observed_at ?? entry.latestWatchedAt;
        }
      } catch {}
    }

    // 3. Resolve chapter positions when cached audiobook chapters exist
    if (hasChapters) {
      try {
        const getChapters = this.db.prepare(`
          SELECT chapter_index, start_offset_ms, end_offset_ms
          FROM audiobook_chapters
          WHERE audiobook_id = ?
          ORDER BY chapter_index ASC
        `);

        for (const userBooks of userBookMap.values()) {
          for (const book of userBooks.values()) {
            const chs = getChapters.all(book.audiobookId) as any[];
            if (chs && chs.length > 0) {
              book.chapterCount = chs.length;
              if (book.isCompleted) {
                book.completedChaptersCount = chs.length;
              } else {
                const offsetMs = book.viewOffsetSeconds * 1000;
                const curr = chs.find((c) => offsetMs >= c.start_offset_ms && offsetMs < c.end_offset_ms);
                if (curr) {
                  book.completedChaptersCount = Math.max(0, curr.chapter_index - 1);
                }
              }
            }
          }
        }
      } catch {}
    }

    // 3. Filter books with >= 2% progress or isCompleted
    for (const [userId, bookMap] of userBookMap.entries()) {
      const filteredMap = new Map<number, AudiobookProgressEvidence>();
      for (const [bookId, book] of bookMap.entries()) {
        if (book.percentComplete >= 2 || book.isCompleted) {
          filteredMap.set(bookId, book);
        }
      }
      if (filteredMap.size > 0) {
        progressByUser.set(userId, filteredMap);
      }
    }

    // 4. Compute listening seconds per user across plays and position evidence
    for (const userId of visibleUserIds) {
      let totalSeconds = 0;
      const plays = playsByUser.get(userId) ?? [];
      for (const play of plays) {
        if (play.category === 'audiobook' && play.durationSeconds) {
          totalSeconds += play.durationSeconds;
        }
      }

      const userBooks = progressByUser.get(userId);
      if (userBooks) {
        let positionSeconds = 0;
        for (const book of userBooks.values()) {
          positionSeconds += book.viewOffsetSeconds;
        }
        totalSeconds = Math.max(totalSeconds, positionSeconds);
      }

      secondsByUser.set(userId, totalSeconds);
    }

    return { progressByUser, secondsByUser };
  }

  private readMovieCollectionsAndReplays(
    visibleUserIds: Set<number>,
    playsByUser: Map<number, CanonicalPlay[]>
  ): {
    collectionsByUser: Map<number, Map<string, MovieCollectionEvidence>>;
    replaysByUser: Map<number, Map<string, MovieReplayEvidence>>;
    progressByUser: Map<number, Map<string, MovieProgressEvidence>>;
  } {
    const collectionsByUser = new Map<number, Map<string, MovieCollectionEvidence>>();
    const replaysByUser = new Map<number, Map<string, MovieReplayEvidence>>();
    const progressByUser = new Map<number, Map<string, MovieProgressEvidence>>();

    // 1. Movie Replay Favorites & In-Progress Movies
    for (const userId of visibleUserIds) {
      const plays = playsByUser.get(userId) ?? [];
      const moviePlays = plays.filter((p) => p.category === 'movie' && p.completed);
      const { replaysByRatingKey } = this.calculateReplays(moviePlays);
      const userReplays = new Map<string, MovieReplayEvidence>();

      const playsByKey = new Map<string, CanonicalPlay[]>();
      for (const p of moviePlays) {
        const list = playsByKey.get(p.ratingKey) ?? [];
        list.push(p);
        playsByKey.set(p.ratingKey, list);
      }

      for (const [ratingKey, keyPlays] of playsByKey.entries()) {
        const repCount = replaysByRatingKey.get(ratingKey) ?? 0;
        if (repCount >= 1) {
          const sample = keyPlays[0];
          const sortedCompleted = [...keyPlays].sort((a, b) => (a.watchedAt || '').localeCompare(b.watchedAt || ''));
          const lastCompleted = sortedCompleted[sortedCompleted.length - 1];
          userReplays.set(ratingKey, {
            ratingKey,
            title: sample.title,
            posterUrl: `/api/artwork/${encodeURIComponent(ratingKey)}?variant=poster`,
            year: null,
            playCount: keyPlays.length,
            replayCount: repCount,
            firstWatchedAt: sortedCompleted[0]?.watchedAt ?? null,
            lastCompletedWatchedAt: lastCompleted?.watchedAt ?? null,
            latestWatchedAt: sortedCompleted[sortedCompleted.length - 1]?.watchedAt ?? null,
            allCompletedPlays: keyPlays
          });
        }
      }

      replaysByUser.set(userId, userReplays);

      // In-Progress Movies
      const userMovieProgress = new Map<string, MovieProgressEvidence>();
      const allMoviePlaysByKey = new Map<string, CanonicalPlay[]>();
      for (const p of plays) {
        if (p.category !== 'movie') continue;
        const list = allMoviePlaysByKey.get(p.ratingKey) ?? [];
        list.push(p);
        allMoviePlaysByKey.set(p.ratingKey, list);
      }

      for (const [ratingKey, keyPlays] of allMoviePlaysByKey.entries()) {
        if (keyPlays.length === 0) continue;
        const latestPlay = keyPlays[keyPlays.length - 1];
        const pct = latestPlay.percentComplete ?? 0;
        const isLatestIncomplete = !latestPlay.completed && pct >= 2 && pct < 90;

        if (isLatestIncomplete) {
          const durSec = latestPlay.durationSeconds || 7200;
          const offsetSec = latestPlay.viewOffsetSeconds != null && latestPlay.viewOffsetSeconds > 0
            ? latestPlay.viewOffsetSeconds
            : Math.round(durSec * (pct / 100));

          userMovieProgress.set(ratingKey, {
            ratingKey,
            title: latestPlay.title,
            posterUrl: `/api/artwork/${encodeURIComponent(ratingKey)}?variant=poster`,
            year: null,
            totalDurationSeconds: durSec,
            viewOffsetSeconds: offsetSec,
            percentComplete: pct,
            latestWatchedAt: latestPlay.watchedAt ?? null
          });
        }
      }

      progressByUser.set(userId, userMovieProgress);
    }

    // 2. Movie Franchises / Collections
    let movieCollectionsConfig: Record<string, {
      title: string;
      canonicalTotalFilms?: number;
      films: Array<{ title: string; year?: number; ratingKey?: string }>;
    }> = {};

    try {
      const configPath = path.resolve('config/movie_collections.json');
      if (fs.existsSync(configPath)) {
        movieCollectionsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch {}

    let catalogMovies: Array<{ rating_key: string; title: string; genres_json?: string }> = [];
    try {
      catalogMovies = this.db.prepare(`
        SELECT rating_key, title, genres_json
        FROM content_catalog
        WHERE media_type = 'movie'
      `).all() as any[];
    } catch {}

    for (const userId of visibleUserIds) {
      const plays = playsByUser.get(userId) ?? [];
      const completedMoviePlays = plays.filter((p) => p.category === 'movie' && p.completed);
      const completedTitles = new Set(completedMoviePlays.map((p) => p.title.trim().toLowerCase()));
      const completedKeys = new Set(completedMoviePlays.map((p) => p.ratingKey));
      const userCollections = new Map<string, MovieCollectionEvidence>();

      for (const [colKey, col] of Object.entries(movieCollectionsConfig)) {
        const totalFilms = col.canonicalTotalFilms || col.films.length;
        let availableOnPlex = 0;
        const completedFilmKeys = new Set<string>();
        const filmDetails: MovieCollectionEvidence['filmDetails'] = [];
        const matchingCompletedPlays: CanonicalPlay[] = [];
        let firstPosterRatingKey: string | null = null;

        for (const film of col.films) {
          const lowerFilmTitle = film.title.trim().toLowerCase();
          const catalogMatch = catalogMovies.find(
            (m) => m.title.trim().toLowerCase() === lowerFilmTitle || (film.ratingKey && m.rating_key === film.ratingKey)
          );
          const isOnPlex = Boolean(catalogMatch);
          if (isOnPlex) availableOnPlex += 1;

          const isCompleted = completedTitles.has(lowerFilmTitle) || (catalogMatch && completedKeys.has(catalogMatch.rating_key));
          const ratingKey = catalogMatch ? catalogMatch.rating_key : (film.ratingKey || `missing-${lowerFilmTitle}`);

          if (isOnPlex && !firstPosterRatingKey) {
            firstPosterRatingKey = ratingKey;
          }

          if (isCompleted) {
            completedFilmKeys.add(ratingKey);
            const playsForFilm = completedMoviePlays.filter(
              (p) => p.title.trim().toLowerCase() === lowerFilmTitle || (catalogMatch && p.ratingKey === catalogMatch.rating_key)
            );
            matchingCompletedPlays.push(...playsForFilm);
            const playCount = playsForFilm.length;
            filmDetails.push({
              ratingKey,
              title: film.title,
              year: film.year ?? null,
              availableOnPlex: isOnPlex,
              completed: true,
              playCount,
              firstWatchedAt: playsForFilm[0]?.watchedAt ?? null,
              lastWatchedAt: playsForFilm[playsForFilm.length - 1]?.watchedAt ?? null
            });
          } else {
            filmDetails.push({
              ratingKey,
              title: film.title,
              year: film.year ?? null,
              availableOnPlex: isOnPlex,
              completed: false,
              playCount: 0,
              firstWatchedAt: null,
              lastWatchedAt: null
            });
          }
        }

        if (completedFilmKeys.size > 0) {
          matchingCompletedPlays.sort((a, b) => (a.watchedAt || '').localeCompare(b.watchedAt || ''));
          const posterUrl = firstPosterRatingKey
            ? `/api/artwork/${encodeURIComponent(firstPosterRatingKey)}?variant=poster`
            : null;

          userCollections.set(colKey, {
            collectionKey: colKey,
            collectionTitle: col.title,
            posterUrl,
            totalFilms,
            availableOnPlex,
            missingOffServerCount: Math.max(0, totalFilms - availableOnPlex),
            completedFilmKeys,
            allCompletedPlays: matchingCompletedPlays,
            filmDetails,
            latestWatchedAt: matchingCompletedPlays[matchingCompletedPlays.length - 1]?.watchedAt ?? null
          });
        }
      }

      collectionsByUser.set(userId, userCollections);
    }

    return { collectionsByUser, replaysByUser, progressByUser };
  }

  private normalizeCategory(
    mediaType?: string | null,
    libraryName?: string | null,
    genres?: string[] | null,
    title?: string | null,
    guid?: string | null
  ): 'movie' | 'tv' | 'anime' | 'classic_tv' | 'audiobook' | 'other' {
    const m = (mediaType ?? '').toLowerCase();
    const lib = (libraryName ?? '').toLowerCase();
    const t = (title ?? '').toLowerCase();
    const g = (guid ?? '').toLowerCase();

    // Audiobooks
    if (m === 'audiobook' || lib.includes('audiobook') || (m === 'track' && (!lib || lib.includes('audiobook')))) {
      return 'audiobook';
    }

    // Anime
    if (lib.includes('anime') || genres?.some((gen) => gen.toLowerCase() === 'anime')) {
      return 'anime';
    }

    // Classic TV
    if (lib.includes('classic')) {
      return 'classic_tv';
    }

    // TV Shows
    if (
      m === 'episode' ||
      m === 'show' ||
      m === 'season' ||
      lib.includes('tv') ||
      lib.includes('show') ||
      lib.includes('jdrama') ||
      lib.includes('etv')
    ) {
      return 'tv';
    }

    // Explicit non-movie libraries, agents, or video titles: workouts, learning, sports, clips, music
    if (
      lib.includes('workout') ||
      lib.includes('exercise') ||
      lib.includes('fitness') ||
      lib.includes('learning') ||
      lib.includes('masterclass') ||
      lib.includes('raptor') ||
      lib.includes('sport') ||
      lib.includes('home video') ||
      lib.includes('music') ||
      m === 'clip' ||
      m === 'photo' ||
      m === 'track' ||
      g.startsWith('com.plexapp.agents.none') ||
      g.startsWith('local://') ||
      t.includes('workout') ||
      t.includes('cardio') ||
      t.includes('liift') ||
      t.includes('tabata') ||
      t.includes('insanity') ||
      t.includes('procreate') ||
      t.includes('tutorial') ||
      t.includes('lesson') ||
      t.includes('friday fight') ||
      t.includes('max out') ||
      t.includes('sweat fest') ||
      t.includes('fight night') ||
      t.includes('presentation') ||
      t.includes('stains and textures') ||
      /^u\d+\.\d+/.test(t)
    ) {
      return 'other';
    }

    // Movies: must be in a movie library or have media_type = 'movie' with no conflicting library
    if (
      lib.includes('movie') ||
      lib.includes('film') ||
      lib.includes('cinema') ||
      (!lib && m === 'movie') ||
      lib === 'movies' ||
      lib === '4k movies'
    ) {
      return 'movie';
    }

    return 'other';
  }
}

function normalizeDurationSeconds(duration?: number | null): number {
  const val = Number(duration ?? 0);
  if (!Number.isFinite(val) || val <= 0) return 0;
  return val > 100000 ? Math.round(val / 1000) : Math.round(val);
}

