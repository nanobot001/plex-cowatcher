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
  timingRelationship?: {
    startGapMinutes: number;
    overlapMinutes: number;
  };
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

    // Pre-cache enabled users to avoid loop-level DB queries
    const enabledUsersRaw = this.userService.listEnabledUsers();
    const enabledUsers = enabledUsersRaw.map(user => {
      const fullUser = this.userService.findById(user.id);
      return {
        id: user.id,
        plex_username: user.plex_username,
        displayName: (fullUser as any)?.dashboard_alias || fullUser?.display_name || user.plex_username
      };
    });

    for (const [ratingKey, plays] of obsByRatingKey.entries()) {
      const playsWithIntervals = plays.map(obs => {
        let durationSec = obs.duration ?? obs.viewOffset ?? 0;
        if (durationSec > 100000) {
          durationSec = durationSec / 1000;
        }
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
        
        const firstPlayIso = new Date(firstPlay.startTime).toISOString();
        const matchedWatchEvent = this.db.prepare(`
          SELECT * FROM watch_events 
          WHERE rating_key = ? 
            AND watched_at >= strftime('%Y-%m-%dT%H:%M:%fZ', ?, '-3600 seconds')
            AND watched_at <= strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+3600 seconds')
          LIMIT 1
        `).get(ratingKey, firstPlayIso, firstPlayIso) as any;

        const participantsMap = new Map<number, CowatchingParticipant>();

        for (const user of enabledUsers) {
          participantsMap.set(user.id, {
            userId: user.id,
            username: user.plex_username,
            displayName: user.displayName,
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
                if (conf.confirmed_by_discord_user_id) {
                  userPart.reason = `Confirmed by Discord user ${conf.confirmed_by_discord_user_id} via ${conf.confirmation_method || "prompt"}`;
                } else if (conf.confirmation_method) {
                  userPart.reason = `Household-confirmed via ${conf.confirmation_method}`;
                } else {
                  userPart.reason = "Explicitly confirmed via Discord prompt";
                }
              } else if (conf.status === "dismissed") {
                userPart.evidenceState = "dismissed";
                userPart.confidence = 0.0;
                if (conf.confirmed_by_discord_user_id) {
                  userPart.reason = `Denied by Discord user ${conf.confirmed_by_discord_user_id} via ${conf.confirmation_method || "prompt"}`;
                } else if (conf.confirmation_method) {
                  userPart.reason = `Household-denied via ${conf.confirmation_method}`;
                } else {
                  userPart.reason = "Dismissed / explicitly denied via Discord prompt";
                }
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
            if (userPart) {
              if (userPart.evidenceState === "dismissed") {
                continue;
              }
              if (userPart.evidenceState === "confirmed") {
                continue;
              }

              if (userPart.evidenceState === "observed") {
                let srcDurationSec = sourcePlay.obs.duration ?? sourcePlay.obs.viewOffset ?? 0;
                let tgtDurationSec = play.obs.duration ?? play.obs.viewOffset ?? 0;
                if (srcDurationSec > 100000) {
                  srcDurationSec = srcDurationSec / 1000;
                }
                if (tgtDurationSec > 100000) {
                  tgtDurationSec = tgtDurationSec / 1000;
                }

                const hasKnownTiming = srcDurationSec > 0 && tgtDurationSec > 0 &&
                                       sourcePlay.obs.watchedAt && play.obs.watchedAt &&
                                       !isNaN(Date.parse(sourcePlay.obs.watchedAt)) && !isNaN(Date.parse(play.obs.watchedAt));

                if (!hasKnownTiming) {
                  userPart.reason = `Observed playback at ${play.obs.watchedAt} but timing/duration is unknown (cannot infer co-watching)`;
                  continue;
                }

                const srcStart = sourcePlay.startTime;
                const srcEnd = sourcePlay.endTime;
                const tgtStart = play.startTime;
                const tgtEnd = play.endTime;

                const startGapMinutes = Math.abs(tgtStart - srcStart) / (60 * 1000);
                const overlapMs = Math.max(0, Math.min(srcEnd, tgtEnd) - Math.max(srcStart, tgtStart));
                const overlapMinutes = overlapMs / (60 * 1000);

                const srcDurationMinutes = (srcEnd - srcStart) / (60 * 1000);
                const tgtDurationMinutes = (tgtEnd - tgtStart) / (60 * 1000);
                const shorterIntervalMinutes = Math.min(srcDurationMinutes, tgtDurationMinutes);
                const requiredOverlapMinutes = Math.min(10, 0.5 * shorterIntervalMinutes);

                userPart.timingRelationship = {
                  startGapMinutes,
                  overlapMinutes
                };

                if (startGapMinutes <= maxStartGapMinutes && overlapMinutes >= requiredOverlapMinutes) {
                  userPart.evidenceState = "inferred";
                  
                  if (startGapMinutes <= 5) {
                    userPart.confidence = 0.85;
                    userPart.reason = `Inferred co-watching: play started within ${Math.round(startGapMinutes)}m of source (Rule: 3.0-overlap-semantics)`;
                  } else if (startGapMinutes <= 10) {
                    userPart.confidence = 0.65;
                    userPart.reason = `Inferred co-watching: play started within ${Math.round(startGapMinutes)}m of source (Rule: 3.0-overlap-semantics)`;
                  } else {
                    userPart.confidence = 0.45;
                    userPart.reason = `Inferred co-watching (low confidence): play started within ${Math.round(startGapMinutes)}m of source (Rule: 3.0-overlap-semantics)`;
                  }
                } else {
                  userPart.reason = `Observed playback at ${play.obs.watchedAt} but does not meet co-watch alignment/overlap criteria (Rule: 3.0-overlap-semantics)`;
                }
              }
            }
          }
        }

        const participants = Array.from(participantsMap.values()).filter(p => 
          p.userId === sourceUserId || ["confirmed", "inferred", "dismissed"].includes(p.evidenceState)
        );
        
        const hasCoWatchers = participants.some(p => 
          p.userId !== sourceUserId && ["confirmed", "inferred"].includes(p.evidenceState)
        );

        if (hasCoWatchers) {
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
            ruleVersion: "3.0-overlap-semantics"
          });
        }
      }
    }

    return events.reverse();
  }
}
