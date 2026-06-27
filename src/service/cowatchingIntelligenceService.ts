import type { Db } from "../db/database.js";
import { QueryService } from "./queryService.js";
import { UserService } from "./userService.js";
import { z } from "zod";

export const cowatchingParamsSchema = z.object({
  days: z.preprocess((val) => val ? Number(val) : undefined, z.number().int().positive().default(7)),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  timezone: z.string().regex(/^[+-]\d{2}:\d{2}$/, "Invalid timezone format [+-]HH:MM").optional(),
  maxStartGapMinutes: z.preprocess((val) => val ? Number(val) : undefined, z.number().positive().default(15))
});

export interface CowatchingParticipant {
  userId: number;
  username: string;
  displayName: string;
  role: "source" | "target";
  evidenceState: "observed" | "confirmed" | "inferred" | "dismissed" | "none";
  confidence: number;
  supportingObservationIds?: number[];
  reason: string;
}

export interface CowatchingEvent {
  id: string;
  ratingKey: string;
  mediaType: string;
  title: string;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  watchedAt: string;
  participants: CowatchingParticipant[];
  ruleVersion: string;
}

export class CowatchingIntelligenceService {
  private readonly queryService: QueryService;
  private readonly userService: UserService;

  constructor(private readonly db: Db) {
    this.queryService = new QueryService(db);
    this.userService = new UserService(db);
  }

  getCowatchingEvents(params: unknown): CowatchingEvent[] {
    const parsed = cowatchingParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new Error(`Validation Error: ${parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`);
    }

    const { days, dateFrom, dateTo, timezone, maxStartGapMinutes } = parsed.data;

