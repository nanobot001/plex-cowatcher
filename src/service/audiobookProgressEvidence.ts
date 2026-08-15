import type {
  AudiobookProgressEvidenceSource,
  AudiobookProgressQuality,
  AudiobookProgressQualityReason,
} from "../types/api.js";
import {
  addCumulativeOffsets,
  mapMultiFilePlaybackOffset,
  type MultiFileTimelineItem
} from "./audiobookMultiFileService.js";

const DURATION_CORROBORATION_PERCENT_POINTS = 2.5;
const STALE_PERCENT_DELTA_POINTS = 1.25;
const POSITION_DURATION_TOLERANCE = 1.05;
const SESSION_GAP_MS = 45 * 60 * 1000;
const DEFAULT_EVALUATED_AT = "1970-01-01T00:00:00.000Z";

export interface AudiobookPositionObservation {
  id: number;
  userId: number;
  ratingKey: string;
  plexGuid?: string | null;
  watchedAt: string;
  duration?: number | null;
  viewOffset?: number | null;
  percentComplete?: number | null;
  completed: boolean;
}

export interface AudiobookProgressObservation extends AudiobookPositionObservation {
  sessionId?: string | null;
  sessionStartAt?: string | null;
  sessionEndAt?: string | null;
  mediaRevision?: string | null;
  chapterRevision?: string | null;
}

export type AudiobookPositionEvidence = {
  status: "position" | "uncertain" | "unavailable";
  offsetMs: number | null;
  progressPercent: number | null;
  quality: AudiobookProgressQuality;
  source: AudiobookProgressEvidenceSource;
  reason: AudiobookProgressQualityReason;
};

export type AudiobookCanonicalChapterState =
  | "in_progress"
  | "revisiting"
  | "passed"
  | "probably_passed"
  | "explicitly_completed"
  | "unknown";

export type AudiobookCanonicalMovement =
  | "none"
  | "forward"
  | "rewind"
  | "revisit"
  | "stale"
  | "unknown";

export type AudiobookCanonicalDirection = "forward" | "backward" | "stationary" | "unknown";

export interface AudiobookChapterTimelineItem {
  chapterIndex: number;
  title: string;
  startOffsetMs: number;
  endOffsetMs: number;
}

export interface AudiobookEvidenceMetadata {
  quality: AudiobookProgressQuality;
  source: AudiobookProgressEvidenceSource;
  reason: AudiobookProgressQualityReason;
  evaluatedAt: string;
  mediaRevision: string | null;
  chapterRevision: string | null;
}

export interface AudiobookCanonicalPosition {
  offsetMs: number | null;
  progressPercent: number | null;
  chapterIndex: number | null;
  evidenceKind: "exact" | "approximate" | "uncertain";
  evidence: AudiobookEvidenceMetadata;
}

export interface AudiobookCanonicalChapter {
  chapterIndex: number;
  title: string;
  startOffsetMs: number;
  endOffsetMs: number;
  state: AudiobookCanonicalChapterState;
  progressPercent: number | null;
  evidence: AudiobookEvidenceMetadata;
}

export interface AudiobookCanonicalSessionMovement {
  sessionKey: string;
  startAt: string;
  endAt: string;
  itemCount: number;
  durationMs: number | null;
  startPositionMs: number | null;
  endPositionMs: number | null;
  direction: AudiobookCanonicalDirection;
  revisitDetected: boolean;
  quality: AudiobookProgressQuality;
  source: AudiobookProgressEvidenceSource;
  reason: AudiobookProgressQualityReason;
  evaluatedAt: string;
  mediaRevision: string | null;
  chapterRevision: string | null;
}

export type AudiobookProgressObservationStatus =
  | "accepted"
  | "duplicate"
  | "out_of_scope"
  | "revision_mismatch"
  | "stale_reset"
  | "unknown";

export interface AudiobookProgressObservationDiagnostic {
  id: number;
  observedAt: string;
  status: AudiobookProgressObservationStatus;
  outOfOrder: boolean;
  reason: AudiobookProgressQualityReason;
}

export interface AudiobookListeningTimeEvidence {
  quality: "validated" | "unknown";
  source: "session_duration" | "none";
  reason: "SESSION_DURATION_VALIDATED" | "SESSION_DURATION_UNAVAILABLE";
  evaluatedAt: string;
  mediaRevision: string | null;
  chapterRevision: string | null;
}

