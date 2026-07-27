import type {
  AudiobookProgressEvidenceSource,
  AudiobookProgressQuality,
  AudiobookProgressQualityReason,
  DashboardActivityItem
} from "../types/api.js";
import {
  addCumulativeOffsets,
  mapMultiFilePlaybackOffset,
  type MultiFileTimelineItem
} from "./audiobookMultiFileService.js";

const DURATION_CORROBORATION_PERCENT_POINTS = 2.5;
const STALE_PERCENT_DELTA_POINTS = 1.25;
const POSITION_DURATION_TOLERANCE = 1.05;

export type AudiobookPositionEvidence = {
  status: "position" | "uncertain" | "unavailable";
  offsetMs: number | null;
  progressPercent: number | null;
  quality: AudiobookProgressQuality;
  source: AudiobookProgressEvidenceSource;
  reason: AudiobookProgressQualityReason;
};

function boundedPercent(value: unknown): number | null {
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
}

function offsetPercent(offsetMs: number, bookDurationMs: number): number {
  return Math.max(0, Math.min(100, Math.round((offsetMs / bookDurationMs) * 100)));
}

function normalizeSingleFileViewOffset(rawValue: unknown, bookDurationMs: number): number | null {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw) || raw <= 0 || bookDurationMs <= 0) return null;
  if (raw <= bookDurationMs / 1000 * POSITION_DURATION_TOLERANCE) {
    return Math.min(raw * 1000, bookDurationMs);
  }
  if (raw <= bookDurationMs * POSITION_DURATION_TOLERANCE) {
    return Math.min(raw, bookDurationMs);
  }
  return null;
}

function normalizeGroupedPlayDurationPosition(
  rawValue: unknown,
  bookDurationMs: number,
  sourcePercent: number | null
): number | null {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw) || raw <= 0 || bookDurationMs <= 0) return null;
  const candidates = [...new Set([raw * 1000, raw])]
    .filter((candidate) => candidate > 0 && candidate <= bookDurationMs * POSITION_DURATION_TOLERANCE);
  if (!candidates.length) return null;
  if (sourcePercent == null) return Math.min(candidates[0], bookDurationMs);
  const expectedOffset = bookDurationMs * sourcePercent / 100;
  return Math.min(
    candidates.sort((left, right) => Math.abs(left - expectedOffset) - Math.abs(right - expectedOffset))[0],
    bookDurationMs
  );
}

function normalizeMultiFileViewOffset(
  play: DashboardActivityItem,
  manifestItems: MultiFileTimelineItem[]
): number | null {
  const raw = Number(play.viewOffset);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const item = addCumulativeOffsets(manifestItems).find((candidate) =>
    candidate.ratingKey === play.ratingKey ||
    (play.plexGuid && candidate.guid === play.plexGuid) ||
    (play.plexGuid && candidate.stableIdentity === `guid:${play.plexGuid}`)
  );
  const itemDurationMs = Number(item?.durationMs ?? 0);
  if (!item || !Number.isFinite(itemDurationMs) || itemDurationMs <= 0) return null;
  const localOffsetMs = raw <= itemDurationMs / 1000 * POSITION_DURATION_TOLERANCE
    ? raw * 1000
    : raw <= itemDurationMs * POSITION_DURATION_TOLERANCE
      ? raw
      : NaN;
  if (!Number.isFinite(localOffsetMs)) return null;
  const mapped = mapMultiFilePlaybackOffset({
    ratingKey: play.ratingKey,
    plexGuid: play.plexGuid,
    viewOffset: localOffsetMs,
    duration: itemDurationMs
  }, manifestItems);
  return mapped.status === "mapped" ? mapped.globalOffsetMs : null;
}

function verifiedEvidence(
  offsetMs: number,
  bookDurationMs: number,
  source: "view_offset" | "completion",
  quality: "verified_position" | "verified_completion",
  reason: "VIEW_OFFSET_VALID" | "COMPLETION_EVIDENCE"
): AudiobookPositionEvidence {
  return {
    status: "position",
    offsetMs,
    progressPercent: offsetPercent(offsetMs, bookDurationMs),
    quality,
    source,
    reason
  };
}

/**
 * Resolve audiobook position evidence without mutating or normalizing the raw
 * observation. Tautulli grouped history exposes cumulative `play_duration`;
 * rising high-water values are accepted as approximate positions when at
 * least one source percentage corroborates them. Lower reset rows remain
 * uncertain and never reduce the established position.
 */
