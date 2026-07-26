import type { ChapterActivationItem } from "./audiobookChapterActivationService.js";

const DURATION_TOLERANCE_MS = 10_000;

export interface MultiFileTimelineItem {
  order: number;
  stableIdentity: string;
  ratingKey?: string | null;
  guid?: string | null;
  durationMs: number | null;
  cumulativeOffsetMs?: number;
}

export interface MultiFileProofCandidate {
  chapters: ChapterActivationItem[];
  sourceType: string;
  confidence: number;
  warnings: string[];
}

export interface GlobalChapterTimeline {
  chapters: ChapterActivationItem[];
  sourceType: string;
  confidence: number;
  warnings: string[];
  durationMs: number;
}

export type MultiFileTimelineFailureCode =
  | "FILE_DURATION_UNKNOWN"
  | "INVALID_FILE_CHAPTERS"
  | "PARTIAL_TIMELINE"
  | "DURATION_MISMATCH";

export type MultiFileTimelineResult =
  | { ok: true; timeline: GlobalChapterTimeline }
  | { ok: false; code: MultiFileTimelineFailureCode };

export function buildGlobalAudiobookTimeline(
  items: MultiFileTimelineItem[],
  candidates: Array<MultiFileProofCandidate | null>
): MultiFileTimelineResult {
  if (items.length === 0 || items.length !== candidates.length) {
    return { ok: false, code: "PARTIAL_TIMELINE" };
  }

  const ordered = [...items].sort((left, right) => left.order - right.order);
  const byOrder = new Map(items.map((item, index) => [item.order, candidates[index] ?? null]));
  const chapters: ChapterActivationItem[] = [];
  const warnings = new Set<string>();
  const sourceTypes = new Set<string>();
  let confidence = 1;
  let cumulativeOffsetMs = 0;

  for (const item of ordered) {
    const durationMs = Number(item.durationMs);
    if (!Number.isInteger(durationMs) || durationMs <= 0) {
      return { ok: false, code: "FILE_DURATION_UNKNOWN" };
    }
    const candidate = byOrder.get(item.order);
    if (!candidate) return { ok: false, code: "PARTIAL_TIMELINE" };
    if (!Array.isArray(candidate.chapters) || candidate.chapters.length === 0) {
      return { ok: false, code: "INVALID_FILE_CHAPTERS" };
    }

    sourceTypes.add(candidate.sourceType);
    confidence = Math.min(confidence, candidate.confidence);
    for (const warning of candidate.warnings) warnings.add(warning);

    let priorEnd = 0;
    for (const chapter of candidate.chapters) {
      if (!Number.isInteger(chapter.start_offset_ms) || !Number.isInteger(chapter.end_offset_ms) ||
          chapter.start_offset_ms < 0 || chapter.end_offset_ms <= chapter.start_offset_ms ||
          chapter.start_offset_ms < priorEnd || chapter.end_offset_ms > durationMs) {
        return { ok: false, code: "INVALID_FILE_CHAPTERS" };
      }
      chapters.push({
        index: chapters.length + 1,
        title: chapter.title,
        start_offset_ms: cumulativeOffsetMs + chapter.start_offset_ms,
        end_offset_ms: cumulativeOffsetMs + chapter.end_offset_ms
      });
      priorEnd = chapter.end_offset_ms;
    }
    if (Math.abs(priorEnd - durationMs) > DURATION_TOLERANCE_MS) {
      return { ok: false, code: "DURATION_MISMATCH" };
    }
    cumulativeOffsetMs += durationMs;
  }

  if (chapters.length < 2 || chapters[0]?.start_offset_ms !== 0 ||
      Math.abs((chapters.at(-1)?.end_offset_ms ?? 0) - cumulativeOffsetMs) > DURATION_TOLERANCE_MS) {
    return { ok: false, code: "DURATION_MISMATCH" };
  }

  return {
    ok: true,
    timeline: {
      chapters,
      sourceType: sourceTypes.size === 1 ? `multi_file_${[...sourceTypes][0]}` : "multi_file_mixed",
      confidence,
      warnings: [...warnings],
      durationMs: cumulativeOffsetMs
    }
  };
}

export function addCumulativeOffsets(items: MultiFileTimelineItem[]): MultiFileTimelineItem[] {
  let cumulativeOffsetMs = 0;
  return [...items]
    .sort((left, right) => left.order - right.order)
    .map((item) => {
      const result = { ...item, cumulativeOffsetMs };
      cumulativeOffsetMs += Number(item.durationMs ?? 0);
      return result;
    });
}

export type MultiFilePlaybackMapping =
  | { status: "mapped"; globalOffsetMs: number; itemOrder: number }
  | { status: "unmapped"; reason: "FILE_IDENTITY_UNKNOWN" | "OFFSET_UNKNOWN" | "OFFSET_INVALID" };

export function mapMultiFilePlaybackOffset(
  play: { ratingKey?: string; plexGuid?: string; viewOffset?: number; duration?: number; percentComplete?: number; completed?: boolean },
  items: MultiFileTimelineItem[]
): MultiFilePlaybackMapping {
  const ordered = addCumulativeOffsets(items);
  const item = ordered.find((candidate) =>
    (play.ratingKey && candidate.ratingKey === play.ratingKey) ||
    (play.plexGuid && candidate.guid === play.plexGuid) ||
    (play.plexGuid && candidate.stableIdentity === `guid:${play.plexGuid}`)
  );
  if (!item || item.durationMs == null) return { status: "unmapped", reason: "FILE_IDENTITY_UNKNOWN" };

  const durationMs = Number(item.durationMs);
  const rawOffset = Number(play.viewOffset ?? 0);
  let localOffsetMs = rawOffset;
  const observedDuration = Number(play.duration ?? 0);
  const durationLooksLikeSeconds = observedDuration > 0 &&
    Math.abs(observedDuration * 1000 - durationMs) <= DURATION_TOLERANCE_MS;
  const durationLooksLikeMilliseconds = observedDuration > 0 &&
    Math.abs(observedDuration - durationMs) <= DURATION_TOLERANCE_MS;
  if (localOffsetMs > 0 && (durationLooksLikeSeconds ||
      (!durationLooksLikeMilliseconds && localOffsetMs <= durationMs / 1000 * 1.05))) {
    localOffsetMs *= 1000;
  } else if (localOffsetMs > 0 && localOffsetMs <= durationMs * 1.05) {
    // Some callers persist this field in milliseconds.
  } else if (localOffsetMs > 0 && localOffsetMs * 1000 <= durationMs * 1.05) {
    localOffsetMs *= 1000;
  } else if (play.percentComplete != null && Number.isFinite(Number(play.percentComplete))) {
    localOffsetMs = durationMs * Math.max(0, Math.min(100, Number(play.percentComplete))) / 100;
  } else if (play.completed) {
    localOffsetMs = durationMs;
  } else {
    return { status: "unmapped", reason: rawOffset > 0 ? "OFFSET_INVALID" : "OFFSET_UNKNOWN" };
  }

  if (!Number.isFinite(localOffsetMs) || localOffsetMs < 0 || localOffsetMs > durationMs * 1.05) {
    return { status: "unmapped", reason: "OFFSET_INVALID" };
  }
  return {
    status: "mapped",
    globalOffsetMs: Number(item.cumulativeOffsetMs ?? 0) + Math.min(localOffsetMs, durationMs),
    itemOrder: item.order
  };
}