export interface AudiobookCanonicalProgressSnapshot {
  listenerId: number | null;
  evaluatedAt: string;
  mediaRevision: string | null;
  chapterRevision: string | null;
  currentPosition: AudiobookCanonicalPosition | null;
  furthestPosition: AudiobookCanonicalPosition | null;
  latestMovement: AudiobookCanonicalMovement;
  latestDirection: AudiobookCanonicalDirection;
  rewindDetected: boolean;
  revisitDetected: boolean;
  listeningTimeMs: number;
  listeningTimeEvidence: AudiobookListeningTimeEvidence;
  sessions: AudiobookCanonicalSessionMovement[];
  chapters: AudiobookCanonicalChapter[];
  diagnostics: AudiobookProgressObservationDiagnostic[];
}

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
  play: AudiobookPositionObservation,
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
    plexGuid: play.plexGuid ?? undefined,
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
  plays: AudiobookPositionObservation[],
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
          plexGuid: play.plexGuid ?? undefined,
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

  const byRatingKey = new Map<string, AudiobookPositionObservation[]>();
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

type CanonicalCandidate = {
  observation: AudiobookProgressObservation;
  evidence: AudiobookPositionEvidence;
  offsetMs: number | null;
  exact: boolean;
  approximate: boolean;
  diagnostic: AudiobookProgressObservationDiagnostic;
};

function normalizedRevision(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeListeningDurationMs(value: number | null | undefined): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 100_000 ? numeric : numeric * 1000;
}

function isExactEvidence(evidence: AudiobookPositionEvidence): boolean {
  return evidence.status === "position" &&
    (evidence.quality === "verified_position" || evidence.quality === "verified_completion") &&
    evidence.offsetMs != null;
}

function isApproximateEvidence(evidence: AudiobookPositionEvidence): boolean {
  return evidence.status === "position" &&
    (evidence.quality === "approximate_position" || evidence.quality === "stale_progress") &&
    evidence.offsetMs != null;
}

function chapterForOffset(
  chapters: AudiobookChapterTimelineItem[],
  offsetMs: number
): AudiobookChapterTimelineItem | null {
  return chapters.find((chapter) => offsetMs >= chapter.startOffsetMs && offsetMs < chapter.endOffsetMs) ??
    (chapters.length > 0 && offsetMs >= chapters[chapters.length - 1]!.endOffsetMs
      ? chapters[chapters.length - 1]!
      : null);
}

function chapterProgressPercent(chapter: AudiobookChapterTimelineItem, offsetMs: number): number {
  const durationMs = chapter.endOffsetMs - chapter.startOffsetMs;
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((offsetMs - chapter.startOffsetMs) / durationMs) * 100)));
}

function metadataFromEvidence(
  evidence: AudiobookPositionEvidence,
  evaluatedAt: string,
  mediaRevision: string | null,
  chapterRevision: string | null
): AudiobookEvidenceMetadata {
  return {
    quality: evidence.quality,
    source: evidence.source,
    reason: evidence.reason,
    evaluatedAt,
    mediaRevision,
    chapterRevision
  };
}

function unavailableMetadata(
  reason: AudiobookProgressQualityReason,
  evaluatedAt: string,
  mediaRevision: string | null,
  chapterRevision: string | null
): AudiobookEvidenceMetadata {
  return {
    quality: "unavailable",
    source: "none",
    reason,
    evaluatedAt,
    mediaRevision,
    chapterRevision
  };
}

function canonicalPosition(
  candidate: CanonicalCandidate,
  chapters: AudiobookChapterTimelineItem[],
  evaluatedAt: string,
  mediaRevision: string | null,
  chapterRevision: string | null
): AudiobookCanonicalPosition {
  const chapter = candidate.offsetMs == null ? null : chapterForOffset(chapters, candidate.offsetMs);
  return {
    offsetMs: candidate.offsetMs,
    progressPercent: candidate.evidence.progressPercent,
    chapterIndex: chapter?.chapterIndex ?? null,
    evidenceKind: candidate.exact ? "exact" : candidate.approximate ? "approximate" : "uncertain",
    evidence: metadataFromEvidence(candidate.evidence, evaluatedAt, mediaRevision, chapterRevision)
  };
}

function revisionMatches(
  observation: AudiobookProgressObservation,
  mediaRevision: string | null,
  chapterRevision: string | null
): boolean {
  return (mediaRevision == null || normalizedRevision(observation.mediaRevision) === mediaRevision) &&
    (chapterRevision == null || normalizedRevision(observation.chapterRevision) === chapterRevision);
}

