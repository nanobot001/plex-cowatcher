import type { Db } from "../db/database.js";
import { QueryService } from "./queryService.js";
import { MetadataService } from "./metadataService.js";
import { z } from "zod";

export const summaryParamsSchema = z.object({
  user: z.string(),
  showRatingKey: z.string().optional(),
  localDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD").optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  timezone: z.string().regex(/^[+-]\d{2}:\d{2}$/, "Invalid timezone format [+-]HH:MM").optional(),
  days: z.preprocess((val) => val ? Number(val) : undefined, z.number().int().positive().optional())
});

export type SummaryParams = z.infer<typeof summaryParamsSchema>;

export class SummaryService {
  private readonly queryService: QueryService;
  private readonly metadataService: MetadataService;

  constructor(private readonly db: Db, plexAdapter: any) {
    this.queryService = new QueryService(db);
    this.metadataService = new MetadataService(db, plexAdapter);
  }

  getWatchSummary(params: unknown) {
    const parsed = summaryParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new Error(`Validation Error: ${parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`);
    }

    const { user, showRatingKey, localDay, dateFrom, dateTo, timezone, days } = parsed.data;

    let fromDate = dateFrom;
    if (days && !localDay && !dateFrom) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      fromDate = date.toISOString();
    }

    const history = this.queryService.queryHistory({
      user,
      showRatingKey,
      localDay,
      dateFrom: fromDate,
      dateTo,
      timezone,
      limit: 1000
    });

    if (history.length === 0) {
      return {
        user,
        totalPlaybackTimeSeconds: 0,
        shows: [],
        movies: []
      };
    }

    const showGroups = new Map<string, any[]>();
    const movieGroups = new Map<string, any[]>();
    let totalPlaybackTimeSeconds = 0;

    for (const item of history) {
      const durationSec = item.duration ?? 0;
      totalPlaybackTimeSeconds += durationSec;

      if (item.mediaType === "episode" && item.grandparentRatingKey) {
        const key = item.grandparentRatingKey;
        if (!showGroups.has(key)) showGroups.set(key, []);
        showGroups.get(key)!.push(item);
      } else if (item.mediaType === "movie") {
        const key = item.ratingKey;
        if (!movieGroups.has(key)) movieGroups.set(key, []);
        movieGroups.get(key)!.push(item);
      }
    }

    const shows = Array.from(showGroups.entries()).map(([showKey, observations]) => {
      const cachedShow = this.metadataService.getCached(showKey);
      const totalEpisodes = cachedShow?.leafCount ?? null;

      const episodePlaysMap = new Map<string, any[]>();
      for (const obs of observations) {
        if (!episodePlaysMap.has(obs.ratingKey)) episodePlaysMap.set(obs.ratingKey, []);
        episodePlaysMap.get(obs.ratingKey)!.push(obs);
      }

      const distinctEpisodesCount = episodePlaysMap.size;
      const completedEpisodesCount = Array.from(episodePlaysMap.values()).filter(plays => 
        plays.some(p => p.completed)
      ).length;

      const playbackTimeSeconds = observations.reduce((sum, obs) => sum + (obs.duration ?? 0), 0);
      const latestPlay = observations[0];

      const progressPercent = (totalEpisodes && totalEpisodes > 0)
        ? Math.min(100, Math.round((completedEpisodesCount / totalEpisodes) * 100))
        : null;

      return {
        showTitle: latestPlay.showTitle ?? "Unknown Show",
        grandparentRatingKey: showKey,
        totalPlaybackTimeSeconds: playbackTimeSeconds,
        distinctEpisodesWatched: distinctEpisodesCount,
        completedEpisodesWatched: completedEpisodesCount,
        totalAvailableEpisodes: totalEpisodes,
        progressPercent,
        latestWatch: {
          title: latestPlay.title,
          seasonNumber: latestPlay.seasonNumber,
          episodeNumber: latestPlay.episodeNumber,
          watchedAt: latestPlay.watchedAt,
          percentComplete: latestPlay.percentComplete,
          completed: latestPlay.completed
        }
      };
    });

    const movies = Array.from(movieGroups.entries()).map(([movieKey, observations]) => {
      const playbackTimeSeconds = observations.reduce((sum, obs) => sum + (obs.duration ?? 0), 0);
      const latestPlay = observations[0];
      const completedCount = observations.filter(obs => obs.completed).length;

      return {
        title: latestPlay.title,
        ratingKey: movieKey,
        totalPlaybackTimeSeconds: playbackTimeSeconds,
        watchCount: observations.length,
        completedCount,
        latestWatch: {
          watchedAt: latestPlay.watchedAt,
          percentComplete: latestPlay.percentComplete,
          completed: latestPlay.completed
        }
      };
    });

    return {
      user,
      totalPlaybackTimeSeconds,
      shows,
      movies
    };
  }
}
