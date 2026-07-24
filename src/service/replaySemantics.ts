export const REPLAY_INACTIVITY_GAP_MS = 2 * 60 * 60 * 1000;
export const REPLAY_RESET_THRESHOLD_PERCENTAGE_POINTS = 20;

export type ReplayReason =
  | "different_viewing_day"
  | "same_day_completed_sessions"
  | "same_day_offset_reset";

export interface ReplayObservation {
  observedAt: string;
  localDate: string;
  completed: boolean;
  progressPercent?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  source?: "detailed_playback" | "historical_last_view" | "point_completed_play";
}

export interface ReplaySemantics {
  observationCount: number;
  sessionCount: number;
  viewingDayCount: number;
  replayCount: number;
  replayReason: ReplayReason | null;
  latestObservedAt: string | null;
}

type ReplaySession = {
  startMs: number;
  endMs: number;
  localDates: Set<string>;
  completed: boolean;
  minProgress: number | null;
  maxProgress: number | null;
};

function boundedProgress(value: number | null | undefined): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function observationInterval(observation: ReplayObservation) {
  const observedMs = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedMs)) return null;
  const explicitStart = observation.startedAt ? Date.parse(observation.startedAt) : Number.NaN;
  const explicitEnd = observation.endedAt ? Date.parse(observation.endedAt) : Number.NaN;
  const startMs = Number.isFinite(explicitStart) ? explicitStart : observedMs;
  const endMs = Number.isFinite(explicitEnd) ? explicitEnd : observedMs;
  return {
    observation,
    startMs: Math.min(startMs, endMs),
    endMs: Math.max(startMs, endMs),
    progress: boundedProgress(observation.progressPercent)
  };
}

function addObservation(session: ReplaySession, observation: ReplayObservation, progress: number | null, endMs: number) {
  session.endMs = Math.max(session.endMs, endMs);
  if (observation.localDate) session.localDates.add(observation.localDate);
  if (observation.completed) session.completed = true;
  if (progress != null) {
    session.minProgress = session.minProgress == null ? progress : Math.min(session.minProgress, progress);
    session.maxProgress = session.maxProgress == null ? progress : Math.max(session.maxProgress, progress);
  }
}

function reconstructSessions(observations: ReplayObservation[], inactivityGapMs: number): ReplaySession[] {
  const intervals = observations
    .map(observationInterval)
    .filter((item): item is NonNullable<ReturnType<typeof observationInterval>> => item !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const sessions: ReplaySession[] = [];

  for (const item of intervals) {
    const current = sessions[sessions.length - 1];
    if (current && item.startMs - current.endMs < inactivityGapMs) {
      addObservation(current, item.observation, item.progress, item.endMs);
      continue;
    }
    const session: ReplaySession = {
      startMs: item.startMs,
      endMs: item.endMs,
      localDates: new Set<string>(),
      completed: false,
      minProgress: null,
      maxProgress: null
    };
    addObservation(session, item.observation, item.progress, item.endMs);
    sessions.push(session);
  }
  return sessions;
}

function sessionDate(session: ReplaySession): string | null {
  const dates = [...session.localDates].sort();
  return dates[dates.length - 1] ?? null;
}

function hasMeaningfulReset(previous: ReplaySession, current: ReplaySession, threshold: number): boolean {
  return previous.maxProgress != null
    && current.minProgress != null
    && previous.maxProgress - current.minProgress >= threshold;
}

export function evaluateReplaySemantics(
  observations: ReplayObservation[],
  options: { inactivityGapMs?: number; resetThresholdPercentagePoints?: number } = {}
): ReplaySemantics {
  const inactivityGapMs = options.inactivityGapMs ?? REPLAY_INACTIVITY_GAP_MS;
  const resetThreshold = options.resetThresholdPercentagePoints ?? REPLAY_RESET_THRESHOLD_PERCENTAGE_POINTS;
  const detailedObservations = observations.filter((observation) => observation.source !== "historical_last_view" && observation.source !== "point_completed_play");
  const pointPlayDates = new Set(observations
    .filter((observation) => observation.source === "point_completed_play" && observation.completed)
    .map((observation) => observation.localDate)
    .filter(Boolean));
  const sessions = reconstructSessions(detailedObservations, inactivityGapMs);
  const completedSessions = sessions.filter(session => session.completed);
  let replayCount = 0;
  let replayReason: ReplayReason | null = null;

  for (let index = 1; index < completedSessions.length; index += 1) {
    const previous = completedSessions[index - 1];
    const current = completedSessions[index];
    replayCount += 1;
    if (sessionDate(previous) !== sessionDate(current)) {
      replayReason = "different_viewing_day";
    } else if (hasMeaningfulReset(previous, current, resetThreshold)) {
      replayReason = "same_day_offset_reset";
    } else {
      replayReason = "same_day_completed_sessions";
    }
  }

  const completedSessionDates = new Set(completedSessions.map(sessionDate).filter((value): value is string => Boolean(value)));
  const additionalPointDates = [...pointPlayDates].filter((date) => !completedSessionDates.has(date)).length;
  if (additionalPointDates > 0) {
    const completedEvidenceCount = completedSessions.length + additionalPointDates;
    const conservativeReplayCount = Math.max(0, completedEvidenceCount - 1);
    if (conservativeReplayCount > replayCount) {
      replayCount = conservativeReplayCount;
      replayReason = "different_viewing_day";
    }
  }

  const validObservedAt = observations
    .map(observation => observation.observedAt)
    .filter(value => Number.isFinite(Date.parse(value)))
    .sort();
  const viewingDays = new Set(observations.map(observation => observation.localDate).filter(Boolean));

  return {
    observationCount: observations.length,
    sessionCount: sessions.length,
    viewingDayCount: viewingDays.size,
    replayCount,
    replayReason,
    latestObservedAt: validObservedAt[validObservedAt.length - 1] ?? null
  };
}