export function resolveAudiobookPositionEvidence(
  plays: DashboardActivityItem[],
  bookDurationMs: number,
  manifestItems: MultiFileTimelineItem[] = []
): Map<number, AudiobookPositionEvidence> {
  const resolved = new Map<number, AudiobookPositionEvidence>();
  const ordered = [...plays].sort((left, right) =>
    left.watchedAt.localeCompare(right.watchedAt) || left.id - right.id
  );

  for (const play of ordered) {
    const viewOffset = manifestItems.length > 1
      ? normalizeMultiFileViewOffset(play, manifestItems)
      : normalizeSingleFileViewOffset(play.viewOffset, bookDurationMs);
    if (viewOffset != null) {
      resolved.set(play.id, verifiedEvidence(
        viewOffset,
        bookDurationMs,
        "view_offset",
        "verified_position",
        "VIEW_OFFSET_VALID"
      ));
      continue;
    }

    if (play.completed && bookDurationMs > 0) {
      if (manifestItems.length > 1) {
        const mapped = mapMultiFilePlaybackOffset({
          ratingKey: play.ratingKey,
          plexGuid: play.plexGuid,
          completed: true
        }, manifestItems);
        if (mapped.status === "mapped") {
          resolved.set(play.id, verifiedEvidence(
            mapped.globalOffsetMs,
            bookDurationMs,
            "completion",
            "verified_completion",
            "COMPLETION_EVIDENCE"
          ));
          continue;
        }
      } else {
        resolved.set(play.id, verifiedEvidence(
          bookDurationMs,
          bookDurationMs,
          "completion",
          "verified_completion",
          "COMPLETION_EVIDENCE"
        ));
        continue;
      }
    }
  }

  const byRatingKey = new Map<string, DashboardActivityItem[]>();
  for (const play of ordered.filter((candidate) => !resolved.has(candidate.id))) {
    const evidenceSeriesKey = `${play.userId}:${play.ratingKey}`;
    const rows = byRatingKey.get(evidenceSeriesKey) ?? [];
    rows.push(play);
    byRatingKey.set(evidenceSeriesKey, rows);
  }

  for (const rows of byRatingKey.values()) {
    const durationCandidates = rows.map((play) => {
      const sourcePercent = boundedPercent(play.percentComplete);
      return {
        play,
        sourcePercent,
        offsetMs: manifestItems.length > 1
          ? null
          : normalizeGroupedPlayDurationPosition(play.duration, bookDurationMs, sourcePercent),
        isHighWater: false
      };
    });
    let highWaterOffsetMs = 0;
    for (const candidate of durationCandidates) {
      if (candidate.offsetMs != null && candidate.offsetMs >= highWaterOffsetMs) {
        candidate.isHighWater = true;
        highWaterOffsetMs = candidate.offsetMs;
      }
    }
    const corroborated = durationCandidates.some((candidate) =>
      candidate.isHighWater &&
      candidate.offsetMs != null &&
      candidate.sourcePercent != null &&
      Math.abs(candidate.offsetMs / bookDurationMs * 100 - candidate.sourcePercent) <= DURATION_CORROBORATION_PERCENT_POINTS
    );

    for (const candidate of durationCandidates) {
      const { play, sourcePercent, offsetMs, isHighWater } = candidate;
      if (offsetMs != null && isHighWater && corroborated) {
        const derivedPercent = offsetMs / bookDurationMs * 100;
        const stale = sourcePercent != null &&
          Math.abs(derivedPercent - sourcePercent) > STALE_PERCENT_DELTA_POINTS;
        resolved.set(play.id, {
          status: "position",
          offsetMs,
          progressPercent: offsetPercent(offsetMs, bookDurationMs),
          quality: stale ? "stale_progress" : "approximate_position",
          source: "play_duration",
          reason: stale ? "PERCENT_STALE_AGAINST_PLAY_DURATION" : "PLAY_DURATION_CORROBORATED"
        });
        continue;
      }
      if (sourcePercent != null) {
        resolved.set(play.id, {
          status: "uncertain",
          offsetMs: null,
          progressPercent: Math.round(sourcePercent),
          quality: "approximate_position",
          source: "percent_complete",
          reason: "PERCENT_ONLY"
        });
        continue;
      }
      const hasInvalidPositionField = play.viewOffset != null || play.duration != null || play.percentComplete != null;
      resolved.set(play.id, {
        status: "unavailable",
        offsetMs: null,
        progressPercent: null,
        quality: "unavailable",
        source: "none",
        reason: hasInvalidPositionField ? "POSITION_FIELDS_INVALID" : "POSITION_UNAVAILABLE"
      });
    }
  }

  return resolved;
}
