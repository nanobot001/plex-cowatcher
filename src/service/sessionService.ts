import type { Db } from "../db/database.js";
import { QueryService } from "./queryService.js";
import { z } from "zod";

export const sessionParamsSchema = z.object({
  user: z.string(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  timezone: z.string().regex(/^[+-]\d{2}:\d{2}$/, "Invalid timezone format [+-]HH:MM").optional(),
  days: z.preprocess((val) => val ? Number(val) : undefined, z.number().int().positive().optional()),
  inactivityGapHours: z.preprocess((val) => val ? Number(val) : undefined, z.number().positive().default(2))
});

export interface ViewingSession {
  id: string;
  userId: number;
  username: string;
  displayName: string;
  startTime: string;
  endTime: string;
  playbackDurationSeconds: number;
  sessionDurationSeconds: number;
  idleGapSeconds: number;
  participantCount: number;
  observations: any[];
}

export class SessionService {
  private readonly queryService: QueryService;

  constructor(private readonly db: Db) {
    this.queryService = new QueryService(db);
  }

  getViewingSessions(params: unknown): ViewingSession[] {
    const parsed = sessionParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new Error(`Validation Error: ${parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`);
    }

    const { user, dateFrom, dateTo, timezone, days, inactivityGapHours } = parsed.data;

    let fromDate = dateFrom;
    if (days && !dateFrom) {
      const date = new Date();
      date.setDate(date.getDate() - days);
      fromDate = date.toISOString();
    }

    const history = this.queryService.queryHistory({
      user,
      dateFrom: fromDate,
      dateTo,
      timezone,
      limit: 2000
    });

    if (history.length === 0) {
      return [];
    }

    const obsWithIntervals = history.map(obs => {
      const durationSec = obs.duration ?? obs.viewOffset ?? 0;
      const endTime = new Date(obs.watchedAt).getTime();
      const startTime = endTime - durationSec * 1000;
      return {
        obs,
        startTime,
        endTime,
        durationSec
      };
    }).sort((a, b) => a.startTime - b.startTime);

    const sessions: ViewingSession[] = [];
    const inactivityGapMs = inactivityGapHours * 60 * 60 * 1000;

    let currentSessionObs: typeof obsWithIntervals = [];

    for (const item of obsWithIntervals) {
      if (currentSessionObs.length === 0) {
        currentSessionObs.push(item);
        continue;
      }

      const lastItem = currentSessionObs[currentSessionObs.length - 1];
      const gapMs = item.startTime - lastItem.endTime;

      if (gapMs < inactivityGapMs) {
        currentSessionObs.push(item);
      } else {
        sessions.push(this.buildSession(currentSessionObs));
        currentSessionObs = [item];
      }
    }

    if (currentSessionObs.length > 0) {
      sessions.push(this.buildSession(currentSessionObs));
    }

    return sessions.reverse();
  }

  private buildSession(items: Array<{ obs: any; startTime: number; endTime: number; durationSec: number }>): ViewingSession {
    const first = items[0];
    const last = items[items.length - 1];
    
    const startTimeMs = first.startTime;
    const endTimeMs = items.reduce((max, item) => Math.max(max, item.endTime), first.endTime);

    const intervals = items.map(item => ({ start: item.startTime, end: item.endTime }));
    const playbackDurationSeconds = this.calculateMergedDuration(intervals);

    const sessionDurationSeconds = Math.max(0, (endTimeMs - startTimeMs) / 1000);
    const idleGapSeconds = Math.max(0, sessionDurationSeconds - playbackDurationSeconds);

    const firstObs = first.obs;

    return {
      id: `${firstObs.userId}-${startTimeMs}`,
      userId: firstObs.userId,
      username: firstObs.username,
      displayName: firstObs.displayName,
      startTime: new Date(startTimeMs).toISOString(),
      endTime: new Date(endTimeMs).toISOString(),
      playbackDurationSeconds,
      sessionDurationSeconds,
      idleGapSeconds,
      participantCount: 1,
      observations: items.map(i => i.obs)
    };
  }

  private calculateMergedDuration(intervals: Array<{ start: number; end: number }>): number {
    if (intervals.length === 0) return 0;
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }

    return merged.reduce((sum, interval) => sum + (interval.end - interval.start), 0) / 1000;
  }
}