    let fromDate = dateFrom;
    if (days && !dateFrom) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      fromDate = date.toISOString();
    }

    const observations = this.queryService.queryHistory({
      dateFrom: fromDate,
      dateTo,
      timezone,
      limit: 5000
    });

    if (observations.length === 0) {
      return [];
    }

    const obsByRatingKey = new Map<string, typeof observations>();
    for (const obs of observations) {
      if (!obsByRatingKey.has(obs.ratingKey)) {
        obsByRatingKey.set(obs.ratingKey, []);
      }
      obsByRatingKey.get(obs.ratingKey)!.push(obs);
    }

    const events: CowatchingEvent[] = [];

    for (const [ratingKey, plays] of obsByRatingKey.entries()) {
      const playsWithIntervals = plays.map(obs => {
        const durationSec = obs.duration ?? obs.viewOffset ?? 0;
        const endTime = new Date(obs.watchedAt).getTime();
        const startTime = endTime - durationSec * 1000;
        return { obs, startTime, endTime };
      }).sort((a, b) => a.startTime - b.startTime);

      const clusters: typeof playsWithIntervals[] = [];
      let currentCluster: typeof playsWithIntervals = [];

      for (const p of playsWithIntervals) {
        if (currentCluster.length === 0) {
          currentCluster.push(p);
          continue;
        }

        const lastPlay = currentCluster[currentCluster.length - 1];
        const gapMs = p.startTime - lastPlay.startTime;

        if (gapMs <= 2 * 60 * 60 * 1000) {
          currentCluster.push(p);
        } else {
          clusters.push(currentCluster);
          currentCluster = [p];
        }
      }
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }

      for (const cluster of clusters) {
        const firstPlay = cluster[0];
        
        const matchedWatchEvent = this.db.prepare(`
          SELECT * FROM watch_events 
          WHERE rating_key = ? 
            AND ABS(strftime('%s', watched_at) - strftime('%s', ?)) <= 3600
          LIMIT 1
        `).get(ratingKey, new Date(firstPlay.startTime).toISOString()) as any;

        const participantsMap = new Map<number, CowatchingParticipant>();

        const enabledUsers = this.userService.listEnabledUsers();
        for (const user of enabledUsers) {
          participantsMap.set(user.id, {
            userId: user.id,
            username: user.plex_username,
            displayName: this.userService.findById(user.id)?.display_name || user.plex_username,
            role: "target",
            evidenceState: "none",
            confidence: 0.0,
            reason: "No evidence of playback"
          });
        }

        let sourceUserId: number | null = null;
        if (matchedWatchEvent) {
          sourceUserId = matchedWatchEvent.source_user_id;
        } else {
          sourceUserId = firstPlay.obs.userId;
        }

        if (sourceUserId !== null) {
          const srcPart = participantsMap.get(sourceUserId);
          if (srcPart) srcPart.role = "source";
        }

        for (const play of cluster) {
          const userPart = participantsMap.get(play.obs.userId);
          if (userPart) {
            userPart.evidenceState = "observed";
            userPart.confidence = 1.0;
            userPart.supportingObservationIds = [play.obs.id];
            userPart.reason = `Observed playback at ${play.obs.watchedAt}`;
          }
        }

        if (matchedWatchEvent) {
          const confirmations = this.db.prepare(
            "SELECT * FROM cowatch_confirmations WHERE watch_event_id = ?"
          ).all(matchedWatchEvent.id) as any[];

          for (const conf of confirmations) {
            const userPart = participantsMap.get(conf.target_user_id);
            if (userPart) {
              if (conf.status === "confirmed") {
                userPart.evidenceState = "confirmed";
                userPart.confidence = 1.0;
                userPart.reason = "Explicitly confirmed via Discord prompt";
              } else if (conf.status === "dismissed") {
                userPart.evidenceState = "dismissed";
                userPart.confidence = 0.0;
                userPart.reason = "Dismissed / explicitly denied via Discord prompt";
              } else if (conf.plex_sync_status === "marked_watched" || conf.plex_sync_status === "already_watched") {
                if (userPart.evidenceState === "none") {
                  userPart.reason = "Plex watched flag synchronized (does not prove co-watching)";
                }
              }
            }
          }
        }

        const sourcePlay = cluster.find(p => p.obs.userId === sourceUserId);
        if (sourcePlay) {
          for (const play of cluster) {
            if (play.obs.userId === sourceUserId) continue;

            const userPart = participantsMap.get(play.obs.userId);
            if (userPart && userPart.evidenceState === "observed") {
              const startGapMinutes = Math.abs(play.startTime - sourcePlay.startTime) / (60 * 1000);
              
              if (startGapMinutes <= maxStartGapMinutes) {
                userPart.evidenceState = "inferred";
                
                if (startGapMinutes <= 5) {
                  userPart.confidence = 0.85;
                  userPart.reason = `Inferred co-watching: play started within ${Math.round(startGapMinutes)}m of source (Rule: 2.0-time-alignment)`;
                } else if (startGapMinutes <= 10) {
                  userPart.confidence = 0.65;
                  userPart.reason = `Inferred co-watching: play started within ${Math.round(startGapMinutes)}m of source (Rule: 2.0-time-alignment)`;
                } else {
                  userPart.confidence = 0.45;
                  userPart.reason = `Inferred co-watching (low confidence): play started within ${Math.round(startGapMinutes)}m of source (Rule: 2.0-time-alignment)`;
                }
              }
            }
          }
        }

        const participants = Array.from(participantsMap.values());
        
        const hasCoWatchers = participants.some(p => 
          p.userId !== sourceUserId && ["confirmed", "inferred", "observed"].includes(p.evidenceState)
        );

        if (hasCoWatchers || cluster.length > 1) {
          const latestPlay = cluster[cluster.length - 1].obs;
          events.push({
            id: `cowatch-${ratingKey}-${firstPlay.startTime}`,
            ratingKey,
            mediaType: latestPlay.mediaType,
            title: latestPlay.title,
            showTitle: latestPlay.showTitle,
            seasonNumber: latestPlay.seasonNumber,
            episodeNumber: latestPlay.episodeNumber,
            watchedAt: new Date(firstPlay.startTime).toISOString(),
            participants,
            ruleVersion: "2.0-time-alignment"
          });
        }
      }
    }

    return events.reverse();
  }
}
