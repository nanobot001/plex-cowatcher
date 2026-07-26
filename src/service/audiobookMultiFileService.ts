import type { ChapterActivationItem } from "./audiobookChapterActivationService.js";
import { parseAudnexusTrackIdentity } from "./audiobookRevisionService.js";

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

export interface FileBoundaryProofItem extends MultiFileTimelineItem {
  title: string | null;
}

export type FileBoundaryProofReason =
  | "READY_FOR_FILE_BOUNDARY_CHAPTER_PROOF"
  | "MULTI_FILE_MANIFEST_INCOMPLETE"
  | "MULTI_FILE_CHAPTER_COUNT_MISMATCH"
  | "MULTI_FILE_DURATION_MISMATCH"
  | "MULTI_FILE_EDITION_IDENTITY_UNPROVEN"
  | "MULTI_FILE_TRACK_SEQUENCE_GAP"
  | "MULTI_FILE_CHAPTER_TITLES_UNSUPPORTED";

export type FileBoundaryProofAssessment =
  | { eligible: true; reason: "READY_FOR_FILE_BOUNDARY_CHAPTER_PROOF"; candidates: MultiFileProofCandidate[] }
  | { eligible: false; reason: Exclude<FileBoundaryProofReason, "READY_FOR_FILE_BOUNDARY_CHAPTER_PROOF"> };

export function assessFileBoundaryChapterProof(input: {
  asin: string | null;
  declaredChapterCount: number | null;
  declaredDurationMs: number | null;
  revisionDurationMs: number | null;
  items: FileBoundaryProofItem[];
}): FileBoundaryProofAssessment {
  const items = [...input.items].sort((left, right) => left.order - right.order);
  if (items.length < 2 || items.some((item) =>
    !item.stableIdentity || !item.guid || !Number.isInteger(Number(item.durationMs)) || Number(item.durationMs) <= 0
  )) {
    return { eligible: false, reason: "MULTI_FILE_MANIFEST_INCOMPLETE" };
  }
  if (!Number.isInteger(Number(input.declaredChapterCount)) ||
      Number(input.declaredChapterCount) !== items.length) {
    return { eligible: false, reason: "MULTI_FILE_CHAPTER_COUNT_MISMATCH" };
  }

  const revisionDurationMs = Number(input.revisionDurationMs);
  const declaredDurationMs = Number(input.declaredDurationMs);
  const itemDurationMs = items.reduce((total, item) => total + Number(item.durationMs), 0);
  if (!Number.isInteger(revisionDurationMs) || revisionDurationMs <= 0 ||
      !Number.isInteger(declaredDurationMs) || declaredDurationMs <= 0 ||
      Math.abs(itemDurationMs - revisionDurationMs) > DURATION_TOLERANCE_MS ||
      Math.abs(itemDurationMs - declaredDurationMs) > DURATION_TOLERANCE_MS) {
    return { eligible: false, reason: "MULTI_FILE_DURATION_MISMATCH" };
  }

  const identities = items.map((item) => parseAudnexusTrackIdentity(item.guid));
  const firstIdentity = identities[0];
  const asin = input.asin?.trim().toUpperCase();
  if (!asin || !firstIdentity || firstIdentity.asin !== asin ||
      identities.some((identity) =>
        !identity || identity.asin !== asin || identity.editionKey !== firstIdentity.editionKey
      )) {
    return { eligible: false, reason: "MULTI_FILE_EDITION_IDENTITY_UNPROVEN" };
  }
  if (identities.some((identity, index) => identity!.trackNumber !== index + 1) ||
      new Set(identities.map((identity) => identity!.trackNumber)).size !== items.length) {
    return { eligible: false, reason: "MULTI_FILE_TRACK_SEQUENCE_GAP" };
  }

  const titles = items.map((item) => item.title?.trim() ?? "");
  if (!isCompleteChapterTitleSequence(titles)) {
    return { eligible: false, reason: "MULTI_FILE_CHAPTER_TITLES_UNSUPPORTED" };
  }
  return {
    eligible: true,
    reason: "READY_FOR_FILE_BOUNDARY_CHAPTER_PROOF",
    candidates: items.map((item) => ({
      chapters: [{
        index: 1,
        title: item.title!,
        start_offset_ms: 0,
        end_offset_ms: Number(item.durationMs)
      }],
      sourceType: "audnexus_track",
      confidence: 1,
      warnings: []
    }))
  };
}

function isCompleteChapterTitleSequence(titles: string[]): boolean {
  if (titles.length < 2 || titles.some((title) => !title)) return false;
  let index = 0;
  if (/^prologue(?::\s+\S.*)?$/i.test(titles[index]!)) index++;
  let chapterNumber = 1;
  let chapterCount = 0;
  while (index < titles.length) {
    const match = /^chapter\s+(\d+)(?::\s+\S.*)?$/i.exec(titles[index]!);
    if (!match) break;
    if (Number(match[1]) !== chapterNumber) return false;
    chapterNumber++;
    chapterCount++;
    index++;
  }
  if (index < titles.length && /^epilogue(?::\s+\S.*)?$/i.test(titles[index]!)) index++;
  return chapterCount > 0 && index === titles.length;
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