/**
 * Evaluate one listener's audiobook observations into the canonical 6H
 * snapshot. The input observations are treated as immutable source evidence;
 * all ordering, deduplication, and movement decisions live in the returned
 * snapshot and diagnostics.
 */
export function evaluateAudiobookProgressTimeline(
  input: {
    listenerId: number | null;
    observations: AudiobookProgressObservation[];
    bookDurationMs: number;
    chapters: AudiobookChapterTimelineItem[];
    asOfAt?: string;
    mediaRevision?: string | null;
    chapterRevision?: string | null;
    manifestItems?: MultiFileTimelineItem[];
  }
): AudiobookCanonicalProgressSnapshot {
  const mediaRevision = normalizedRevision(input.mediaRevision);
  const chapterRevision = normalizedRevision(input.chapterRevision);
  const inputObservations = [...input.observations];
  const observedAtValues = inputObservations.map((observation) => observation.watchedAt).filter(Boolean).sort();
  const evaluatedAt = input.asOfAt ?? observedAtValues.at(-1) ?? DEFAULT_EVALUATED_AT;
  const bookDurationMs = Number.isFinite(Number(input.bookDurationMs)) && Number(input.bookDurationMs) > 0
    ? Number(input.bookDurationMs)
    : Math.max(...input.chapters.map((chapter) => Number(chapter.endOffsetMs)).filter(Number.isFinite), 0);
  const chapters = [...input.chapters]
    .filter((chapter) => Number.isInteger(chapter.chapterIndex) &&
      Number.isFinite(chapter.startOffsetMs) && Number.isFinite(chapter.endOffsetMs) &&
      chapter.startOffsetMs >= 0 && chapter.endOffsetMs > chapter.startOffsetMs)
    .sort((left, right) => left.chapterIndex - right.chapterIndex || left.startOffsetMs - right.startOffsetMs);

  const diagnostics: AudiobookProgressObservationDiagnostic[] = [];
  const outOfOrderIds = new Set<number>();
  let highestInputObservedAt: string | null = null;
  for (const observation of inputObservations) {
    if (highestInputObservedAt != null && observation.watchedAt < highestInputObservedAt) {
      outOfOrderIds.add(observation.id);
    }
    if (highestInputObservedAt == null || observation.watchedAt > highestInputObservedAt) {
      highestInputObservedAt = observation.watchedAt;
    }
  }

  const orderedInput = inputObservations
    .map((observation, inputIndex) => ({ observation, inputIndex }))
    .sort((left, right) => left.observation.watchedAt.localeCompare(right.observation.watchedAt) ||
      left.observation.id - right.observation.id || left.inputIndex - right.inputIndex);
  const seenIds = new Set<number>();
  const seenFingerprints = new Set<string>();
  const eligible: Array<{ observation: AudiobookProgressObservation; diagnostic: AudiobookProgressObservationDiagnostic }> = [];

  for (const { observation } of orderedInput) {
    const outOfOrder = outOfOrderIds.has(observation.id);
    const diagnostic: AudiobookProgressObservationDiagnostic = {
      id: observation.id,
      observedAt: observation.watchedAt,
      status: "accepted",
      outOfOrder,
      reason: "POSITION_UNAVAILABLE"
    };
    diagnostics.push(diagnostic);
    if (observation.watchedAt > evaluatedAt) {
      diagnostic.status = "out_of_scope";
      diagnostic.reason = "OBSERVATION_AFTER_AS_OF";
      continue;
    }
    if (!revisionMatches(observation, mediaRevision, chapterRevision)) {
      diagnostic.status = "revision_mismatch";
      diagnostic.reason = "REVISION_MISMATCH";
      continue;
    }
    const fingerprint = JSON.stringify([
      observation.userId,
      observation.ratingKey,
      observation.plexGuid ?? null,
      observation.watchedAt,
      observation.duration ?? null,
      observation.viewOffset ?? null,
      observation.percentComplete ?? null,
      observation.completed
    ]);
    if (seenIds.has(observation.id) || seenFingerprints.has(fingerprint)) {
      diagnostic.status = "duplicate";
      diagnostic.reason = "DUPLICATE_OBSERVATION";
      continue;
    }
    seenIds.add(observation.id);
    seenFingerprints.add(fingerprint);
    eligible.push({ observation, diagnostic });
  }

  const compatibleObservations = eligible.map((entry) => entry.observation);
  const resolved = bookDurationMs > 0
    ? resolveAudiobookPositionEvidence(compatibleObservations, bookDurationMs, input.manifestItems ?? [])
    : new Map<number, AudiobookPositionEvidence>();
  const candidates: CanonicalCandidate[] = eligible.map(({ observation, diagnostic }) => {
    const evidence = resolved.get(observation.id) ?? {
      status: "unavailable",
      offsetMs: null,
      progressPercent: null,
      quality: "unavailable",
      source: "none",
      reason: "POSITION_UNAVAILABLE"
    } satisfies AudiobookPositionEvidence;
    diagnostic.reason = evidence.reason;
    if (evidence.status === "unavailable") diagnostic.status = "unknown";
    return {
      observation,
      evidence,
      offsetMs: evidence.status === "position" ? evidence.offsetMs : null,
      exact: isExactEvidence(evidence),
      approximate: isApproximateEvidence(evidence),
      diagnostic
    };
  });

  let currentCandidate: CanonicalCandidate | null = null;
  let furthestCandidate: CanonicalCandidate | null = null;
  let lastComparableCandidate: CanonicalCandidate | null = null;
  let lastExactCandidate: CanonicalCandidate | null = null;
  let latestMovement: AudiobookCanonicalMovement = "none";
  let latestDirection: AudiobookCanonicalDirection = "unknown";
  let rewindDetected = false;
  let revisitDetected = false;

  for (const candidate of candidates) {
    const { evidence } = candidate;
    if (candidate.offsetMs != null) {
      const priorOffset = lastComparableCandidate?.offsetMs ?? null;
      const priorExactOffset = lastExactCandidate?.offsetMs ?? null;
      let useAsCurrent = true;
      if (candidate.approximate && priorOffset != null && candidate.offsetMs < priorOffset) {
        candidate.diagnostic.status = "stale_reset";
        candidate.diagnostic.reason = "STALE_OR_RESET_EVIDENCE";
        latestMovement = "stale";
        latestDirection = "unknown";
        useAsCurrent = false;
      } else if (candidate.exact && priorExactOffset != null && candidate.offsetMs < priorExactOffset) {
        latestMovement = "rewind";
        latestDirection = "backward";
        rewindDetected = true;
        revisitDetected = true;
      } else if (priorOffset == null || candidate.offsetMs > priorOffset) {
        latestMovement = "forward";
        latestDirection = "forward";
      } else if (candidate.offsetMs === priorOffset) {
        latestMovement = "none";
        latestDirection = "stationary";
      } else {
        latestMovement = "unknown";
        latestDirection = "unknown";
      }

      if (useAsCurrent && !(candidate.approximate && currentCandidate?.exact &&
        currentCandidate.offsetMs != null && candidate.offsetMs <= currentCandidate.offsetMs)) {
        currentCandidate = candidate;
      }
      if (useAsCurrent) lastComparableCandidate = candidate;
      if (candidate.exact) {
        lastExactCandidate = candidate;
        if (furthestCandidate == null || candidate.offsetMs >= furthestCandidate.offsetMs!) {
          furthestCandidate = candidate;
        }
      }
      continue;
    }

    if (evidence.status === "uncertain") {
      const lowerThanCurrent = currentCandidate?.evidence.progressPercent != null &&
        evidence.progressPercent != null &&
        evidence.progressPercent < currentCandidate.evidence.progressPercent;
      if (lowerThanCurrent && currentCandidate?.offsetMs != null) {
        candidate.diagnostic.status = "stale_reset";
        candidate.diagnostic.reason = "STALE_OR_RESET_EVIDENCE";
        latestMovement = "stale";
        latestDirection = "unknown";
      } else if (currentCandidate == null || currentCandidate.offsetMs == null) {
        currentCandidate = candidate;
        latestMovement = "unknown";
        latestDirection = "unknown";
      }
    }
  }

  const toCanonicalPosition = (candidate: CanonicalCandidate | null): AudiobookCanonicalPosition | null =>
    candidate == null ? null : canonicalPosition(candidate, chapters, evaluatedAt, mediaRevision, chapterRevision);

  const sessionGroups: Array<{ key: string; candidates: CanonicalCandidate[] }> = [];
  const explicitGroups = new Map<string, { key: string; candidates: CanonicalCandidate[] }>();
  for (const candidate of candidates) {
    const explicitKey = candidate.observation.sessionId?.trim() ||
      (candidate.observation.sessionStartAt && candidate.observation.sessionEndAt
        ? `${candidate.observation.sessionStartAt}|${candidate.observation.sessionEndAt}`
        : null);
    if (explicitKey) {
      const key = `explicit:${explicitKey}`;
      const group = explicitGroups.get(key) ?? { key, candidates: [] };
      group.candidates.push(candidate);
      explicitGroups.set(key, group);
      continue;
    }
    const previousGroup = sessionGroups.at(-1);
    const previousCandidate = previousGroup?.candidates.at(-1);
    const gap = previousCandidate == null
      ? null
      : (timestampMs(candidate.observation.watchedAt) ?? 0) - (timestampMs(previousCandidate.observation.watchedAt) ?? 0);
    if (!previousGroup || gap == null || gap < 0 || gap > SESSION_GAP_MS) {
      sessionGroups.push({ key: `implicit:${sessionGroups.length + 1}`, candidates: [candidate] });
    } else {
      previousGroup.candidates.push(candidate);
    }
  }
  sessionGroups.push(...explicitGroups.values());
  sessionGroups.sort((left, right) => left.candidates[0]!.observation.watchedAt.localeCompare(right.candidates[0]!.observation.watchedAt) ||
    left.key.localeCompare(right.key));

  const sessions: AudiobookCanonicalSessionMovement[] = sessionGroups.map((group) => {
    const groupCandidates = group.candidates;
    const first = groupCandidates[0]!;
    const last = groupCandidates[groupCandidates.length - 1]!;
    let sessionStartCandidate: CanonicalCandidate | null = null;
    let sessionEndCandidate: CanonicalCandidate | null = null;
    let groupCurrent: CanonicalCandidate | null = null;
    let groupLastComparable: CanonicalCandidate | null = null;
    let groupLastExact: CanonicalCandidate | null = null;
    let groupRevisit = false;
    for (const candidate of groupCandidates) {
      if (candidate.offsetMs == null) continue;
      if (candidate.approximate && groupLastComparable?.offsetMs != null && candidate.offsetMs < groupLastComparable.offsetMs) continue;
      if (sessionStartCandidate == null) sessionStartCandidate = candidate;
      groupCurrent = candidate;
      groupLastComparable = candidate;
      if (candidate.exact) {
        if (groupLastExact?.offsetMs != null && candidate.offsetMs < groupLastExact.offsetMs) groupRevisit = true;
        groupLastExact = candidate;
      }
      sessionEndCandidate = candidate;
    }
    const explicitStart = groupCandidates.map((candidate) => candidate.observation.sessionStartAt).find(Boolean) ?? null;
    const explicitEnd = [...groupCandidates].reverse().map((candidate) => candidate.observation.sessionEndAt).find(Boolean) ?? null;
    const startAt = explicitStart ?? first.observation.watchedAt;
    const endAt = explicitEnd ?? last.observation.watchedAt;
    const startMs = timestampMs(explicitStart);
    const endMs = timestampMs(explicitEnd);
    const durationMs = startMs != null && endMs != null && endMs >= startMs
      ? endMs - startMs
      : groupCandidates.reduce((total, candidate) => total + (normalizeListeningDurationMs(candidate.observation.duration) ?? 0), 0) || null;
    const lastEvidence = groupCurrent?.evidence ?? last.evidence;
    const startOffsetMs = sessionStartCandidate?.offsetMs ?? null;
    const endOffsetMs = sessionEndCandidate?.offsetMs ?? null;
    const direction: AudiobookCanonicalDirection = startOffsetMs == null || endOffsetMs == null
      ? "unknown"
      : endOffsetMs > startOffsetMs
        ? "forward"
        : endOffsetMs < startOffsetMs
          ? "backward"
          : "stationary";
    return {
      sessionKey: group.key,
      startAt,
      endAt,
      itemCount: groupCandidates.length,
      durationMs,
      startPositionMs: startOffsetMs,
      endPositionMs: endOffsetMs,
      direction,
      revisitDetected: groupRevisit,
      quality: lastEvidence.quality,
      source: lastEvidence.source,
      reason: lastEvidence.reason,
      evaluatedAt: endAt,
      mediaRevision,
      chapterRevision
    };
  });

  const listeningTimeMs = sessions.reduce((total, session) => total + (session.durationMs ?? 0), 0);
  const listeningTimeEvidence: AudiobookListeningTimeEvidence = {
    quality: sessions.some((session) => session.durationMs != null) ? "validated" : "unknown",
    source: sessions.some((session) => session.durationMs != null) ? "session_duration" : "none",
    reason: sessions.some((session) => session.durationMs != null)
      ? "SESSION_DURATION_VALIDATED"
      : "SESSION_DURATION_UNAVAILABLE",
    evaluatedAt,
    mediaRevision,
    chapterRevision
  };

  const completionCandidates = candidates.filter((candidate) =>
    candidate.exact && candidate.evidence.quality === "verified_completion" && candidate.offsetMs != null
  );
  const approximateCandidates = candidates.filter((candidate) => candidate.approximate && candidate.offsetMs != null);
  const fallbackChapterEvidence = unavailableMetadata(
    candidates.length > 0 ? "NO_TRUSTED_CHAPTER_EVIDENCE" : "POSITION_UNAVAILABLE",
    evaluatedAt,
    mediaRevision,
    chapterRevision
  );
  const currentChapter = currentCandidate?.offsetMs == null ? null : chapterForOffset(chapters, currentCandidate.offsetMs);
  const canonicalChapters = chapters.map((chapter): AudiobookCanonicalChapter => {
    let state: AudiobookCanonicalChapterState = "unknown";
    let evidence = fallbackChapterEvidence;
    let progressPercent: number | null = null;
    const completionForChapter = completionCandidates
      .filter((candidate) => candidate.offsetMs! >= chapter.endOffsetMs)
      .at(-1) ?? null;
    if (completionForChapter) {
      state = "explicitly_completed";
      evidence = metadataFromEvidence(completionForChapter.evidence, evaluatedAt, mediaRevision, chapterRevision);
      progressPercent = 100;
    } else if (furthestCandidate?.offsetMs != null && furthestCandidate.offsetMs >= chapter.endOffsetMs) {
      state = currentChapter?.chapterIndex === chapter.chapterIndex ? "revisiting" : "passed";
      evidence = metadataFromEvidence(furthestCandidate.evidence, evaluatedAt, mediaRevision, chapterRevision);
      if (state === "revisiting" && currentCandidate?.offsetMs != null) {
        progressPercent = chapterProgressPercent(chapter, currentCandidate.offsetMs);
        evidence = metadataFromEvidence(currentCandidate.evidence, evaluatedAt, mediaRevision, chapterRevision);
      }
    } else if (currentChapter?.chapterIndex === chapter.chapterIndex && currentCandidate?.offsetMs != null) {
      state = "in_progress";
      progressPercent = chapterProgressPercent(chapter, currentCandidate.offsetMs);
      evidence = metadataFromEvidence(currentCandidate.evidence, evaluatedAt, mediaRevision, chapterRevision);
    } else {
      const probablyPassed = approximateCandidates
        .filter((candidate) => candidate.offsetMs! >= chapter.endOffsetMs)
        .at(-1);
      if (probablyPassed) {
        state = "probably_passed";
        evidence = metadataFromEvidence(probablyPassed.evidence, evaluatedAt, mediaRevision, chapterRevision);
      }
    }
    return {
      chapterIndex: chapter.chapterIndex,
      title: chapter.title,
      startOffsetMs: chapter.startOffsetMs,
      endOffsetMs: chapter.endOffsetMs,
      state,
      progressPercent,
      evidence
    };
  });

  return {
    listenerId: input.listenerId,
    evaluatedAt,
    mediaRevision,
    chapterRevision,
    currentPosition: toCanonicalPosition(currentCandidate),
    furthestPosition: toCanonicalPosition(furthestCandidate),
    latestMovement,
    latestDirection,
    rewindDetected,
    revisitDetected,
    listeningTimeMs,
    listeningTimeEvidence,
    sessions,
    chapters: canonicalChapters,
    diagnostics
  };
}

/** Keep 6G callers on their existing evidence shape until 6J-A migrates them. */
export function adaptAudiobookProgressSnapshotToLegacyPosition(
  snapshot: AudiobookCanonicalProgressSnapshot
): AudiobookPositionEvidence | null {
  const current = snapshot.currentPosition;
  if (!current) return null;
  return {
    status: current.evidenceKind === "uncertain" || current.offsetMs == null ? "uncertain" : "position",
    offsetMs: current.offsetMs,
    progressPercent: current.progressPercent,
    quality: current.evidence.quality,
    source: current.evidence.source,
    reason: current.evidence.reason
  };
}
