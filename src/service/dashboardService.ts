import { z } from "zod";
import type { Db } from "../db/database.js";
import type { DashboardActivityItem, DashboardCategory, DashboardTimelineSession, DashboardProgressResponse, DashboardProgressGroup, DashboardProgressPersonContext, DashboardProgressBucket, ProgressHierarchyExpansion, ProgressNodeState, ProgressNodeStateSource, ProgressWatcherEvidence, DashboardDetailIdentity, DashboardDetailIdentityInput, DashboardDetailResolution, DashboardDetailWorkspaceResult, DashboardDetailWorkspaceHierarchyResult, DashboardMovieHistory, DashboardMovieHistoryRow, DashboardArchiveIdentityReview } from "../types/api.js";
import { CowatchingIntelligenceService } from "./cowatchingIntelligenceService.js";
import { CowatchAdjudicationService } from "./cowatchAdjudicationService.js";
import { buildDashboardArtworkDescriptor, type DashboardArtworkDescriptor } from "./artworkService.js";
import { evaluateReplaySemantics, type ReplayObservation, type ReplaySemantics } from "./replaySemantics.js";
import { ArchivePlexViewRecoveryService } from "./archivePlexViewRecoveryService.js";
import { getCanonicalMovieRatingKey, getMovieIdentityGuid, getMovieIdentityKeys, warmMovieIdentityCache } from "./plexMovieIdentityService.js";
import { appConfig } from "../utils/config.js";

const HOUSEHOLD_CATEGORIES = ["movie", "tv", "classic_tv", "anime", "audiobook"] as const;
const SUMMARY_SAMPLE_LIMIT = 500;
const DETAIL_SAMPLE_LIMIT = 200;
const DETAIL_HIERARCHY_HISTORY_LIMIT = 100_000;
const MOVIE_HISTORY_ROW_LIMIT = 100;
const MOVIE_HISTORY_OBSERVATION_LIMIT = 2_000;
const TIMELINE_DEFAULT_DAYS = 1;
const TIMELINE_MAX_DAYS = 7;
const OVERVIEW_CONTINUE_LIMIT = 3;
const OVERVIEW_COMPLETED_LIMIT = 4;
const OVERVIEW_ACTIVITY_LIMIT = 4;
const OVERVIEW_ATTENTION_LIMIT = 4;
const PEOPLE_DEFAULT_WINDOW_DAYS = 30;
const PEOPLE_MAX_HEATMAP_DAYS = 365;
const PEOPLE_PERIODS = ["7d", "30d", "90d", "all", "custom"] as const;

const filterSchema = z.object({
  date: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  period: z.enum(PEOPLE_PERIODS).optional(),
  user: z.string().optional(),
  ratingKey: z.string().max(200).optional(),
  grandparentRatingKey: z.string().max(200).optional(),
  audiobookId: z.preprocess((value) => value === undefined ? undefined : Number(value), z.number().int().optional()),
  category: z.enum(HOUSEHOLD_CATEGORIES).optional(),
  library: z.string().optional(),
  completed: z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean().optional()),
  search: z.string().max(200).optional(),
  limit: z.preprocess((value) => {
    if (value === undefined) return 50;
    return Math.min(Number(value), 1000);
  }, z.number().int().min(1).max(1000)),
  offset: z.preprocess((value) => value === undefined ? 0 : Number(value), z.number().int().min(0).max(100000)),
  sort: z.enum(["recent", "title", "progress", "plays"]).default("recent")
});

const timelineFilterSchema = filterSchema.extend({
  days: z.preprocess((value) => {
    if (value === undefined) return TIMELINE_DEFAULT_DAYS;
    return Math.min(Number(value), TIMELINE_MAX_DAYS);
  }, z.number().int().min(1).max(TIMELINE_MAX_DAYS))
});

type DashboardDerivedCategory = DashboardCategory | "other";
type PeoplePeriod = typeof PEOPLE_PERIODS[number];
type DashboardWatcherPerson = { userId: number | null; displayName: string };
export interface DashboardServiceOptions { timeZone?: string; includePlexPlayHistory?: boolean }
type PeopleContribution = DashboardActivityItem & {
  contribution: "observed" | "attributed_confirmed_together";
  confirmedTogether: boolean;
};

type CachedAudiobookChapter = {
  chapter_index: number;
  title: string;
  start_offset_ms: number;
  end_offset_ms: number;
};

type CachedAudiobookSource = {
  source_type: string;
  source_status: string;
  confidence: number;
  refreshed_at: string;
};

type AudiobookChapterProgressSnapshot = {
  hasVerifiedChapters: boolean;
  source: CachedAudiobookSource | null;
  chapters: Array<{
    ratingKey: string;
    title: string;
    chapterIndex?: number;
    startOffsetMs?: number;
    endOffsetMs?: number;
    duration: number;
    watchedStates: Record<string, ProgressNodeState>;
    watcherEvidence: ProgressWatcherEvidence[];
    stateSources: Record<string, ProgressNodeStateSource>;
    partialPositions: Record<string, number>;
    sourceType?: "audiobook_tool";
    sourceStatus?: string;
    sourceConfidence?: number;
    sourceRefreshedAt?: string;
    nodeKind: "chapter" | "track";
  }>;
  distinctItems: number;
  distinctCompleted: number;
  currentChapterIndex?: number | null;
  currentProgressPercent?: number | null;
  replaySemantics: ReplaySemantics;
  peopleStats: Map<string, { distinctItems: number; distinctCompleted: number; partials: number; observationCount: number; sessionCount: number; viewingDayCount: number; replayCount: number }>;
};

type PeopleWindow = {
  period: PeoplePeriod;
  dateFrom: string;
  dateTo: string;
  start: string;
  end: string;
  heatmapStart: string;
  heatmapEnd: string;
  heatmapTruncated: boolean;
  defaulted: boolean;
};

function emptyReplaySemantics(): ReplaySemantics {
  return { observationCount: 0, sessionCount: 0, viewingDayCount: 0, replayCount: 0, replayReason: null, latestObservedAt: null };
}

function addReplaySemantics(target: ReplaySemantics, source: ReplaySemantics): ReplaySemantics {
  target.observationCount += source.observationCount;
  target.sessionCount += source.sessionCount;
  target.viewingDayCount += source.viewingDayCount;
  target.replayCount += source.replayCount;
  if (source.replayReason) target.replayReason = source.replayReason;
  if (source.latestObservedAt && (!target.latestObservedAt || source.latestObservedAt > target.latestObservedAt)) {
    target.latestObservedAt = source.latestObservedAt;
  }
  return target;
}

function nowMs(): number {
  return Date.now();
}

function withTiming<T>(compute: () => T): { value: T; timingMs: number } {
  const started = nowMs();
  const value = compute();
  return { value, timingMs: nowMs() - started };
}

function parseFilters(input: unknown) {
  const parsed = filterSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Validation Error: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  return parsed.data;
}

function parseTimelineFilters(input: unknown) {
  const parsed = timelineFilterSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Validation Error: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  return parsed.data;
}

function isHouseholdCategory(category: DashboardDerivedCategory): category is DashboardCategory {
  return (category as string) !== "other";
}

function resolveLibraryName(libraryName?: string | null, catalogLibraryTitle?: string | null): string | undefined {
  const value = [libraryName, catalogLibraryTitle].find((candidate): candidate is string => Boolean(candidate && candidate.trim()));
  return value?.trim();
}

function resolveDashboardAlias(alias?: string | null, plexUsername?: string | null): string {
  const value = alias?.trim();
  if (value) return value;
  return plexUsername?.trim() || "";
}

function normalizeAudiobookDisplayTitle(value?: string | null): string {
  const raw = value?.trim();
  if (!raw) return "";
  let title = raw.replace(/^\s*\d{4}\s*[-–—]\s*/, "");
  const hadTrailingYear = /\s*\((\d{4})\)\s*$/.test(title);
  title = title.replace(/\s*\((\d{4})\)\s*$/, "");
  if (hadTrailingYear) {
    const trailingLabel = title.match(/\s*\(([^()]+)\)\s*$/)?.[1]?.trim() ?? "";
    const isEditionDescriptor = /^(?:unabridged|abridged|dramatized|full cast|radio play|sound effects)$/i.test(trailingLabel);
    if (!isEditionDescriptor) title = title.replace(/\s*\(([^()]+)\)\s*$/, "");
  }
  title = title.replace(/^Cosmere\s+/i, "");
  return title.trim();
}

function resolveDashboardDisplayTitle(item: Pick<DashboardActivityItem, "category" | "showTitle" | "title" | "audiobookId" | "audiobookTitle" | "parentTitle">): string {
  if (item.category === "audiobook") {
    const rawTitle = item.title?.trim() || "";
    const author = item.showTitle?.trim() || "";
    const canonicalTitle = item.audiobookTitle ?? item.parentTitle;
    const normalizedIdentity = (value: string) => normalizeAudiobookDisplayTitle(value)
      .replace(/\s*\([^()]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
    const rawIdentity = normalizedIdentity(rawTitle);
    const canonicalIdentity = normalizedIdentity(canonicalTitle ?? "");
    const rawLooksLikeCanonicalBook = Boolean(rawIdentity && canonicalIdentity && (
      rawIdentity.includes(canonicalIdentity) || canonicalIdentity.includes(rawIdentity)
    ));
    const preferredTitle = canonicalTitle && !rawLooksLikeCanonicalBook
      ? canonicalTitle
      : rawTitle || canonicalTitle;
    return normalizeAudiobookDisplayTitle(preferredTitle)
      || normalizeAudiobookDisplayTitle(item.audiobookTitle ?? item.parentTitle ?? rawTitle)
      || author;
  }
  if (item.category === "tv" || item.category === "classic_tv" || item.category === "anime") {
    return item.showTitle?.trim() || item.title.trim() || "";
  }
  return item.title.trim();
}

function explorerTitle(item: Pick<DashboardActivityItem, "category" | "showTitle" | "title" | "audiobookTitle" | "parentTitle">): string {
  return resolveDashboardDisplayTitle(item);
}

function explorerGroupKey(item: DashboardActivityItem): string {
  const library = item.libraryName ?? "";
  if (item.category === "movie") return `movie:${library}:${item.ratingKey}`;
  if (item.category === "audiobook") return `audiobook:${library}:${item.audiobookId ?? item.grandparentRatingKey ?? item.parentRatingKey ?? item.showTitle ?? item.title}`;
  if (item.category === "tv" || item.category === "classic_tv" || item.category === "anime") return `series:${item.category}:${library}:${item.grandparentRatingKey ?? item.parentRatingKey ?? item.showTitle ?? item.title}`;
  return `other:${library}:${item.ratingKey}`;
}

function isSafeDetailSegment(value: string): boolean {
  return value.length > 0 && value.length <= 200 && !/[\s/:?#]/.test(value);
}

function detailIdentityKey(identity: DashboardDetailIdentityInput): string {
  if (identity.kind === "movie") return `movie:${identity.ratingKey}`;
  if (identity.kind === "audiobook") return `audiobook:${identity.audiobookId}`;
  return `series:${identity.category}:${identity.grandparentRatingKey}`;
}

function withDetailKey(identity: DashboardDetailIdentityInput): DashboardDetailIdentity {
  return { ...identity, detailKey: detailIdentityKey(identity) } as DashboardDetailIdentity;
}

function activityDetailKey(category: DashboardCategory, ratingKey: string, grandparentRatingKey?: string | null, audiobookId?: number | null): string | undefined {
  if (category === "movie" && isSafeDetailSegment(ratingKey)) {
    return detailIdentityKey({ kind: "movie", category: "movie", ratingKey });
  }
  if ((category === "tv" || category === "classic_tv" || category === "anime") && grandparentRatingKey && isSafeDetailSegment(grandparentRatingKey)) {
    return detailIdentityKey({ kind: "series", category, grandparentRatingKey });
  }
  if (category === "audiobook" && Number.isInteger(Number(audiobookId))) {
    return detailIdentityKey({ kind: "audiobook", category: "audiobook", audiobookId: Number(audiobookId) });
  }
  return undefined;
}

function parseConfirmedParticipants(value: unknown): Array<{ userId: number; displayName: string }> {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((participant) => Number.isInteger(participant?.userId) && typeof participant?.displayName === "string" && participant.displayName.trim());
  } catch {
    return [];
  }
}

function explorerSortTitle(value: string): string {
  const trimmed = value.trim();
  const withoutPrefix = trimmed
    .replace(/^[\s\p{P}\p{S}]+/gu, "")
    .replace(/^\d{4}\s*[-\u2013\u2014:]\s*/, "")
    .trim();
  return (withoutPrefix || trimmed).toLocaleLowerCase();
}

function isRecognizedExplorerItem(item: DashboardActivityItem): boolean {
  return Boolean(explorerTitle(item).trim()) && (item.category === "audiobook" || Boolean(item.libraryName));
}

function compareExplorerItems(a: any, b: any, sort: string): number {
  const aTitle = a.displayTitle ?? a.title;
  const bTitle = b.displayTitle ?? b.title;
  const titleOrder = explorerSortTitle(aTitle).localeCompare(explorerSortTitle(bTitle), undefined, { sensitivity: "base" });
  const stableIdentityOrder = String(a.groupKey ?? "").localeCompare(String(b.groupKey ?? ""), undefined, { sensitivity: "base" });
  if (sort === "title") return titleOrder || aTitle.localeCompare(bTitle, undefined, { sensitivity: "base" }) || stableIdentityOrder;
  if (sort === "progress") return (b.percentComplete ?? -1) - (a.percentComplete ?? -1) || b.plays - a.plays || b.latestWatchedAt.localeCompare(a.latestWatchedAt) || stableIdentityOrder;
  if (sort === "plays") return b.plays - a.plays || b.latestWatchedAt.localeCompare(a.latestWatchedAt) || titleOrder || stableIdentityOrder;
  return b.latestWatchedAt.localeCompare(a.latestWatchedAt) || titleOrder || stableIdentityOrder;
}

function isoDay(value: string): string {
  return value.slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeDurationSeconds(duration?: number): number {
  const value = Number(duration ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 100000 ? value / 1000 : value;
}

function normalizeDurationMs(duration?: number): number {
  const value = Number(duration ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 100000 ? value : value * 1000;
}

function normalizeOffsetMs(offset?: number): number {
  const value = Number(offset ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 100000 ? value : value * 1000;
}

function normalizeAudiobookEvidenceOffsetMs(offset: number | undefined, bookDurationMs: number): number {
  const value = Number(offset ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (bookDurationMs > 0 && value <= bookDurationMs * 1.05) return value;
  const secondsAsMs = value * 1000;
  if (bookDurationMs > 0 && secondsAsMs <= bookDurationMs * 1.05) return secondsAsMs;
  return value > 100000 ? value : secondsAsMs;
}

function minutesFromDuration(duration?: number): number {
  return Math.round(normalizeDurationSeconds(duration) / 60);
}

function hoursFromDuration(duration?: number): number {
  return Math.round(normalizeDurationSeconds(duration) / 3600);
}

function minutesFromSeconds(seconds?: number): number {
  return Math.round((seconds ?? 0) / 60);
}

function hoursFromSeconds(seconds?: number): number {
  return Math.round((seconds ?? 0) / 3600);
}

function buildWindowLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "No visible activity yet";
  if (start === end) return start;
  return `${start} to ${end}`;
}

function categoryLabelFor(category: string): string {
  return category === "movie"
    ? "Movies"
    : category === "tv"
      ? "TV"
      : category === "classic_tv"
        ? "Classic TV"
        : category === "anime"
          ? "Anime"
          : category === "audiobook"
            ? "Audiobooks"
            : category;
}

function normalizePersonIdentity(value?: string | null): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s._-]+/g, "");
}

export function deriveDashboardCategory(mediaType: string, libraryName?: string): { category: DashboardDerivedCategory; label: string; derived: boolean } {
  const library = (libraryName ?? "").toLowerCase();
  const type = mediaType.toLowerCase();
  if (type === "audiobook" || library.includes("audiobook")) return { category: "audiobook", label: "Audiobooks", derived: false };
  if (library.includes("anime")) return { category: "anime", label: "Anime", derived: false };
  if (library.includes("classic")) return { category: "classic_tv", label: "Classic TV", derived: false };
  if (type === "movie") {
    if (!library || library === "movies") return { category: "movie", label: library ? "Movies" : "Movies (library unknown)", derived: !library };
    return { category: "other", label: libraryName ?? mediaType, derived: true };
  }
  if (["episode", "show", "season"].includes(type)) {
    if (!library || library === "tv shows" || library === "etv" || library === "jdrama") return { category: "tv", label: library ? "TV" : "TV (library unknown)", derived: !library };
    return { category: "other", label: libraryName ?? mediaType, derived: true };
  }
  return { category: "other", label: mediaType || "Other", derived: true };
}

export class DashboardService {
  private readonly cowatchingService: CowatchingIntelligenceService;
  private readonly adjudicationService: CowatchAdjudicationService;
  private readonly archiveService: ArchivePlexViewRecoveryService;
  private readonly householdDateFormatter: Intl.DateTimeFormat;
  private readonly includePlexPlayHistory: boolean;

  constructor(private readonly db: Db, options: DashboardServiceOptions = {}) {
    warmMovieIdentityCache(db);
    this.cowatchingService = new CowatchingIntelligenceService(db);
    this.adjudicationService = new CowatchAdjudicationService(db);
    this.archiveService = new ArchivePlexViewRecoveryService(db);
    this.includePlexPlayHistory = options.includePlexPlayHistory ?? appConfig.PLEX_PLAY_HISTORY_PROJECTION_ENABLED;
    this.householdDateFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
  }

  resolveDetailIdentity(input: string): DashboardDetailResolution {
    const selector = typeof input === "string" ? input.trim() : "";
    if (!selector || selector.length > 300) return { ok: false, errorCode: "DETAIL_INVALID" };

    const canonical = this.parseCanonicalDetailKey(selector);
    if (canonical) return this.validateDetailIdentity(this.canonicalizeMovieIdentity(canonical), selector);

    const progressKey = this.parseProgressGroupKey(selector);
    if (progressKey) return this.validateDetailIdentity(this.canonicalizeMovieIdentity(progressKey), selector);

    const identities = new Map<string, DashboardDetailIdentity>();
    const catalogRows = this.db.prepare(`
      SELECT rating_key, media_type, library_title, grandparent_rating_key, audiobook_id
      FROM content_catalog
      WHERE rating_key = ? OR parent_rating_key = ? OR grandparent_rating_key = ?
    `).all(selector, selector, selector) as any[];
    for (const row of catalogRows) this.addRawDetailCandidate(identities, row, selector);

    const observationRows = this.db.prepare(`
      SELECT po.rating_key, po.media_type, po.library_name AS library_title,
        po.grandparent_rating_key, po.parent_rating_key, cat.audiobook_id
      FROM playback_observations po
      LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key
      WHERE po.rating_key = ? OR po.parent_rating_key = ? OR po.grandparent_rating_key = ?
    `).all(selector, selector, selector) as any[];
    for (const row of observationRows) this.addRawDetailCandidate(identities, row, selector);

    if (identities.size === 0) return { ok: false, errorCode: "DETAIL_NOT_FOUND" };
    if (identities.size > 1) return { ok: false, errorCode: "DETAIL_AMBIGUOUS" };
    return this.validateDetailIdentity(this.canonicalizeMovieIdentity([...identities.values()][0]), selector);
  }

  getDetailWorkspace(input: string): DashboardDetailWorkspaceResult {
    const timed = withTiming<DashboardDetailWorkspaceResult>(() => {
      const resolution = this.resolveDetailIdentity(input);
      if (!resolution.ok) return resolution;
      const identity = resolution.identity;
      const metadata = this.getDetailWorkspaceMetadata(identity);
      if (!metadata) return { ok: false, errorCode: "DETAIL_NOT_FOUND" as const };

      const movieHistory = identity.kind === "movie" ? this.getCanonicalMovieHistory(identity) : undefined;
      const archiveIdentityReview: DashboardArchiveIdentityReview | undefined = identity.kind === "movie"
        ? {
          candidates: this.archiveService.queryIdentityCandidates(identity.ratingKey, this.currentMovieGuid(identity.ratingKey), metadata.title),
          reviewable: true
        }
        : undefined;
      const activity = identity.kind === "movie"
        ? []
        : this.getActivity({ ...this.detailActivityFilter(identity), limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
      const aggregate = this.db.prepare(`
        SELECT COUNT(*) AS plays,
          SUM(CASE WHEN po.completed = 1 THEN 1 ELSE 0 END) AS completed_plays,
          COUNT(DISTINCT CASE WHEN po.completed = 1 THEN po.rating_key END) AS completed_items,
          MAX(po.watched_at) AS latest_watched_at,
          COALESCE(SUM(COALESCE(po.duration, 0)), 0) AS observed_duration
        FROM playback_observations po
        LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key
        JOIN users u ON u.id = po.user_id
        WHERE COALESCE(u.dashboard_shown, u.enabled) = 1 AND ${this.detailIdentityWhere(identity)}
      `).get(...this.detailIdentityArgs(identity)) as any;
      const latest = this.db.prepare(`
        SELECT po.percent_complete AS percentComplete
        FROM playback_observations po
        LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key
        JOIN users u ON u.id = po.user_id
        WHERE COALESCE(u.dashboard_shown, u.enabled) = 1 AND ${this.detailIdentityWhere(identity)}
        ORDER BY po.watched_at DESC, po.id DESC LIMIT 1
      `).get(...this.detailIdentityArgs(identity)) as any;

      const watcherPeople = this.visibleDashboardPeople();
      const audiobookProgress = identity.kind === "audiobook"
        ? this.buildAudiobookHierarchy(
          this.db.prepare(`
            SELECT id, title, parent_series_title, subseries_title, series_title, chapter_count
            FROM audiobook_books
            WHERE id = ?
          `).get(identity.audiobookId) as any,
          activity,
          watcherPeople
        )
        : null;
      const peopleByName = new Map<string, DashboardWatcherPerson>();
      if (movieHistory) {
        for (const person of movieHistory.people) {
          peopleByName.set(person.displayName, { userId: person.id, displayName: person.displayName });
        }
      } else {
        for (const item of activity) {
          const names = item.displayNames?.length ? item.displayNames : [item.displayName];
          for (const displayName of names.filter(Boolean)) {
            const visiblePerson = watcherPeople.find((person) => person.displayName === displayName);
            if (visiblePerson) {
              peopleByName.set(displayName, visiblePerson);
            } else if (displayName === item.displayName) {
              peopleByName.set(displayName, { userId: item.userId, displayName });
            }
          }
        }
      }
      const peopleOrder = new Map(watcherPeople.map((person, index) => [person.displayName, index]));
      const people = [...peopleByName.values()].sort((a, b) => {
        const orderDelta = (peopleOrder.get(a.displayName) ?? Number.MAX_SAFE_INTEGER) - (peopleOrder.get(b.displayName) ?? Number.MAX_SAFE_INTEGER);
        return orderDelta || a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
      });
      const completedItems = movieHistory
        ? (movieHistory.summary.completedViewingDayCount > 0 ? 1 : 0)
        : Number(aggregate?.completed_items ?? 0);
      const progress = this.getDetailProgressSummary(identity, metadata, completedItems, latest?.percentComplete, audiobookProgress);
      const activityReplaySemantics = this.aggregateReplaySemantics(activity).total;
      const detailReplaySemantics: ReplaySemantics = movieHistory
        ? {
          observationCount: movieHistory.summary.rawObservationCount,
          sessionCount: movieHistory.summary.sessionCount,
          viewingDayCount: movieHistory.summary.viewingDayCount,
          replayCount: movieHistory.summary.replayCount,
          replayReason: movieHistory.summary.replayReason,
          latestObservedAt: movieHistory.summary.latestViewedAt
        }
        : activityReplaySemantics;

      return {
        ok: true,
        data: {
          detailKey: identity.detailKey,
          identity,
          title: metadata.title,
          subtitle: metadata.subtitle,
          category: identity.category,
          artworkUrl: metadata.artworkUrl,
          posterUrl: metadata.posterUrl,
          artworkRevision: metadata.artworkRevision,
          backdropUrl: metadata.backdropUrl,
          people: people.filter((person): person is DashboardWatcherPerson & { userId: number } => person.userId != null).map((person) => ({ id: person.userId, displayName: person.displayName })),
          watcherPeople: watcherPeople.filter((person): person is DashboardWatcherPerson & { userId: number } => person.userId != null).map((person) => ({ id: person.userId, displayName: person.displayName })),
          playbackSummary: {
            plays: Number(aggregate?.plays ?? 0),
            observationCount: detailReplaySemantics.observationCount,
            sessionCount: detailReplaySemantics.sessionCount,
            viewingDayCount: detailReplaySemantics.viewingDayCount,
            replayCount: detailReplaySemantics.replayCount,
            replayReason: detailReplaySemantics.replayReason,
            completedPlays: Number(aggregate?.completed_plays ?? 0),
            latestWatchedAt: aggregate?.latest_watched_at ?? null,
            observedMinutes: Math.round(Number(aggregate?.observed_duration ?? 0) / 60000)
          },
          progressSummary: progress,
          hierarchy: {
            available: true,
            route: `/api/dashboard/detail-workspace/${encodeURIComponent(identity.detailKey)}/hierarchy`
          },
          ...(movieHistory ? {
            movieHistory,
            ...(archiveIdentityReview ? { archiveIdentityReview } : {}),
            movieProfile: { route: `/api/dashboard/detail-workspace/${encodeURIComponent(identity.detailKey)}/movie-profile` }
          } : {}),
          timingMs: 0
        }
      };
    });
    if (!timed.value.ok) return timed.value;
    return { ok: true, data: { ...timed.value.data, timingMs: timed.timingMs } };
  }

  getDetailWorkspaceHierarchy(input: string): DashboardDetailWorkspaceHierarchyResult {
    const timed = withTiming<DashboardDetailWorkspaceHierarchyResult>(() => {
      const resolution = this.resolveDetailIdentity(input);
      if (!resolution.ok) return resolution;
      const identity = resolution.identity;
      const expansion = this.getProgressExpansion(this.legacyProgressGroupKey(identity));
      if (!expansion) return { ok: false, errorCode: "DETAIL_NOT_FOUND" as const };
      return {
        ok: true,
        data: {
          detailKey: identity.detailKey,
          identity,
          category: identity.category,
          hierarchy: expansion.hierarchy,
          timingMs: 0
        }
      };
    });
    if (!timed.value.ok) return timed.value;
    return { ok: true, data: { ...timed.value.data, timingMs: timed.timingMs } };
  }

  private parseCanonicalDetailKey(selector: string): DashboardDetailIdentity | null {
    let match = selector.match(/^movie:([^:]+)$/);
    if (match && isSafeDetailSegment(match[1])) return withDetailKey({ kind: "movie", category: "movie", ratingKey: match[1] });
    match = selector.match(/^series:(tv|classic_tv|anime):([^:]+)$/);
    if (match && isSafeDetailSegment(match[2])) return withDetailKey({ kind: "series", category: match[1] as DashboardCategory & ("tv" | "classic_tv" | "anime"), grandparentRatingKey: match[2] });
    match = selector.match(/^audiobook:(\d+)$/);
    if (match) return withDetailKey({ kind: "audiobook", category: "audiobook", audiobookId: Number(match[1]) });
    return null;
  }

  private parseProgressGroupKey(selector: string): DashboardDetailIdentity | null {
    let match = selector.match(/^movie:(.+):([^:]+)$/);
    if (match && isSafeDetailSegment(match[2])) return withDetailKey({ kind: "movie", category: "movie", ratingKey: match[2] });
    match = selector.match(/^series:(tv|classic_tv|anime):(.+):([^:]+)$/);
    if (match && isSafeDetailSegment(match[3])) return withDetailKey({ kind: "series", category: match[1] as DashboardCategory & ("tv" | "classic_tv" | "anime"), grandparentRatingKey: match[3] });
    match = selector.match(/^audiobook:(.+):(\d+)$/);
    if (match) return withDetailKey({ kind: "audiobook", category: "audiobook", audiobookId: Number(match[2]) });
    return null;
  }

  private addRawDetailCandidate(target: Map<string, DashboardDetailIdentity>, row: any, rawRatingKey: string): void {
    const category = deriveDashboardCategory(String(row.media_type ?? ""), row.library_title).category;
    let identity: DashboardDetailIdentity | null = null;
    if (category === "movie") {
      identity = this.canonicalizeMovieIdentity(withDetailKey({ kind: "movie", category: "movie", ratingKey: rawRatingKey }));
    } else if (category === "audiobook" && Number.isInteger(Number(row.audiobook_id))) {
      identity = withDetailKey({ kind: "audiobook", category: "audiobook", audiobookId: Number(row.audiobook_id) });
    } else if ((category === "tv" || category === "classic_tv" || category === "anime") && row.grandparent_rating_key) {
      identity = withDetailKey({ kind: "series", category, grandparentRatingKey: String(row.grandparent_rating_key) });
    } else if ((category === "tv" || category === "classic_tv" || category === "anime") && String(row.media_type).toLowerCase() === "show") {
      identity = withDetailKey({ kind: "series", category, grandparentRatingKey: rawRatingKey });
    }
    if (identity) target.set(identity.detailKey, identity);
  }

  private validateDetailIdentity(identity: DashboardDetailIdentity, input: string): DashboardDetailResolution {
    if (identity.kind === "movie") {
      const keys = getMovieIdentityKeys(this.db, identity.ratingKey);
      const placeholders = keys.map(() => "?").join(",");
      const guid = getMovieIdentityGuid(this.db, identity.ratingKey);
      const guidClause = guid ? " OR po.plex_guid = ?" : "";
      const catalogRecords = this.db.prepare(`
        SELECT COUNT(*) AS count FROM content_catalog
        WHERE rating_key IN (${placeholders}) AND lower(media_type) = 'movie'
      `).get(...keys) as any;
      const observationRecords = this.db.prepare(`
        SELECT COUNT(*) AS count FROM playback_observations po
        WHERE po.rating_key IN (${placeholders}) AND lower(po.media_type) = 'movie'${guidClause}
      `).get(...keys, ...(guid ? [guid] : [])) as any;
      const records = Number(catalogRecords?.count ?? 0) + Number(observationRecords?.count ?? 0);
      if (records === 0) return { ok: false, errorCode: "DETAIL_NOT_FOUND" };
      const visibility = this.db.prepare(`
        SELECT COUNT(*) AS total,
          SUM(CASE WHEN COALESCE(u.dashboard_shown, u.enabled) = 1 THEN 1 ELSE 0 END) AS visible
        FROM playback_observations po
        LEFT JOIN users u ON u.id = po.user_id
        WHERE po.rating_key IN (${placeholders})${guidClause}
      `).get(...keys, ...(guid ? [guid] : [])) as any;
      if (Number(visibility?.total ?? 0) > 0 && Number(visibility?.visible ?? 0) === 0) return { ok: false, errorCode: "DETAIL_NOT_FOUND" };
      return { ok: true, identity, input };
    }
    const records = this.db.prepare(`SELECT COUNT(*) AS count FROM (
      SELECT rating_key FROM content_catalog WHERE ${this.identityRecordWhere(identity)}
      UNION
      SELECT po.rating_key FROM playback_observations po LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key WHERE ${this.identityRecordWhere(identity, "po", "cat")}
    )`).get(...this.identityRecordArgs(identity), ...this.identityRecordArgs(identity)) as any;
    if (Number(records?.count ?? 0) === 0) return { ok: false, errorCode: "DETAIL_NOT_FOUND" };

    const visibility = this.db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN COALESCE(u.dashboard_shown, u.enabled) = 1 THEN 1 ELSE 0 END) AS visible
      FROM playback_observations po
      LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key
      LEFT JOIN users u ON u.id = po.user_id
      WHERE ${this.detailIdentityWhere(identity)}
    `).get(...this.detailIdentityArgs(identity)) as any;
    if (Number(visibility?.total ?? 0) > 0 && Number(visibility?.visible ?? 0) === 0) return { ok: false, errorCode: "DETAIL_NOT_FOUND" };
    return { ok: true, identity, input };
  }

  private identityRecordWhere(identity: DashboardDetailIdentity, poAlias = "content_catalog", catAlias = "content_catalog"): string {
    if (identity.kind === "movie") return `${poAlias}.rating_key = ?`;
    if (identity.kind === "series") return `(${poAlias}.rating_key = ? OR ${poAlias}.grandparent_rating_key = ?)`;
    return `${catAlias}.audiobook_id = ?`;
  }

  private identityRecordArgs(identity: DashboardDetailIdentity): any[] {
    if (identity.kind === "movie") return [identity.ratingKey];
    if (identity.kind === "series") return [identity.grandparentRatingKey, identity.grandparentRatingKey];
    return [identity.audiobookId];
  }

  private detailIdentityWhere(identity: DashboardDetailIdentity): string {
    if (identity.kind === "movie") {
      const keys = getMovieIdentityKeys(this.db, identity.ratingKey);
      const placeholders = keys.map(() => "?").join(",");
      return `(po.rating_key IN (${placeholders})${getMovieIdentityGuid(this.db, identity.ratingKey) ? " OR po.plex_guid = ?" : ""})`;
    }
    return this.identityRecordWhere(identity, "po", "cat");
  }

  private detailIdentityArgs(identity: DashboardDetailIdentity): any[] {
    if (identity.kind === "movie") {
      const guid = getMovieIdentityGuid(this.db, identity.ratingKey);
      return [...getMovieIdentityKeys(this.db, identity.ratingKey), ...(guid ? [guid] : [])];
    }
    return this.identityRecordArgs(identity);
  }

  private detailActivityFilter(identity: DashboardDetailIdentity): Record<string, unknown> {
    if (identity.kind === "movie") return { ratingKey: identity.ratingKey };
    if (identity.kind === "series") return { grandparentRatingKey: identity.grandparentRatingKey };
    return { audiobookId: identity.audiobookId };
  }

  private currentMovieGuid(ratingKey: string): string | null {
    return getMovieIdentityGuid(this.db, ratingKey);
  }

  private canonicalizeMovieIdentity(identity: DashboardDetailIdentity): DashboardDetailIdentity {
    if (identity.kind !== "movie") return identity;
    const ratingKey = getCanonicalMovieRatingKey(this.db, identity.ratingKey);
    return withDetailKey({ kind: "movie", category: "movie", ratingKey });
  }

  private householdLocalDate(value: string): string {
    const parts = this.householdDateFormatter.formatToParts(new Date(value));
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "00";
    const day = parts.find((part) => part.type === "day")?.value ?? "00";
    return `${year}-${month}-${day}`;
  }

  private replayProgressPercent(row: { percentComplete?: unknown; viewOffset?: unknown; duration?: unknown }): number | null {
    const percent = Number(row.percentComplete);
    if (Number.isFinite(percent)) return Math.max(0, Math.min(100, percent));
    const offset = Number(row.viewOffset);
    const duration = Number(row.duration);
    if (!Number.isFinite(offset) || !Number.isFinite(duration) || offset < 0 || duration <= 0) return null;
    return Math.max(0, Math.min(100, (offset / duration) * 100));
  }

  private replayObservation(
    row: { watchedAt: string; completed?: unknown; percentComplete?: unknown; viewOffset?: unknown; duration?: unknown; sessionStartAt?: string; sessionEndAt?: string; watchedAtProvenance?: string },
    completed = Boolean(row.completed),
    progressPercent = this.replayProgressPercent(row)
  ): ReplayObservation {
    return {
      observedAt: row.watchedAt,
      localDate: this.householdLocalDate(row.watchedAt),
      completed,
      progressPercent,
      startedAt: row.sessionStartAt ?? null,
      endedAt: row.sessionEndAt ?? null,
      source: row.watchedAtProvenance === "plex_historical_last_view"
        ? "historical_last_view"
        : row.watchedAtProvenance === "plex_play_history"
          ? "point_completed_play"
          : "detailed_playback"
    };
  }

  private replaySemanticsForPlays(plays: DashboardActivityItem[]): ReplaySemantics {
    return evaluateReplaySemantics(plays.map(play => this.replayObservation(play)));
  }

  private aggregateReplaySemantics(plays: DashboardActivityItem[]) {
    const buckets = new Map<string, { userId: number; observations: DashboardActivityItem[] }>();
    for (const play of plays) {
      const key = `${play.userId}:${play.ratingKey}`;
      const bucket = buckets.get(key) ?? { userId: play.userId, observations: [] };
      bucket.observations.push(play);
      buckets.set(key, bucket);
    }

    const total: ReplaySemantics = {
      observationCount: 0,
      sessionCount: 0,
      viewingDayCount: 0,
      replayCount: 0,
      replayReason: null,
      latestObservedAt: null
    };
    const byUserId = new Map<number, ReplaySemantics>();
    for (const bucket of buckets.values()) {
      const semantics = this.replaySemanticsForPlays(bucket.observations);
      total.observationCount += semantics.observationCount;
      total.sessionCount += semantics.sessionCount;
      total.viewingDayCount += semantics.viewingDayCount;
      total.replayCount += semantics.replayCount;
      if (semantics.replayReason) total.replayReason = semantics.replayReason;
      if (semantics.latestObservedAt && (!total.latestObservedAt || semantics.latestObservedAt > total.latestObservedAt)) {
        total.latestObservedAt = semantics.latestObservedAt;
      }
      const user = byUserId.get(bucket.userId) ?? {
        observationCount: 0,
        sessionCount: 0,
        viewingDayCount: 0,
        replayCount: 0,
        replayReason: null,
        latestObservedAt: null
      };
      user.observationCount += semantics.observationCount;
      user.sessionCount += semantics.sessionCount;
      user.viewingDayCount += semantics.viewingDayCount;
      user.replayCount += semantics.replayCount;
      if (semantics.replayReason) user.replayReason = semantics.replayReason;
      if (semantics.latestObservedAt && (!user.latestObservedAt || semantics.latestObservedAt > user.latestObservedAt)) {
        user.latestObservedAt = semantics.latestObservedAt;
      }
      byUserId.set(bucket.userId, user);
    }
    return { total, byUserId };
  }

  private getCanonicalMovieHistory(identity: DashboardDetailIdentity & { kind: "movie" }): DashboardMovieHistory {
    const canonicalGuid = this.currentMovieGuid(identity.ratingKey);
    const directRows = this.db.prepare(`
      SELECT po.id, po.user_id AS userId, po.rating_key AS ratingKey, po.watched_at AS watchedAt,
        po.percent_complete AS percentComplete, po.view_offset AS viewOffset, po.duration, po.completed,
        po.watched_at_provenance AS watchedAtProvenance,
        COALESCE(NULLIF(u.dashboard_alias, ''), u.plex_username) AS displayName
      FROM playback_observations po
      JOIN users u ON u.id = po.user_id
      LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key
      WHERE COALESCE(u.dashboard_shown, u.enabled) = 1
        AND ${this.detailIdentityWhere(identity)}
      ORDER BY po.watched_at DESC, po.id DESC
      LIMIT ?
    `).all(...this.detailIdentityArgs(identity), MOVIE_HISTORY_OBSERVATION_LIMIT + 1) as any[];
    const directLimited = directRows.length > MOVIE_HISTORY_OBSERVATION_LIMIT;
    const observations = directRows.slice(0, MOVIE_HISTORY_OBSERVATION_LIMIT);
    const archiveRows = this.archiveService.queryMovieHistory(identity.ratingKey, canonicalGuid ?? undefined, MOVIE_HISTORY_OBSERVATION_LIMIT, this.includePlexPlayHistory);
    const directObservationKeys = new Set(observations.map((row) => `${Number(row.userId)}:${String(row.watchedAt)}`));
    const recoveredArchiveRows = archiveRows.filter((row) => !directObservationKeys.has(`${row.userId}:${row.eventTime}`));
    const groups = new Map<string, DashboardMovieHistoryRow>();
    const eligibleRatingKeys = new Set<string>(getMovieIdentityKeys(this.db, identity.ratingKey));
    const evidenceTimestamps: string[] = [];
    const directEvidenceByDay = new Map<string, ReplayObservation[]>();
    const directEvidenceByUser = new Map<number, ReplayObservation[]>();

    for (const row of observations) {
      const userId = Number(row.userId);
      if (!Number.isInteger(userId) || typeof row.watchedAt !== "string") continue;
      eligibleRatingKeys.add(String(row.ratingKey));
      evidenceTimestamps.push(row.watchedAt);
      const localDate = this.householdLocalDate(row.watchedAt);
      const key = `${userId}:${localDate}`;
      const replayObservation = this.replayObservation(row, Number(row.completed) === 1);
      const dayEvidence = directEvidenceByDay.get(key) ?? [];
      dayEvidence.push(replayObservation);
      directEvidenceByDay.set(key, dayEvidence);
      const userEvidence = directEvidenceByUser.get(userId) ?? [];
      userEvidence.push(replayObservation);
      directEvidenceByUser.set(userId, userEvidence);
      const percentValue = row.percentComplete == null ? null : Number(row.percentComplete);
      const percent = Number.isFinite(percentValue) ? Math.max(0, Math.min(100, Math.round(percentValue as number))) : null;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          userId,
          displayName: String(row.displayName),
          localDate,
          latestWatchedAt: row.watchedAt,
          state: Number(row.completed) === 1 ? "completed" : "partial",
          strongestPercent: percent,
          observationCount: 1,
          sessionCount: 0,
          replayCount: 0,
          evidenceKind: "direct_observation",
          sourceLabel: row.watchedAtProvenance === "plex_historical_last_view" ? "Plex historical last-view" : undefined
        });
        continue;
      }
      existing.observationCount += 1;
      if (row.watchedAt > existing.latestWatchedAt) existing.latestWatchedAt = row.watchedAt;
      if (Number(row.completed) === 1) existing.state = "completed";
      if (percent != null && (existing.strongestPercent == null || percent > existing.strongestPercent)) existing.strongestPercent = percent;
      if (row.watchedAtProvenance === "plex_historical_last_view") existing.sourceLabel = "Includes Plex historical last-view";
    }

    for (const row of recoveredArchiveRows) {
      const localDate = this.householdLocalDate(row.eventTime);
      const key = `${row.userId}:${localDate}`;
      const replayObservation = this.replayObservation({
        watchedAt: row.eventTime,
        completed: true,
        watchedAtProvenance: "plex_historical_last_view"
      }, true);
      const dayEvidence = directEvidenceByDay.get(key) ?? [];
      dayEvidence.push(replayObservation);
      directEvidenceByDay.set(key, dayEvidence);
      const userEvidence = directEvidenceByUser.get(row.userId) ?? [];
      userEvidence.push(replayObservation);
      directEvidenceByUser.set(row.userId, userEvidence);
      evidenceTimestamps.push(row.eventTime);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          userId: row.userId,
          displayName: row.displayName,
          localDate,
          latestWatchedAt: row.eventTime,
          state: "completed",
          strongestPercent: 100,
          observationCount: 1,
          sessionCount: 0,
          replayCount: 0,
          evidenceKind: "direct_observation",
          sourceLabel: "Plex archive recovery"
        });
        continue;
      }
      existing.observationCount += 1;
      existing.state = "completed";
      existing.strongestPercent = existing.strongestPercent == null ? 100 : Math.max(existing.strongestPercent, 100);
      if (row.eventTime > existing.latestWatchedAt) existing.latestWatchedAt = row.eventTime;
      existing.sourceLabel = existing.sourceLabel ? "Includes Plex archive recovery" : "Plex archive recovery";
    }

    for (const [key, replayObservations] of directEvidenceByDay.entries()) {
      const row = groups.get(key);
      if (!row) continue;
      const semantics = evaluateReplaySemantics(replayObservations);
      row.sessionCount = semantics.sessionCount;
      row.replayCount = semantics.replayCount;
    }

    const keys = [...eligibleRatingKeys].slice(0, 250);
    if (keys.length) {
      const placeholders = keys.map(() => "?").join(",");
      const confirmedRows = this.db.prepare(`
        SELECT cc.target_user_id AS userId, we.watched_at AS watchedAt,
          COALESCE(NULLIF(u.dashboard_alias, ''), u.plex_username) AS displayName
        FROM cowatch_confirmations cc
        JOIN watch_events we ON we.id = cc.watch_event_id
        JOIN users u ON u.id = cc.target_user_id
        WHERE cc.status = 'confirmed'
          AND COALESCE(u.dashboard_shown, u.enabled) = 1
          AND we.rating_key IN (${placeholders})
        ORDER BY we.watched_at DESC, cc.id DESC
        LIMIT 1000
      `).all(...keys) as any[];
      for (const row of confirmedRows) {
        const userId = Number(row.userId);
        if (!Number.isInteger(userId) || typeof row.watchedAt !== "string") continue;
        evidenceTimestamps.push(row.watchedAt);
        const localDate = this.householdLocalDate(row.watchedAt);
        const key = `${userId}:${localDate}`;
        const existing = groups.get(key);
        if (existing) {
          if (existing.evidenceKind === "attributed_confirmed" && row.watchedAt > existing.latestWatchedAt) existing.latestWatchedAt = row.watchedAt;
          continue;
        }
        groups.set(key, {
          userId,
          displayName: String(row.displayName),
          localDate,
          latestWatchedAt: row.watchedAt,
          state: "confirmed",
          strongestPercent: null,
          observationCount: 0,
          sessionCount: 0,
          replayCount: 0,
          evidenceKind: "attributed_confirmed"
        });
      }
    }

    const peopleOrder = new Map(this.visibleDashboardPeople().map((person, index) => [person.userId, index]));
    const allRows = [...groups.values()].sort((a, b) =>
      b.localDate.localeCompare(a.localDate)
      || (peopleOrder.get(a.userId) ?? Number.MAX_SAFE_INTEGER) - (peopleOrder.get(b.userId) ?? Number.MAX_SAFE_INTEGER)
      || b.latestWatchedAt.localeCompare(a.latestWatchedAt)
      || a.userId - b.userId
    );
    const peopleMap = new Map<number, string>();
    for (const row of allRows) peopleMap.set(row.userId, row.displayName);
    const people = [...peopleMap.entries()]
      .map(([id, displayName]) => ({ id, displayName }))
      .sort((a, b) => (peopleOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (peopleOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.displayName.localeCompare(b.displayName));
    const timestamps = evidenceTimestamps.sort();
    const directReplaySummary = [...directEvidenceByUser.values()].reduce<ReplaySemantics>((summary, replayObservations) => {
      const semantics = evaluateReplaySemantics(replayObservations);
      summary.observationCount += semantics.observationCount;
      summary.sessionCount += semantics.sessionCount;
      summary.viewingDayCount += semantics.viewingDayCount;
      summary.replayCount += semantics.replayCount;
      if (semantics.replayReason) summary.replayReason = semantics.replayReason;
      if (semantics.latestObservedAt && (!summary.latestObservedAt || semantics.latestObservedAt > summary.latestObservedAt)) {
        summary.latestObservedAt = semantics.latestObservedAt;
      }
      return summary;
    }, { observationCount: 0, sessionCount: 0, viewingDayCount: 0, replayCount: 0, replayReason: null, latestObservedAt: null });
    const movieKeys = getMovieIdentityKeys(this.db, identity.ratingKey);
    const movieKeyPlaceholders = movieKeys.map(() => "?").join(",");
    const catalog = this.db.prepare(`SELECT duration FROM content_catalog WHERE rating_key IN (${movieKeyPlaceholders}) ORDER BY CASE WHEN rating_key = ? THEN 0 ELSE 1 END LIMIT 1`).get(...movieKeys, identity.ratingKey) as any;
    const duration = Number(catalog?.duration);
    return {
      canonicalGuid,
      runtimeMinutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration / 60_000) : null,
      people,
      summary: {
        rawObservationCount: observations.length + recoveredArchiveRows.length,
        sessionCount: directReplaySummary.sessionCount,
        viewingDayCount: allRows.length,
        replayCount: directReplaySummary.replayCount,
        replayReason: directReplaySummary.replayReason,
        completedViewingDayCount: allRows.filter((row) => row.state === "completed").length,
        distinctViewerCount: people.length,
        firstViewedAt: timestamps[0] ?? null,
        latestViewedAt: timestamps[timestamps.length - 1] ?? null
      },
      rows: allRows.slice(0, MOVIE_HISTORY_ROW_LIMIT),
      rowsLimited: directLimited || allRows.length > MOVIE_HISTORY_ROW_LIMIT
    };
  }

  private getDetailWorkspaceMetadata(identity: DashboardDetailIdentity): ({ title: string; subtitle: string | null } & DashboardArtworkDescriptor) | null {
    const artworkRoutes = (key: string) => buildDashboardArtworkDescriptor(this.db, key);
    if (identity.kind === "audiobook") {
      const book = this.db.prepare(`SELECT title, subtitle FROM audiobook_books WHERE id = ?`).get(identity.audiobookId) as any;
      if (!book) return null;
      return { title: book.title, subtitle: book.subtitle ?? null, ...artworkRoutes(identity.detailKey) };
    }
    const key = identity.kind === "movie" ? identity.ratingKey : identity.grandparentRatingKey;
    const catalog = identity.kind === "movie"
      ? (() => {
        const keys = getMovieIdentityKeys(this.db, key);
        const placeholders = keys.map(() => "?").join(",");
        return this.db.prepare(`
          SELECT title, library_title, grandparent_title
          FROM content_catalog
          WHERE rating_key IN (${placeholders})
          ORDER BY CASE WHEN rating_key = ? THEN 0 ELSE 1 END, rating_key
          LIMIT 1
        `).get(...keys, key) as any;
      })()
      : this.db.prepare(`
        SELECT title, library_title, grandparent_title
        FROM content_catalog
        WHERE rating_key = ? OR grandparent_rating_key = ?
        ORDER BY CASE WHEN rating_key = ? THEN 0 ELSE 1 END, rating_key
        LIMIT 1
      `).get(key, key, key) as any;
    const catalogTitle = typeof catalog?.title === "string" ? catalog.title.trim() : "";
    if (catalog && catalogTitle && !/^Unknown Media \(/i.test(catalogTitle)) {
      return { title: catalogTitle || catalog.grandparent_title || key, subtitle: catalog.library_title ?? null, ...artworkRoutes(key) };
    }
    const observation = identity.kind === "movie"
      ? (() => {
        const keys = getMovieIdentityKeys(this.db, key);
        const placeholders = keys.map(() => "?").join(",");
        const guid = getMovieIdentityGuid(this.db, key);
        return this.db.prepare(`
          SELECT title, show_title, library_name
          FROM playback_observations
          WHERE rating_key IN (${placeholders})${guid ? " OR plex_guid = ?" : ""}
          ORDER BY watched_at DESC, id DESC LIMIT 1
        `).get(...keys, ...(guid ? [guid] : [])) as any;
      })()
      : this.db.prepare(`SELECT title, show_title, library_name FROM playback_observations WHERE rating_key = ? OR grandparent_rating_key = ? ORDER BY watched_at DESC LIMIT 1`).get(key, key) as any;
    const observationTitle = typeof observation?.title === "string" ? observation.title.trim() : "";
    if (observation && observationTitle && !/^Unknown Media \(/i.test(observationTitle)) {
      return { title: identity.kind === "series" ? (observation.show_title || observation.title) : observation.title, subtitle: observation.library_name ?? null, ...artworkRoutes(identity.kind === "series" ? identity.detailKey.replace(/^series:[^:]+:/, "") : key) };
    }
    if (identity.kind === "movie") {
      const archive = this.db.prepare(`
        SELECT am.title, am.year
        FROM archive_media am
        JOIN archive_media_aliases aa ON aa.archive_media_id = am.id
        WHERE aa.alias_type = 'rating_key' AND aa.alias_value = ?
        ORDER BY CASE WHEN am.status = 'resolved' THEN 0 ELSE 1 END, am.updated_at DESC, am.id DESC
        LIMIT 1
      `).get(key) as any;
      if (archive?.title) return { title: archive.title, subtitle: null, ...artworkRoutes(key) };
    }
    if (catalog) return { title: catalog.title || catalog.grandparent_title || key, subtitle: catalog.library_title ?? null, ...artworkRoutes(key) };
    if (!observation) return null;
    return { title: identity.kind === "series" ? (observation.show_title || observation.title) : observation.title, subtitle: observation.library_name ?? null, ...artworkRoutes(identity.kind === "series" ? identity.detailKey.replace(/^series:[^:]+:/, "") : key) };
  }

  private getDetailProgressSummary(
    identity: DashboardDetailIdentity,
    metadata: any,
    completedItems: number,
    latestPercent: unknown,
    audiobookProgress: AudiobookChapterProgressSnapshot | null = null
  ) {
    let unit: "episode" | "movie" | "track" | "chapter" = identity.kind === "movie" ? "movie" : identity.kind === "series" ? "episode" : "track";
    let source: "plex" | "audiobook_tool" = identity.kind === "audiobook" ? "plex" : "plex";
    let sourceVerified = identity.kind !== "audiobook";
    let totalItems: number | null = identity.kind === "movie" ? 1 : null;
    let resolvedCompletedItems = completedItems;
    let resolvedLatestPercent = latestPercent;
    if (identity.kind === "series") {
      const row = this.db.prepare(`SELECT leaf_count FROM content_catalog WHERE rating_key = ? LIMIT 1`).get(identity.grandparentRatingKey) as any;
      totalItems = row?.leaf_count > 0 ? row.leaf_count : null;
    } else if (identity.kind === "audiobook") {
      const verified = audiobookProgress?.hasVerifiedChapters ?? (this.getActiveAudiobookChapterSource(identity.audiobookId) !== null);
      if (verified) {
        unit = "chapter";
        source = "audiobook_tool";
        sourceVerified = true;
        const row = this.db.prepare(`SELECT COUNT(*) AS count FROM audiobook_chapters WHERE audiobook_id = ?`).get(identity.audiobookId) as any;
        const chapterCount = audiobookProgress?.chapters.length ?? Number(row?.count ?? 0);
        totalItems = chapterCount || null;
        resolvedCompletedItems = audiobookProgress?.distinctCompleted ?? resolvedCompletedItems;
        resolvedLatestPercent = audiobookProgress?.currentProgressPercent ?? resolvedLatestPercent;
      } else {
        const row = this.db.prepare(`SELECT chapter_count FROM audiobook_books WHERE id = ?`).get(identity.audiobookId) as any;
        totalItems = row?.chapter_count > 0 ? row.chapter_count : null;
      }
    }
    const percent = resolvedLatestPercent == null ? null : Math.max(0, Math.min(100, Math.round(Number(resolvedLatestPercent))));
    return { unit, source, sourceVerified, completedItems: resolvedCompletedItems, currentPercent: Number.isFinite(percent as number) ? percent : null, totalItems };
  }

  private legacyProgressGroupKey(identity: DashboardDetailIdentity): string {
    if (identity.kind === "audiobook") return `audiobook:Audiobooks:${identity.audiobookId}`;
    const key = identity.kind === "movie" ? getCanonicalMovieRatingKey(this.db, identity.ratingKey) : identity.grandparentRatingKey;
    const row = this.db.prepare(`SELECT library_title FROM content_catalog WHERE rating_key = ? LIMIT 1`).get(key) as any;
    const library = row?.library_title || (identity.kind === "movie" ? "Movies" : "TV Shows");
    if (identity.kind === "movie") return `movie:${library}:${key}`;
    return `series:${identity.category}:${library}:${key}`;
  }

  getActivity(input: unknown): { items: DashboardActivityItem[]; total: number; limit: number; offset: number } {
    const p = parseFilters(input);
    let where = " WHERE COALESCE(u.dashboard_shown, u.enabled) = 1";
    const args: any[] = [];
    if (p.dateFrom) { where += " AND po.watched_at >= ?"; args.push(new Date(p.dateFrom).toISOString()); }
    if (p.dateTo) { where += " AND po.watched_at <= ?"; args.push(new Date(p.dateTo).toISOString()); }
    if (p.user) { where += " AND u.plex_username = ?"; args.push(p.user); }
    if (p.ratingKey) {
      const movieKeys = getMovieIdentityKeys(this.db, p.ratingKey);
      const placeholders = movieKeys.map(() => "?").join(",");
      where += ` AND po.rating_key IN (${placeholders})`;
      args.push(...movieKeys);
    }
    if (p.grandparentRatingKey) { where += " AND (po.grandparent_rating_key = ? OR po.rating_key = ?)"; args.push(p.grandparentRatingKey, p.grandparentRatingKey); }
    if (p.audiobookId) { where += " AND cat.audiobook_id = ?"; args.push(p.audiobookId); }
    if (p.library) { where += " AND COALESCE(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) = ?"; args.push(p.library); }
    if (p.completed !== undefined) { where += " AND po.completed = ?"; args.push(p.completed ? 1 : 0); }
    if (p.search) { where += " AND (po.title LIKE ? OR po.show_title LIKE ?)"; args.push(`%${p.search}%`, `%${p.search}%`); }

    const categorySql = `CASE WHEN lower(po.media_type)='audiobook' OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%audiobook%' THEN 'audiobook' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%anime%' THEN 'anime' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%classic%' THEN 'classic_tv' WHEN lower(po.media_type)='movie' AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title))='movies') THEN 'movie' WHEN lower(po.media_type) IN ('episode', 'show', 'season') AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title)) IN ('tv shows','etv','jdrama')) THEN 'tv' ELSE 'other' END`;
    where += ` AND ${categorySql} != 'other'`;
    if (p.category) { where += ` AND ${categorySql} = ?`; args.push(p.category); }
    const from = ` FROM playback_observations po JOIN users u ON u.id=po.user_id LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key LEFT JOIN audiobook_books ab ON ab.id=cat.audiobook_id LEFT JOIN watch_events we ON we.rating_key=po.rating_key AND we.source_user_id=po.user_id AND we.watched_at >= strftime('%Y-%m-%dT%H:%M:%fZ', po.watched_at, '-600 seconds') AND we.watched_at <= strftime('%Y-%m-%dT%H:%M:%fZ', po.watched_at, '+600 seconds') LEFT JOIN cowatch_confirmations cc ON cc.watch_event_id=we.id AND cc.target_user_id=po.user_id`;
    const directTotal = Number((this.db.prepare(`SELECT count(*) total${from}${where}`).get(...args) as any).total);
    const order = p.sort === "title" ? "po.title COLLATE NOCASE, po.rating_key, po.watched_at DESC, po.id DESC" : p.sort === "progress" ? "po.percent_complete DESC, po.watched_at DESC, po.id DESC" : "po.watched_at DESC, po.id DESC";
    const confirmedUserFilter = p.user ? " AND confirmed_user.plex_username = ?" : "";
    const confirmedArgs = p.user ? [p.user] : [];
    const confirmedParticipantsSql = `(SELECT json_group_array(json_object('userId', confirmed_user.id, 'displayName', COALESCE(NULLIF(confirmed_user.dashboard_alias, ''), confirmed_user.plex_username))) FROM cowatch_confirmations confirmed JOIN users confirmed_user ON confirmed_user.id=confirmed.target_user_id WHERE confirmed.watch_event_id=we.id AND confirmed.status='confirmed' AND COALESCE(confirmed_user.dashboard_shown, confirmed_user.enabled)=1${confirmedUserFilter}) AS confirmed_participants_json`;
    const plexHistoryLinkedSql = this.includePlexPlayHistory
      ? `EXISTS(SELECT 1 FROM archive_observation_links historyLink JOIN archive_watch_events historyEvent ON historyEvent.id=historyLink.archive_event_id WHERE historyLink.playback_observation_id=po.id AND historyLink.relation IN ('same_event','duplicate') AND historyEvent.source='plex_api_history')`
      : "0";
    const candidateLimit = Math.min(100_000, p.offset + p.limit);
    const directRows = this.db.prepare(`SELECT po.*,u.plex_username,u.display_name AS synced_display_name,u.dashboard_alias,u.dashboard_shown,we.prompt_status,cc.status confirmation_status,cc.plex_sync_status,cat.library_title AS catalog_library_title,groupcat.library_title AS group_catalog_library_title,cat.audiobook_id AS audiobook_id,ab.title AS audiobook_title,cat.parent_title AS catalog_parent_title,cat.grandparent_title AS catalog_grandparent_title,${plexHistoryLinkedSql} AS plex_history_linked,${confirmedParticipantsSql}${from}${where} ORDER BY ${order} LIMIT ? OFFSET 0`).all(...confirmedArgs, ...args, candidateLimit) as any[];
    const archiveRows = this.archiveService.queryDashboardActivity(100_000, this.includePlexPlayHistory)
      .filter((row) => this.archiveActivityMatchesFilters(row, p));
    const rows = [...directRows, ...archiveRows]
      .sort((a, b) => {
        if (p.sort === "title") {
          return String(a.title ?? "").localeCompare(String(b.title ?? ""), undefined, { sensitivity: "base" })
            || String(a.rating_key ?? "").localeCompare(String(b.rating_key ?? ""), undefined, { sensitivity: "base" })
            || String(b.watched_at ?? "").localeCompare(String(a.watched_at ?? ""))
            || Number(b.id) - Number(a.id);
        }
        if (p.sort === "progress") {
          return Number(b.percent_complete ?? -1) - Number(a.percent_complete ?? -1)
            || String(b.watched_at ?? "").localeCompare(String(a.watched_at ?? ""))
            || Number(b.id) - Number(a.id);
        }
        return String(b.watched_at ?? "").localeCompare(String(a.watched_at ?? "")) || Number(b.id) - Number(a.id);
      })
      .slice(p.offset, p.offset + p.limit);
    const total = directTotal + archiveRows.length;

    const cowatchMap = new Map<number, { event: any; participant: any }>();
    if (rows.length > 0) {
      let minDate = rows[0].watched_at;
      let maxDate = rows[0].watched_at;
      for (const row of rows) {
        if (row.watched_at < minDate) minDate = row.watched_at;
        if (row.watched_at > maxDate) maxDate = row.watched_at;
      }
      const dateFrom = new Date(new Date(minDate).getTime() - 3 * 3600 * 1000).toISOString();
      const dateTo = new Date(new Date(maxDate).getTime() + 3 * 3600 * 1000).toISOString();
      const cowatchEvents = this.cowatchingService.getCowatchingEvents({ dateFrom, dateTo });
      for (const ev of cowatchEvents) {
        for (const part of ev.participants) {
          if (part.supportingObservationIds) {
            for (const obsId of part.supportingObservationIds) {
              cowatchMap.set(obsId, { event: ev, participant: part });
            }
          }
        }
      }
    }

    const items = rows.map((row) => this.mapActivity(row, cowatchMap)).filter(Boolean) as DashboardActivityItem[];
    return { items, total, limit: p.limit, offset: p.offset };
  }

  recordArchiveIdentityDecision(input: {
    archiveMediaId: number;
    decision: "assign" | "unrelated" | "unresolved";
    targetRatingKey?: string | null;
    actor: string;
    reason?: string | null;
  }): { ok: true; data: unknown } | { ok: false; errorCode: string; message: string } {
    const result = this.archiveService.recordIdentityDecision(input);
    if ("ok" in result && result.ok === false) {
      return { ok: false, errorCode: result.code, message: result.message };
    }
    return { ok: true, data: result };
  }

  private archiveActivityMatchesFilters(row: { user_id: number; plex_username: string; rating_key: string; grandparent_rating_key?: string | null; media_type: string; title: string; library_name?: string | null; watched_at: string; completed: number }, p: ReturnType<typeof parseFilters>): boolean {
    if (p.dateFrom && row.watched_at < new Date(p.dateFrom).toISOString()) return false;
    if (p.dateTo && row.watched_at > new Date(p.dateTo).toISOString()) return false;
    if (p.user && row.plex_username !== p.user) return false;
    if (p.ratingKey && row.rating_key !== p.ratingKey) return false;
    if (p.grandparentRatingKey && row.grandparent_rating_key !== p.grandparentRatingKey && row.rating_key !== p.grandparentRatingKey) return false;
    if (p.audiobookId) return false;
    if (p.library && row.library_name !== p.library) return false;
    if (p.completed !== undefined && row.completed !== (p.completed ? 1 : 0)) return false;
    if (p.search && !String(row.title ?? "").toLocaleLowerCase().includes(p.search.toLocaleLowerCase())) return false;
    const category = deriveDashboardCategory(row.media_type, row.library_name ?? undefined).category;
    return isHouseholdCategory(category) && (!p.category || p.category === category);
  }

  getContinueWatching(input: unknown) {
    return this.getContinueConsuming({ ...(input as object), offset: 0 }).items;
  }

  getContinueConsuming(input: unknown) {
    const p = parseFilters(input);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const all = this.getActivity({ ...(input as object), limit: SUMMARY_SAMPLE_LIMIT, offset: 0, sort: "recent" }).items;
    const groups = new Map<string, any>();
    for (const item of all) {
      if (!isRecognizedExplorerItem(item) || item.completed) continue;
      if (item.watchedAt < thirtyDaysAgo) continue;
      const key = explorerGroupKey(item);
      const group = groups.get(key) ?? {
        ...item,
        displayTitle: explorerTitle(item),
        groupKey: key,
        plays: 0,
        distinctItems: new Set<string>(),
        people: new Set<number>(),
        displayNames: new Set<string>(),
        latestWatchedAt: item.watchedAt
      };
      group.plays += 1;
      group.distinctItems.add(item.ratingKey);
      group.people.add(item.userId);
      for (const userId of item.confirmedUserIds ?? []) group.people.add(userId);
      const displayNames = group.displayNames as Set<string>;
      for (const displayName of item.displayNames ?? [item.displayName]) {
        if (displayName) displayNames.add(displayName);
      }
      if (item.watchedAt >= group.latestWatchedAt) {
        Object.assign(group, item, {
          displayTitle: explorerTitle(item),
          groupKey: key,
          latestWatchedAt: item.watchedAt
        });
        group.displayNames = displayNames;
      }
      groups.set(key, group);
    }
    const items = [...groups.values()]
      .map((group) => ({
        ...group,
        distinctItems: group.distinctItems.size,
        people: [...group.people],
        displayNames: [...group.displayNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      }))
      .sort((a, b) => compareExplorerItems(a, b, p.sort));
    return { items: items.slice(p.offset, p.offset + p.limit), total: items.length, limit: p.limit, offset: p.offset };
  }

  getOverview(input: unknown) {
    const timed = withTiming(() => {
      const filters = parseFilters(input);
      const baseActivity = this.getActivity({ ...(input as object), limit: 48, offset: 0 });
      const all = this.getActivity({ ...(input as object), limit: SUMMARY_SAMPLE_LIMIT, offset: 0 }).items;
      const users = this.db.prepare(`
        SELECT
          id,
          plex_username,
          COALESCE(NULLIF(dashboard_alias, ''), plex_username) AS display_name,
          COALESCE(dashboard_shown, enabled) AS shown,
          enabled,
          is_source_user
        FROM users
        WHERE COALESCE(dashboard_shown, enabled) = 1
        ORDER BY COALESCE(NULLIF(dashboard_alias, ''), plex_username), id
      `).all() as any[];

      const categoryStats = new Map<string, { category: string; plays: number; duration: number; completed: number }>();
      const topTitlesMap = new Map<string, any>();
      const heatmaps = new Map<number, number[]>();
      const recentCompletedMap = new Map<string, DashboardActivityItem>();
      const householdActivityMap = new Map<number, {
        userId: number;
        plexUsername: string;
        displayName: string;
        minutes: number;
        completed: number;
        inProgress: number;
        latestWatchedAt: string;
        latestItemTitle: string;
        latestRatingKey: string;
        latestCategory: DashboardCategory;
        topCategoryCounts: Record<string, number>;
      }>();
      let earliestDay: string | null = null;
      let latestDay: string | null = null;

      for (const item of all) {
        const cat = item.category;
        const stat = categoryStats.get(cat) ?? { category: cat, plays: 0, duration: 0, completed: 0 };
        stat.plays++;
        stat.duration += normalizeDurationSeconds(item.duration);
        if (item.completed) stat.completed++;
        categoryStats.set(cat, stat);

        if (isRecognizedExplorerItem(item)) {
          const key = explorerGroupKey(item);
          const titleStat = topTitlesMap.get(key) ?? { category: cat, title: explorerTitle(item), duration: 0, lastActivityAt: item.watchedAt };
          titleStat.duration += normalizeDurationSeconds(item.duration);
          if (item.watchedAt > titleStat.lastActivityAt) titleStat.lastActivityAt = item.watchedAt;
          topTitlesMap.set(key, titleStat);
        }

        const date = new Date(item.watchedAt);
        const day = (date.getDay() + 6) % 7;
        const userHeatmap = heatmaps.get(item.userId) ?? [0, 0, 0, 0, 0, 0, 0];
        userHeatmap[day] += minutesFromDuration(item.duration);
        heatmaps.set(item.userId, userHeatmap);

        const watchedDay = isoDay(item.watchedAt);
        if (!earliestDay || watchedDay < earliestDay) earliestDay = watchedDay;
        if (!latestDay || watchedDay > latestDay) latestDay = watchedDay;

        if (item.completed) {
          const key = explorerGroupKey(item);
          if (!recentCompletedMap.has(key)) {
            recentCompletedMap.set(key, { ...item, displayTitle: explorerTitle(item) });
          }
        }

        const household = householdActivityMap.get(item.userId) ?? {
          userId: item.userId,
          plexUsername: item.username,
          displayName: item.displayName,
          minutes: 0,
          completed: 0,
          inProgress: 0,
          latestWatchedAt: item.watchedAt,
          latestItemTitle: item.displayTitle ?? item.title,
          latestRatingKey: item.ratingKey,
          latestCategory: item.category,
          topCategoryCounts: {}
        };
        household.minutes += minutesFromDuration(item.duration);
        household.topCategoryCounts[item.category] = (household.topCategoryCounts[item.category] ?? 0) + 1;
        if (item.completed) household.completed += 1;
        else household.inProgress += 1;
        if (item.watchedAt >= household.latestWatchedAt) {
          household.latestWatchedAt = item.watchedAt;
          household.latestItemTitle = item.displayTitle ?? item.title;
          household.latestRatingKey = item.ratingKey;
          household.latestCategory = item.category;
        }
        householdActivityMap.set(item.userId, household);
      }

      const statsList = [...categoryStats.values()].map((s) => ({
        ...s,
        durationHours: hoursFromSeconds(s.duration),
        durationMinutes: minutesFromSeconds(s.duration),
        completionRate: s.plays > 0 ? Math.round((s.completed / s.plays) * 100) : 0
      }));

      const topTitlesByCategory = new Map<string, any[]>();
      for (const stat of topTitlesMap.values()) {
        const list = topTitlesByCategory.get(stat.category) ?? [];
        list.push(stat);
        topTitlesByCategory.set(stat.category, list);
      }
      for (const [cat, list] of topTitlesByCategory.entries()) {
        list.sort((a, b) => b.duration - a.duration);
        topTitlesByCategory.set(cat, list.slice(0, 5));
      }

      const pending = this.db.prepare("SELECT count(*) count FROM watch_events WHERE prompt_status='pending'").get() as any;
      const currentWindow = {
        start: filters.dateFrom ? isoDay(new Date(filters.dateFrom).toISOString()) : earliestDay,
        end: filters.dateTo ? isoDay(new Date(filters.dateTo).toISOString()) : latestDay
      };
      const summaryStrip = HOUSEHOLD_CATEGORIES.map((category) => {
        const stat = categoryStats.get(category);
        const deltaMinutes = this.getOverviewDeltaMinutes(filters, category);
        return {
          category,
          label: category === "movie"
            ? "Movies"
            : category === "tv"
              ? "TV"
              : category === "classic_tv"
                ? "Classic TV"
                : category === "anime"
                  ? "Anime"
                  : "Audiobooks",
          minutes: minutesFromSeconds(stat?.duration ?? 0),
          plays: stat?.plays ?? 0,
          completed: stat?.completed ?? 0,
          deltaMinutes
        };
      });

      const recentPlayback = this.buildRecentPlaybackCards(all, 24);
      const householdActivity = [...householdActivityMap.values()]
        .map((item) => ({
          ...item,
          topCategory: Object.entries(item.topCategoryCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
        }))
        .sort((a, b) => b.minutes - a.minutes || b.latestWatchedAt.localeCompare(a.latestWatchedAt))
        .slice(0, OVERVIEW_ACTIVITY_LIMIT);

      const recentlyCompleted = [...recentCompletedMap.values()]
        .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
        .slice(0, OVERVIEW_COMPLETED_LIMIT);

      const needsAttention = this.getNeedsAttention().slice(0, OVERVIEW_ATTENTION_LIMIT);
      const comparableWindowLabel = buildWindowLabel(currentWindow.start, currentWindow.end);
      return {
        activity: baseActivity,
        recentPlayback,
        totals: { plays: baseActivity.total, people: new Set(all.map((item) => item.userId)).size, minutes: minutesFromSeconds(all.reduce((minutes, item) => minutes + normalizeDurationSeconds(item.duration), 0)), pendingPrompts: Number(pending.count) },
        categories: [...categoryStats.values()].map(s => ({ category: s.category, count: s.plays })),
        users,
        libraries: [...new Set(all.map((item) => item.libraryName).filter(Boolean))].sort(),
        continueWatching: this.getContinueWatching({ ...(input as object), limit: OVERVIEW_CONTINUE_LIMIT }),
        categoryStats: statsList,
        topTitles: Object.fromEntries(topTitlesByCategory),
        heatmaps: Object.fromEntries(heatmaps),
        summaryStrip,
        recentlyCompleted,
        householdActivity,
        needsAttention,
        categoryMix: statsList,
        windows: {
          overview: comparableWindowLabel,
          continueWatching: "Recent incomplete playback from the last 30 days",
          recentlyCompleted: comparableWindowLabel,
          categoryMix: comparableWindowLabel,
          householdActivity: comparableWindowLabel,
          needsAttention: "Only actions that need you"
        }
      };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  private getOverviewDeltaMinutes(
    filters: ReturnType<typeof parseFilters>,
    category: DashboardCategory
  ): number | null {
    if (!filters.dateFrom || !filters.dateTo) return null;
    const start = new Date(filters.dateFrom);
    const end = new Date(filters.dateTo);
    const spanMs = end.getTime() - start.getTime();
    if (!Number.isFinite(spanMs) || spanMs <= 0) return null;

    const previousEnd = new Date(start.getTime());
    previousEnd.setMilliseconds(previousEnd.getMilliseconds() - 1);
    const previousStart = new Date(previousEnd.getTime() - spanMs);
    const previous = this.getActivity({
      ...filters,
      category,
      dateFrom: previousStart.toISOString(),
      dateTo: previousEnd.toISOString(),
      limit: SUMMARY_SAMPLE_LIMIT,
      offset: 0
    }).items;
    if (!previous.length) return null;
    const previousMinutes = previous.reduce((sum, item) => sum + minutesFromDuration(item.duration), 0);
    const current = this.getActivity({
      ...filters,
      category,
      limit: SUMMARY_SAMPLE_LIMIT,
      offset: 0
    }).items;
    const currentMinutes = current.reduce((sum, item) => sum + minutesFromDuration(item.duration), 0);
    return currentMinutes - previousMinutes;
  }

  private getNeedsAttention() {
    const items: Array<Record<string, unknown>> = [];

    const unresolvedPrompts = this.db.prepare(`
      SELECT
        we.id,
        we.rating_key,
        we.title,
        we.show_title,
        we.watched_at,
        we.prompt_status,
        u.plex_username,
        COALESCE(NULLIF(u.dashboard_alias, ''), u.plex_username) AS display_name
      FROM watch_events we
      JOIN users u ON u.id = we.source_user_id
      WHERE COALESCE(u.dashboard_shown, u.enabled) = 1
        AND we.prompt_status IN ('pending', 'prompted')
      ORDER BY we.watched_at DESC
      LIMIT 6
    `).all() as any[];

    for (const row of unresolvedPrompts) {
      items.push({
        kind: "unresolved_prompt",
        watchEventId: Number(row.id),
        title: row.show_title || row.title,
        detail: `${row.display_name} still needs a co-watch prompt resolution`,
        status: row.prompt_status,
        watchedAt: row.watched_at,
        ratingKey: row.rating_key,
        user: row.plex_username,
        route: { layout: "people", filters: { user: row.plex_username } }
      });
    }

    const promptErrors = this.db.prepare(`
      SELECT payload_json, error, created_at
      FROM audit_log
      WHERE action = 'create_cowatch_prompt' AND status = 'error'
      ORDER BY created_at DESC
      LIMIT 6
    `).all() as Array<{ payload_json: string; error: string | null; created_at: string }>;
    for (const row of promptErrors) {
      let watchEventId: number | null = null;
      try {
        const payload = JSON.parse(row.payload_json ?? "{}");
        watchEventId = Number(payload.watchEventId ?? 0) || null;
      } catch {
        watchEventId = null;
      }
      if (!watchEventId) continue;
      const event = this.db.prepare(`
        SELECT
          we.rating_key,
          we.title,
          we.show_title,
          u.plex_username,
          COALESCE(NULLIF(u.dashboard_alias, ''), u.plex_username) AS display_name
        FROM watch_events we
        JOIN users u ON u.id = we.source_user_id
        WHERE we.id = ? AND COALESCE(u.dashboard_shown, u.enabled) = 1
      `).get(watchEventId) as any;
      if (!event) continue;
      items.push({
        kind: "discord_delivery_failed",
        watchEventId,
        title: event.show_title || event.title,
        detail: `${event.display_name} had a Discord delivery failure`,
        status: "failed",
        watchedAt: row.created_at,
        ratingKey: event.rating_key,
        user: event.plex_username,
        route: { layout: "people", filters: { user: event.plex_username } }
      });
    }

    const failedSyncs = this.db.prepare(`
      SELECT
        sf.rating_key,
        sf.error,
        sf.created_at,
        u.plex_username,
        COALESCE(NULLIF(u.dashboard_alias, ''), u.plex_username) AS display_name,
        po.title,
        po.show_title
      FROM sync_failures sf
      LEFT JOIN users u ON u.id = sf.target_user_id
      LEFT JOIN playback_observations po ON po.user_id = sf.target_user_id AND po.rating_key = sf.rating_key
      WHERE sf.resolved_at IS NULL
        AND (u.id IS NULL OR COALESCE(u.dashboard_shown, u.enabled) = 1)
      ORDER BY sf.created_at DESC
      LIMIT 6
    `).all() as any[];
    for (const row of failedSyncs) {
      items.push({
        kind: "plex_sync_failed",
        title: row.show_title || row.title || row.rating_key,
        detail: `${row.display_name || "A household member"} has an unresolved Plex sync failure`,
        status: "failed",
        watchedAt: row.created_at,
        ratingKey: row.rating_key,
        user: row.plex_username ?? null,
        route: row.plex_username ? { layout: "people", filters: { user: row.plex_username } } : { layout: "people", filters: {} }
      });
    }

    return items
      .filter((item, index, list) => {
        const route = JSON.stringify(item.route ?? {});
        const key = `${item.kind}:${item.ratingKey ?? item.title}:${item.user ?? ""}:${route}`;
        return list.findIndex((candidate) => {
          const candidateRoute = JSON.stringify(candidate.route ?? {});
          return `${candidate.kind}:${candidate.ratingKey ?? candidate.title}:${candidate.user ?? ""}:${candidateRoute}` === key;
        }) === index;
      })
      .sort((a, b) => String(b.watchedAt ?? "").localeCompare(String(a.watchedAt ?? "")))
      .slice(0, 10);
  }

  getMedia(input: unknown) {
    const timed = withTiming(() => {
      const p = parseFilters(input);
      const all = this.getActivity({ ...(input as object), limit: SUMMARY_SAMPLE_LIMIT, offset: 0, sort: "recent" }).items;
      
      let allowedNames: Set<string> | null = null;
      if (p.user) {
        const u = this.db.prepare("SELECT dashboard_alias, plex_username FROM users WHERE plex_username = ?").get(p.user) as any;
        if (u) {
          allowedNames = new Set([u.dashboard_alias, u.plex_username].filter(Boolean));
        }
      }

      const groups = new Map<string, any>();
      for (const item of all) {
        if (!isRecognizedExplorerItem(item)) continue;
        const key = explorerGroupKey(item);
        const title = explorerTitle(item);
        const groupRatingKey = item.category === "audiobook"
          ? item.parentRatingKey ?? item.grandparentRatingKey ?? item.ratingKey
          : (item.category === "tv" || item.category === "classic_tv" || item.category === "anime")
            ? item.grandparentRatingKey ?? item.ratingKey
            : item.ratingKey;
        const group = groups.get(key) ?? { ...item, title, showTitle: undefined, displayTitle: title, groupKey: key, groupRatingKey, plays: 0, distinctItems: new Set<string>(), people: new Set<number>(), displayNames: new Set<string>(), latestWatchedAt: item.watchedAt, ...this.resolveArtworkDescriptor(item, groupRatingKey), evidence: undefined };
      group.plays += 1;
      group.distinctItems.add(item.ratingKey);
      group.people.add(item.userId);
      for (const userId of item.confirmedUserIds ?? []) group.people.add(userId);
      for (const displayName of item.displayNames ?? [item.displayName]) {
        if (displayName) {
          if (!allowedNames || allowedNames.has(displayName)) {
            group.displayNames.add(displayName);
          }
        }
      }
      if (item.watchedAt >= group.latestWatchedAt) {
        group.latestWatchedAt = item.watchedAt;
          group.ratingKey = item.ratingKey;
          group.displayTitle = title;
          group.title = title;
          group.latestItemTitle = item.title;
          group.mediaType = item.mediaType;
          group.category = item.category;
          group.categoryLabel = item.categoryLabel;
          group.categoryDerived = item.categoryDerived;
          group.libraryName = item.libraryName;
          group.watchedAt = item.watchedAt;
          group.duration = item.duration;
          group.percentComplete = item.percentComplete;
          group.completed = item.completed;
          group.evidence = undefined;
          group.grandparentRatingKey = item.grandparentRatingKey;
          group.parentRatingKey = item.parentRatingKey;
          group.audiobookId = item.audiobookId;
          group.audiobookTitle = item.audiobookTitle;
          group.groupKey = key;
        }
        groups.set(key, group);
      }
      const items = [...groups.values()].map((group) => ({
        ...group,
        distinctItems: group.distinctItems.size,
        people: [...group.people],
        displayNames: [...group.displayNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      })).sort((a, b) => compareExplorerItems(a, b, p.sort));
      return { items: items.slice(p.offset, p.offset + p.limit), total: items.length, limit: p.limit, offset: p.offset };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  getPeople(input: unknown) {
    const timed = withTiming(() => {
      const filters = parseFilters(input);
      const window = this.resolvePeopleWindow(filters);
      const { contributions, sharedSessionsByUserDay } = this.getPeopleContributions(filters, window);
      const users = this.db.prepare(`
        SELECT
          id,
          plex_username,
          dashboard_alias,
          COALESCE(NULLIF(dashboard_alias, ''), plex_username) AS display_name,
          COALESCE(dashboard_shown, enabled) AS shown,
          enabled,
          is_source_user
        FROM users
        WHERE COALESCE(dashboard_shown, enabled) = 1
        ORDER BY COALESCE(NULLIF(dashboard_alias, ''), plex_username), id
      `).all() as any[];
      const identityOwners = new Map<string, Set<number>>();
      for (const user of users) {
        for (const value of [user.plex_username, user.dashboard_alias]) {
          const key = normalizePersonIdentity(value);
          if (!key) continue;
          const owners = identityOwners.get(key) ?? new Set<number>();
          owners.add(Number(user.id));
          identityOwners.set(key, owners);
        }
      }

      const people = users.map((user) => {
        const items = contributions
          .filter((item) => item.userId === user.id)
          .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt) || b.id - a.id);
        const observedItems = items.filter((item) => item.contribution === "observed");
        const attributedItems = items.filter((item) => item.contribution === "attributed_confirmed_together");
        const minutes = minutesFromSeconds(items.reduce((total, item) => total + normalizeDurationSeconds(item.duration), 0));
        const completed = items.filter((item) => item.completed).length;
        const duplicateIds = new Set<number>();
        for (const value of [user.plex_username, user.dashboard_alias]) {
          const owners = identityOwners.get(normalizePersonIdentity(value));
          for (const owner of owners ?? []) if (owner !== Number(user.id)) duplicateIds.add(owner);
        }
        const possibleDuplicates = users
          .filter((candidate) => duplicateIds.has(Number(candidate.id)))
          .map((candidate) => resolveDashboardAlias(candidate.dashboard_alias, candidate.plex_username));
        const activityByDay = new Map<string, { plays: number; minutes: number; observedMinutes: number; attributedMinutes: number }>();
        for (const item of items) {
          const day = isoDay(item.watchedAt);
          const entry = activityByDay.get(day) ?? { plays: 0, minutes: 0, observedMinutes: 0, attributedMinutes: 0 };
          const itemMinutes = minutesFromDuration(item.duration);
          entry.plays += 1;
          entry.minutes += itemMinutes;
          if (item.contribution === "observed") entry.observedMinutes += itemMinutes;
          else entry.attributedMinutes += itemMinutes;
          activityByDay.set(day, entry);
        }
        const heatmap = [];
        const userSharedDays = sharedSessionsByUserDay.get(Number(user.id)) ?? new Map<string, Set<string>>();
        for (let day = window.heatmapStart; day <= window.heatmapEnd && heatmap.length < PEOPLE_MAX_HEATMAP_DAYS; day = addDays(day, 1)) {
          const activity = activityByDay.get(day) ?? { plays: 0, minutes: 0, observedMinutes: 0, attributedMinutes: 0 };
          heatmap.push({ date: day, ...activity, confirmedTogetherSessions: userSharedDays.get(day)?.size ?? 0 });
        }
        const mix = Object.entries(items.reduce<Record<string, number>>((accumulator, item) => {
          accumulator[item.category] = (accumulator[item.category] ?? 0) + 1;
          return accumulator;
        }, {})).map(([category, count]) => ({ category, label: categoryLabelFor(category), count }));
        const status = Number(user.enabled) !== 1 ? "disabled" : items.length ? "active" : "no_activity";
        return {
          ...user,
          status,
          plays: items.length,
          minutes,
          completed,
          inProgress: items.length - completed,
          completionRate: items.length ? Math.round((completed / items.length) * 100) : null,
          activeDays: activityByDay.size,
          recent: items.slice(0, 5),
          activityBreakdown: {
            observed: {
              plays: observedItems.length,
              minutes: minutesFromSeconds(observedItems.reduce((total, item) => total + normalizeDurationSeconds(item.duration), 0)),
              completed: observedItems.filter((item) => item.completed).length
            },
            attributedTogether: {
              plays: attributedItems.length,
              minutes: minutesFromSeconds(attributedItems.reduce((total, item) => total + normalizeDurationSeconds(item.duration), 0)),
              completed: attributedItems.filter((item) => item.completed).length,
              unknownDuration: attributedItems.filter((item) => normalizeDurationSeconds(item.duration) === 0).length
            },
            confirmedTogetherSessions: [...userSharedDays.values()].reduce((total, sessions) => total + sessions.size, 0)
          },
          mix,
          heatmap,
          possibleDuplicates,
          technicalAccount: { plexUsername: user.plex_username }
        };
      });
      const active = people.filter((person) => person.status === "active");
      const secondary = people.filter((person) => person.status !== "active");
      return {
        people,
        active,
        secondary,
        window: {
          start: window.start,
          end: window.end,
          label: window.period === "all" ? `All time · ${buildWindowLabel(window.start, window.end)}` : buildWindowLabel(window.start, window.end),
          period: window.period,
          heatmapStart: window.heatmapStart,
          heatmapEnd: window.heatmapEnd,
          heatmapTruncated: window.heatmapTruncated,
          defaulted: window.defaulted
        }
      };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  private resolvePeopleWindow(filters: ReturnType<typeof parseFilters>): PeopleWindow {
    const explicitPeriod = filters.period;
    if (explicitPeriod && explicitPeriod !== "custom" && (filters.dateFrom || filters.dateTo)) {
      throw new Error("Validation Error: dateFrom/dateTo may only be combined with period=custom");
    }
    if (explicitPeriod === "custom" && (!filters.dateFrom || !filters.dateTo)) {
      throw new Error("Validation Error: custom People periods require dateFrom and dateTo");
    }

    const period: PeoplePeriod = explicitPeriod ?? (filters.dateFrom || filters.dateTo ? "custom" : "30d");
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    let end = period === "custom" && filters.dateTo ? this.parsePeopleBoundary(filters.dateTo, true) : today;
    let start: Date;

    if (period === "all") {
      const earliest = this.db.prepare(`SELECT MIN(watched_at) AS watched_at FROM (
        SELECT po.watched_at
        FROM playback_observations po JOIN users u ON u.id=po.user_id
        WHERE COALESCE(u.dashboard_shown,u.enabled)=1
        UNION ALL
        SELECT archiveEvent.event_time AS watched_at
        FROM archive_watch_events archiveEvent JOIN users archiveUser ON archiveUser.id=archiveEvent.user_id
        WHERE archiveEvent.source='plex_library_db'
          AND archiveEvent.event_time IS NOT NULL
          AND COALESCE(archiveUser.dashboard_shown,archiveUser.enabled)=1
      )`).get() as { watched_at?: string | null };
      start = earliest.watched_at ? this.parsePeopleBoundary(earliest.watched_at, false) : new Date(end);
    } else if (period === "custom") {
      start = filters.dateFrom ? this.parsePeopleBoundary(filters.dateFrom, false) : new Date(0);
      if (!filters.dateFrom) {
        const earliest = this.db.prepare(`SELECT MIN(po.watched_at) AS watched_at FROM playback_observations po
          JOIN users u ON u.id=po.user_id WHERE COALESCE(u.dashboard_shown,u.enabled)=1`).get() as { watched_at?: string | null };
        start = earliest.watched_at ? this.parsePeopleBoundary(earliest.watched_at, false) : new Date(end);
      }
      if (!filters.dateTo) end = today;
    } else {
      const days = Number(period.slice(0, -1));
      start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      start.setUTCHours(0, 0, 0, 0);
    }

    if (start.getTime() > end.getTime()) throw new Error("Validation Error: dateFrom must be on or before dateTo");
    const startDay = start.toISOString().slice(0, 10);
    const endDay = end.toISOString().slice(0, 10);
    const latestHeatmapStart = addDays(endDay, -(PEOPLE_MAX_HEATMAP_DAYS - 1));
    const heatmapStart = startDay < latestHeatmapStart ? latestHeatmapStart : startDay;
    return {
      period,
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      start: startDay,
      end: endDay,
      heatmapStart,
      heatmapEnd: endDay,
      heatmapTruncated: heatmapStart !== startDay,
      defaulted: !explicitPeriod && !filters.dateFrom && !filters.dateTo
    };
  }

  private parsePeopleBoundary(value: string, endOfDay: boolean): Date {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(dateOnly ? `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : value);
    if (!Number.isFinite(date.getTime())) throw new Error(`Validation Error: invalid ${endOfDay ? "dateTo" : "dateFrom"}`);
    return date;
  }

  private getPeopleContributions(filters: ReturnType<typeof parseFilters>, window: PeopleWindow): {
    contributions: PeopleContribution[];
    sharedSessionsByUserDay: Map<number, Map<string, Set<string>>>;
  } {
    const categorySql = `CASE WHEN lower(po.media_type)='audiobook' OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%audiobook%' THEN 'audiobook' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%anime%' THEN 'anime' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%classic%' THEN 'classic_tv' WHEN lower(po.media_type)='movie' AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title))='movies') THEN 'movie' WHEN lower(po.media_type) IN ('episode', 'show', 'season') AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title)) IN ('tv shows','etv','jdrama')) THEN 'tv' ELSE 'other' END`;
    let where = ` WHERE COALESCE(u.dashboard_shown,u.enabled)=1 AND po.watched_at>=? AND po.watched_at<=? AND ${categorySql}!='other'`;
    const args: any[] = [window.dateFrom, window.dateTo];

    const directRows = this.db.prepare(`SELECT po.*,u.plex_username,u.dashboard_alias,
      cat.library_title AS catalog_library_title,groupcat.library_title AS group_catalog_library_title,
      cat.audiobook_id AS audiobook_id,ab.title AS audiobook_title,
      cat.parent_title AS catalog_parent_title,cat.grandparent_title AS catalog_grandparent_title
      FROM playback_observations po JOIN users u ON u.id=po.user_id
      LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key
      LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key
      LEFT JOIN audiobook_books ab ON ab.id=cat.audiobook_id
      ${where} ORDER BY po.watched_at DESC,po.id DESC`).all(...args) as any[];
    const archiveRows = this.archiveService.queryDashboardActivity(100_000, this.includePlexPlayHistory).filter((row) =>
      row.watched_at >= window.dateFrom && row.watched_at <= window.dateTo
    );
    const archiveContributions = archiveRows
      .map((row) => this.mapActivity(row))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        contribution: "observed" as const,
        confirmedTogether: false
      }));
    const allDirect: PeopleContribution[] = [
      ...directRows.map((row) => ({
        ...this.mapActivity(row),
        contribution: "observed" as const,
        confirmedTogether: false
      })),
      ...archiveContributions
    ];
    const contributions: PeopleContribution[] = allDirect.filter((item) => this.peopleItemMatchesFilters(item, filters));
    const includedDirectIds = new Set(contributions.map((item) => item.id));
    const directById = new Map(allDirect.map((item) => [item.id, item]));
    const directByUserRating = new Map<string, PeopleContribution[]>();
    for (const item of allDirect) {
      const key = `${item.userId}:${item.ratingKey}`;
      const values = directByUserRating.get(key) ?? [];
      values.push(item);
      directByUserRating.set(key, values);
    }

    const sharedSessionsByUserDay = new Map<number, Map<string, Set<string>>>();
    const recordShared = (userId: number, watchedAt: string, sessionKey: string) => {
      const days = sharedSessionsByUserDay.get(userId) ?? new Map<string, Set<string>>();
      const day = isoDay(watchedAt);
      const sessions = days.get(day) ?? new Set<string>();
      sessions.add(sessionKey);
      days.set(day, sessions);
      sharedSessionsByUserDay.set(userId, days);
    };
    const markDirect = (item: PeopleContribution | undefined, watchedAt: string, sessionKey: string) => {
      if (!item) return false;
      item.confirmedTogether = true;
      if (includedDirectIds.has(item.id)) recordShared(item.userId, watchedAt, sessionKey);
      return true;
    };

    const confirmationRows = this.db.prepare(`SELECT we.id AS event_id,we.source_user_id,we.watched_at AS event_watched_at,
      cc.target_user_id,target.plex_username AS target_username,target.dashboard_alias AS target_alias,
      po.*,source.plex_username,source.dashboard_alias,
      cat.library_title AS catalog_library_title,groupcat.library_title AS group_catalog_library_title,
      cat.audiobook_id AS audiobook_id,ab.title AS audiobook_title
      FROM cowatch_confirmations cc
      JOIN watch_events we ON we.id=cc.watch_event_id
      JOIN users source ON source.id=we.source_user_id
      JOIN users target ON target.id=cc.target_user_id
      JOIN playback_observations po ON po.id=(SELECT po2.id FROM playback_observations po2
        WHERE po2.user_id=we.source_user_id AND po2.rating_key=we.rating_key
          AND po2.watched_at>=strftime('%Y-%m-%dT%H:%M:%fZ',we.watched_at,'-600 seconds')
          AND po2.watched_at<=strftime('%Y-%m-%dT%H:%M:%fZ',we.watched_at,'+600 seconds')
        ORDER BY po2.watched_at DESC,po2.id DESC LIMIT 1)
      LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key
      LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key
      LEFT JOIN audiobook_books ab ON ab.id=cat.audiobook_id
      WHERE cc.status='confirmed'
        AND COALESCE(source.dashboard_shown,source.enabled)=1
        AND COALESCE(target.dashboard_shown,target.enabled)=1
        AND po.watched_at>=? AND po.watched_at<=?`).all(window.dateFrom, window.dateTo) as any[];

    for (const row of confirmationRows) {
      const source = this.mapActivity(row);
      if (!source || !this.peopleItemMatchesFilters(source, filters, true)) continue;
      const pair = [Number(row.source_user_id), Number(row.target_user_id)].sort((a, b) => a - b).join(":");
      const sessionKey = `${pair}:${source.ratingKey}:${source.id}`;
      markDirect(directById.get(source.id), source.watchedAt, sessionKey);
      const targetDirect = (directByUserRating.get(`${row.target_user_id}:${source.ratingKey}`) ?? [])
        .filter((item) => Math.abs(new Date(item.watchedAt).getTime() - new Date(source.watchedAt).getTime()) <= 2 * 60 * 60 * 1000)
        .sort((a, b) => Math.abs(new Date(a.watchedAt).getTime() - new Date(source.watchedAt).getTime()) - Math.abs(new Date(b.watchedAt).getTime() - new Date(source.watchedAt).getTime()))[0];
      if (markDirect(targetDirect, source.watchedAt, sessionKey)) continue;
      const attributed: PeopleContribution = {
        ...source,
        userId: Number(row.target_user_id),
        username: row.target_username,
        displayName: resolveDashboardAlias(row.target_alias, row.target_username),
        displayNames: [source.displayName, resolveDashboardAlias(row.target_alias, row.target_username)].sort((a, b) => a.localeCompare(b)),
        confirmedUserIds: [Number(row.target_user_id)],
        contribution: "attributed_confirmed_together",
        confirmedTogether: true,
        evidence: {
          observed: false,
          confirmed: true,
          relationship: "together",
          reason: "Attributed from confirmed co-watch evidence",
          watchedAtProvenance: "confirmed_source",
          percentCompleteProvenance: "confirmed_source"
        }
      };
      if (this.peopleItemMatchesFilters(attributed, filters)) {
        contributions.push(attributed);
        recordShared(attributed.userId, attributed.watchedAt, sessionKey);
      }
    }

    const latestYes = this.db.prepare(`SELECT ca.* FROM cowatch_adjudications ca
      JOIN users source ON source.id=ca.source_user_id JOIN users target ON target.id=ca.target_user_id
      WHERE ca.id=(SELECT MAX(latest.id) FROM cowatch_adjudications latest WHERE latest.candidate_id=ca.candidate_id)
        AND ca.decision='yes' AND COALESCE(source.dashboard_shown,source.enabled)=1
        AND COALESCE(target.dashboard_shown,target.enabled)=1`).all() as any[];
    for (const row of latestYes) {
      let observationIds: number[] = [];
      try { observationIds = JSON.parse(row.supporting_observation_ids_json); } catch {}
      const sourceItem = observationIds.map((id) => directById.get(Number(id))).find((item) => item?.userId === Number(row.source_user_id));
      const targetItem = observationIds.map((id) => directById.get(Number(id))).find((item) => item?.userId === Number(row.target_user_id));
      const watchedAt = sourceItem?.watchedAt ?? targetItem?.watchedAt;
      const sourceObservationId = sourceItem?.id ?? observationIds[0];
      if (!watchedAt || !sourceObservationId) continue;
      const pair = [Number(row.source_user_id), Number(row.target_user_id)].sort((a, b) => a - b).join(":");
      const sessionKey = `${pair}:${row.rating_key}:${sourceObservationId}`;
      markDirect(sourceItem, watchedAt, sessionKey);
      markDirect(targetItem, watchedAt, sessionKey);
    }

    return { contributions, sharedSessionsByUserDay };
  }

  private peopleItemMatchesFilters(item: DashboardActivityItem, filters: ReturnType<typeof parseFilters>, ignoreUser = false): boolean {
    if (!ignoreUser && filters.user && item.username !== filters.user) return false;
    if (filters.category && item.category !== filters.category) return false;
    if (filters.library && item.libraryName !== filters.library) return false;
    if (filters.completed !== undefined && item.completed !== filters.completed) return false;
    if (filters.search) {
      const search = filters.search.toLocaleLowerCase();
      if (!item.title.toLocaleLowerCase().includes(search) && !(item.showTitle ?? "").toLocaleLowerCase().includes(search)) return false;
    }
    return true;
  }

  getTimeline(input: unknown) {
    const timed = withTiming(() => {
      const p = parseTimelineFilters(input);
      
      let selectedDate = typeof (input as any).date === "string" && /^\d{4}-\d{2}-\d{2}$/.test((input as any).date) ? (input as any).date : "";
      
      let where = " WHERE COALESCE(u.dashboard_shown, u.enabled) = 1";
      const args: any[] = [];
      if (p.user) { where += " AND u.plex_username = ?"; args.push(p.user); }
      if (p.ratingKey) { where += " AND po.rating_key = ?"; args.push(p.ratingKey); }
      if (p.grandparentRatingKey) { where += " AND (po.grandparent_rating_key = ? OR po.rating_key = ?)"; args.push(p.grandparentRatingKey, p.grandparentRatingKey); }
      if (p.audiobookId) { where += " AND cat.audiobook_id = ?"; args.push(p.audiobookId); }
      if (p.library) { where += " AND COALESCE(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) = ?"; args.push(p.library); }
      if (p.completed !== undefined) { where += " AND po.completed = ?"; args.push(p.completed ? 1 : 0); }
      if (p.search) { where += " AND (po.title LIKE ? OR po.show_title LIKE ?)"; args.push(`%${p.search}%`, `%${p.search}%`); }

      const categorySql = `CASE WHEN lower(po.media_type)='audiobook' OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%audiobook%' THEN 'audiobook' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%anime%' THEN 'anime' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%classic%' THEN 'classic_tv' WHEN lower(po.media_type)='movie' AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title))='movies') THEN 'movie' WHEN lower(po.media_type) IN ('episode', 'show', 'season') AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title)) IN ('tv shows','etv','jdrama')) THEN 'tv' ELSE 'other' END`;
      where += ` AND ${categorySql} != 'other'`;
      if (p.category) { where += ` AND ${categorySql} = ?`; args.push(p.category); }

      if (!selectedDate) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayCheck = this.db.prepare(`
          SELECT 1 FROM playback_observations po
          JOIN users u ON u.id = po.user_id
          LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key
          LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key
          ${where} AND substr(po.watched_at, 1, 10) = ?
          LIMIT 1
        `).get(...args, todayStr);
        if (todayCheck) {
          selectedDate = todayStr;
        } else {
          const maxDayRow = this.db.prepare(`
            SELECT substr(po.watched_at, 1, 10) as day FROM playback_observations po
            JOIN users u ON u.id = po.user_id
            LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key
            LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key
            ${where}
            ORDER BY po.watched_at DESC
            LIMIT 1
          `).get(...args) as any;
          selectedDate = maxDayRow ? maxDayRow.day : todayStr;
        }
      }

      // Prev and Next active dates
      const prevRow = this.db.prepare(`
        SELECT substr(po.watched_at, 1, 10) as day FROM playback_observations po
        JOIN users u ON u.id = po.user_id
        LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key
        LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key
        ${where} AND substr(po.watched_at, 1, 10) < ?
        ORDER BY po.watched_at DESC
        LIMIT 1
      `).get(...args, selectedDate) as any;
      const prevActiveDate = prevRow ? prevRow.day : null;

      const nextRow = this.db.prepare(`
        SELECT substr(po.watched_at, 1, 10) as day FROM playback_observations po
        JOIN users u ON u.id = po.user_id
        LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key
        LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key
        ${where} AND substr(po.watched_at, 1, 10) > ?
        ORDER BY po.watched_at ASC
        LIMIT 1
      `).get(...args, selectedDate) as any;
      const nextActiveDate = nextRow ? nextRow.day : null;

      // Fetch all activity items for selectedDate
      const dateFrom = selectedDate + "T00:00:00.000Z";
      const dateTo = selectedDate + "T23:59:59.999Z";
      const dailyActivity = this.getActivity({
        ...(input as object),
        dateFrom,
        dateTo,
        limit: 1000,
        offset: 0,
        sort: "recent"
      });

      // Group into lanes and sessions
      const userItemsMap = new Map<number, DashboardActivityItem[]>();
      for (const item of dailyActivity.items) {
        if (!userItemsMap.has(item.userId)) {
          userItemsMap.set(item.userId, []);
        }
        userItemsMap.get(item.userId)!.push(item);
      }

      const sessions: any[] = [];
      for (const [userId, items] of userItemsMap.entries()) {
        const itemsWithIntervals = items.map(item => {
          const durationSec = item.duration ?? 0;
          const endTime = new Date(item.watchedAt).getTime();
          const startTime = endTime - durationSec * 1000;
          return { item, startTime, endTime };
        }).sort((a, b) => a.startTime - b.startTime);

        let currentSessionItems: typeof itemsWithIntervals = [];
        for (const x of itemsWithIntervals) {
          if (currentSessionItems.length === 0) {
            currentSessionItems.push(x);
            continue;
          }
          const last = currentSessionItems[currentSessionItems.length - 1];
          const gapMs = x.startTime - last.endTime;
          if (gapMs < 2 * 60 * 60 * 1000) {
            currentSessionItems.push(x);
          } else {
            sessions.push(buildTimelineSession(currentSessionItems));
            currentSessionItems = [x];
          }
        }
        if (currentSessionItems.length > 0) {
          sessions.push(buildTimelineSession(currentSessionItems));
        }
      }

      function buildTimelineSession(group: Array<{ item: DashboardActivityItem; startTime: number; endTime: number }>) {
        const first = group[0];
        const last = group[group.length - 1];
        const startTimeMs = first.startTime;
        const endTimeMs = group.reduce((max, x) => Math.max(max, x.endTime), first.endTime);
        
        const groupItems = group.map(x => x.item);
        const isCompleted = groupItems.some(it => it.completed);
        const isPaused = groupItems.length > 1;

        let relationship = "watched_by";
        if (groupItems.some(it => it.evidence?.relationship === "together")) {
          relationship = "together";
        } else if (groupItems.some(it => it.evidence?.relationship === "likely_together")) {
          relationship = "likely_together";
        }

        const cowatchEventId = groupItems.find(it => it.evidence?.cowatchEventId)?.evidence?.cowatchEventId || null;

        return {
          id: `${first.item.userId}-${startTimeMs}`,
          userId: first.item.userId,
          displayName: first.item.displayName,
          username: first.item.username,
          date: selectedDate,
          startTime: new Date(startTimeMs).toISOString(),
          endTime: new Date(endTimeMs).toISOString(),
          itemCount: groupItems.length,
          category: first.item.category,
          isCompleted,
          isPaused,
          relationship,
          cowatchEventId,
          item: first.item
        };
      }

      // Fetch co-watch moments
      const coWatchEvents = this.cowatchingService.getCowatchingEvents({
        dateFrom,
        dateTo
      });
      const coWatchMoments = coWatchEvents.filter(ev => {
        if (p.user) {
          return ev.participants.some(part => part.username === p.user);
        }
        return true;
      });

      // Fetch feed activity
      const activityFeed = this.getActivity({
        ...(input as object),
        limit: p.limit,
        offset: p.offset
      });

      return {
        selectedDate,
        prevActiveDate,
        nextActiveDate,
        sessions,
        coWatchMoments,
        windowDays: p.days,
        items: activityFeed.items,
        total: activityFeed.total,
        limit: activityFeed.limit,
        offset: activityFeed.offset
      };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  getCowatchPatterns() {
    const events = this.db.prepare(`
      SELECT 
        we.media_type, 
        we.library_name, 
        po_source.media_type as source_media_type,
        po_source.library_name as source_library_name,
        po_source.duration as source_duration,
        po_target.media_type as target_media_type,
        po_target.library_name as target_library_name,
        po_target.duration as target_duration
      FROM watch_events we 
      JOIN cowatch_confirmations cc ON cc.watch_event_id=we.id 
      JOIN playback_observations po_source ON po_source.user_id=we.source_user_id AND po_source.rating_key=we.rating_key AND po_source.watched_at >= strftime('%Y-%m-%dT%H:%M:%fZ', we.watched_at, '-600 seconds') AND po_source.watched_at <= strftime('%Y-%m-%dT%H:%M:%fZ', we.watched_at, '+600 seconds')
      LEFT JOIN playback_observations po_target ON po_target.user_id=cc.target_user_id AND po_target.rating_key=we.rating_key AND po_target.watched_at >= strftime('%Y-%m-%dT%H:%M:%fZ', we.watched_at, '-600 seconds') AND po_target.watched_at <= strftime('%Y-%m-%dT%H:%M:%fZ', we.watched_at, '+600 seconds')
      WHERE cc.status='confirmed' OR cc.status='inferred'
    `).all() as any[];
    const pairs = new Map<string, { cats: string[], duration: number }>();
    for (const ev of events) {
      const mediaType1 = ev.source_media_type || ev.media_type;
      const libraryName1 = ev.source_library_name || ev.library_name;
      const cat1 = deriveDashboardCategory(mediaType1, libraryName1).category;
      
      const mediaType2 = ev.target_media_type || mediaType1;
      const libraryName2 = ev.target_library_name || libraryName1;
      const cat2 = deriveDashboardCategory(mediaType2, libraryName2).category;
      if (!isHouseholdCategory(cat1) || !isHouseholdCategory(cat2)) continue;
      
      const duration = normalizeDurationSeconds(ev.target_duration ?? ev.source_duration ?? 0);
      
      const sorted = [cat1, cat2].sort();
      const key = sorted.join('+');
      const p = pairs.get(key) ?? { cats: sorted, duration: 0 };
      p.duration += duration;
      pairs.set(key, p);
    }
    const total = [...pairs.values()].reduce((sum, p) => sum + p.duration, 0);
    return [...pairs.values()].map(p => ({ ...p, durationHours: hoursFromSeconds(p.duration), percent: total > 0 ? Math.round((p.duration / total) * 100) : 0 })).sort((a,b) => b.durationHours - a.durationHours).slice(0, 4);
  }

  getCowatchPairings(input: unknown) {
    const timed = withTiming(() => {
      const filters = parseFilters(input);
      const window = this.resolvePeopleWindow(filters);
      const intelligenceParams = {
        dateFrom: window.dateFrom,
        dateTo: window.dateTo
      };
      const events = this.cowatchingService.getCowatchingEvents(intelligenceParams);
      const reviewCandidates = this.adjudicationService.listCandidates(intelligenceParams);
      const reviewByEventPair = new Map(reviewCandidates.map((candidate) => [
        `${candidate.ratingKey}:${candidate.watchedAt}:${candidate.source.userId}:${candidate.target.userId}`,
        candidate
      ]));
      const visibleUsers = this.db.prepare(`
        SELECT id, plex_username, COALESCE(NULLIF(dashboard_alias, ''), plex_username) AS display_name
        FROM users
        WHERE COALESCE(dashboard_shown, enabled) = 1
      `).all() as Array<{ id: number; plex_username: string; display_name: string }>;
      const visibleById = new Map(visibleUsers.map((user) => [Number(user.id), user]));
      const pairings = new Map<string, any>();

      for (const event of events) {
        const category = deriveDashboardCategory(event.mediaType).category;
        if (!isHouseholdCategory(category) || (filters.category && filters.category !== category)) continue;
        const source = event.participants.find((participant) => participant.role === "source");
        if (!source || !visibleById.has(source.userId)) continue;
        for (const participant of event.participants) {
          if (participant.userId === source.userId || !["confirmed", "inferred"].includes(participant.evidenceState)) continue;
          if (!visibleById.has(participant.userId)) continue;
          const people = [visibleById.get(source.userId)!, visibleById.get(participant.userId)!]
            .sort((a, b) => a.id - b.id);
          if (filters.user && !people.some((person) => person.plex_username === filters.user)) continue;
          const key = people.map((person) => person.id).join(":");
          const pairing = pairings.get(key) ?? {
            id: `pair-${key}`,
            people: people.map((person) => ({ id: person.id, username: person.plex_username, displayName: person.display_name })),
            sessionCount: 0,
            knownSharedMinutes: 0,
            unknownDurationSessions: 0,
            provenance: { confirmed: 0, inferred: 0, adjudicated: 0 },
            titles: new Map<string, any>(),
            latestWatchedAt: event.watchedAt
          };
          const review = participant.evidenceState === "inferred"
            ? reviewByEventPair.get(`${event.ratingKey}:${event.watchedAt}:${source.userId}:${participant.userId}`)
            : undefined;
          if (review?.effectiveRelationship === "suppressed") continue;
          pairing.sessionCount += 1;
          if (participant.evidenceState === "confirmed") pairing.provenance.confirmed += 1;
          else if (review?.effectiveRelationship === "together") pairing.provenance.adjudicated += 1;
          else if (participant.evidenceState === "inferred") pairing.provenance.inferred += 1;
          const overlapMinutes = Number(participant.timingRelationship?.overlapMinutes ?? 0);
          if (overlapMinutes > 0) pairing.knownSharedMinutes += overlapMinutes;
          else pairing.unknownDurationSessions += 1;
          if (event.watchedAt > pairing.latestWatchedAt) pairing.latestWatchedAt = event.watchedAt;
          const title = event.showTitle || event.title;
          const titleEntry = pairing.titles.get(event.ratingKey) ?? {
            ratingKey: event.ratingKey,
            title,
            category,
            sessions: 0,
            latestWatchedAt: event.watchedAt
          };
          titleEntry.sessions += 1;
          if (event.watchedAt > titleEntry.latestWatchedAt) titleEntry.latestWatchedAt = event.watchedAt;
          pairing.titles.set(event.ratingKey, titleEntry);
          pairings.set(key, pairing);
        }
      }

      const items = [...pairings.values()].map((pairing) => ({
        ...pairing,
        knownSharedMinutes: Math.round(pairing.knownSharedMinutes),
        titles: [...pairing.titles.values()].sort((a, b) => b.latestWatchedAt.localeCompare(a.latestWatchedAt)).slice(0, 5)
      })).sort((a, b) => b.sessionCount - a.sessionCount || b.latestWatchedAt.localeCompare(a.latestWatchedAt));
      return { items, total: items.length, windowDays: window.period.endsWith("d") ? Number(window.period.slice(0, -1)) : null, window: { start: window.start, end: window.end, period: window.period } };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  getOperations() {
    const timed = withTiming(() => {
      const items = this.getNeedsAttention();
      const candidates = this.adjudicationService.listCandidates({ days: 3650 });
      const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
      const visibleIds = new Set((this.db.prepare(`SELECT id FROM users WHERE COALESCE(dashboard_shown,enabled)=1`).all() as Array<{ id: number }>).map((row) => Number(row.id)));
      const prompts = this.db.prepare(`SELECT id,candidate_id,status,error,created_at,updated_at FROM cowatch_review_prompts
        WHERE status IN ('pending','sent','failed') ORDER BY updated_at DESC LIMIT 10`).all() as any[];
      for (const prompt of prompts) {
        const candidate = candidateById.get(prompt.candidate_id);
        if (!candidate || !visibleIds.has(candidate.source.userId) || !visibleIds.has(candidate.target.userId)) continue;
        items.push({
          kind: "cowatch_review_prompt",
          reviewPromptId: Number(prompt.id),
          title: candidate.showTitle || candidate.title,
          detail: `${candidate.source.displayName} and ${candidate.target.displayName}: Discord review is ${prompt.status}`,
          status: prompt.status,
          watchedAt: prompt.updated_at,
          ratingKey: candidate.ratingKey,
          route: { layout: "people", filters: {} }
        });
      }
      return items.sort((a, b) => String(b.watchedAt ?? "").localeCompare(String(a.watchedAt ?? ""))).slice(0, 20);
    });
    return { items: timed.value, total: timed.value.length, timingMs: timed.timingMs };
  }

  getCowatchReviews(input: unknown) {
    const timed = withTiming(() => {
      const filters = parseFilters(input);
      const window = this.resolvePeopleWindow(filters);
      const limit = Math.min(50, Math.max(1, Number((input as any)?.limit ?? 20)));
      const offset = Math.max(0, Number((input as any)?.offset ?? 0));
      const candidates = this.adjudicationService.listCandidates({
        dateFrom: window.dateFrom,
        dateTo: window.dateTo
      });
      const visibleUsers = this.db.prepare(`SELECT id,plex_username,COALESCE(NULLIF(dashboard_alias,''),plex_username) display_name
        FROM users WHERE COALESCE(dashboard_shown,enabled)=1`).all() as Array<{ id: number; plex_username: string; display_name: string }>;
      const visibleById = new Map(visibleUsers.map((user) => [Number(user.id), user]));
      const promptStatuses = this.adjudicationService.getPromptStatuses(candidates.map((candidate) => candidate.candidateId));
      const items = candidates.filter((candidate) => {
        const source = visibleById.get(candidate.source.userId);
        const target = visibleById.get(candidate.target.userId);
        if (!source || !target) return false;
        if (filters.user && source.plex_username !== filters.user && target.plex_username !== filters.user) return false;
        const category = deriveDashboardCategory(candidate.mediaType).category;
        return isHouseholdCategory(category) && (!filters.category || filters.category === category);
      }).map((candidate) => ({
        ...candidate,
        source: { ...candidate.source, displayName: visibleById.get(candidate.source.userId)!.display_name },
        target: { ...candidate.target, displayName: visibleById.get(candidate.target.userId)!.display_name },
        category: deriveDashboardCategory(candidate.mediaType).category,
        discordPromptStatus: promptStatuses.get(candidate.candidateId) ?? null
      })).sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
      return { items: items.slice(offset, offset + limit), total: items.length, limit, offset, window: { start: window.start, end: window.end, period: window.period } };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  getProgress(input: unknown): DashboardProgressResponse {
    const timed = withTiming(() => {
      const p = parseFilters(input);

      // Get all matching activity items in the effective window, ignoring page limit/offset during retrieval
      const all = this.getActivity({ ...(input as object), limit: 10000, offset: 0 }).items;

      // Group items by stable media identity (using explorerGroupKey)
      const groups = new Map<string, {
        groupKey: string;
        title: string;
        category: DashboardCategory;
        artworkUrl: string;
        posterUrl: string;
        artworkRevision: string;
        latestWatchedAt: string;
        plays: number;
        completedPlays: number;
        partials: number;
        observedMinutes: number;
        distinctItems: Set<string>;
        distinctCompleted: Set<string>;
        seasons: Record<number, number[]> | null;
        hierarchy: {
          parentSeries: string | null;
          subseries: string | null;
          series: string | null;
          book: string | null;
        } | null;
        peopleMap: Map<number, {
          userId: number;
          plexUsername: string;
          displayName: string;
          plays: number;
          completedPlays: number;
          partials: number;
          distinctItems: Set<string>;
          distinctCompleted: Set<string>;
          latestWatchedAt: string;
        }>;
        rawItems: DashboardActivityItem[];
        percentages: number[];
      }>();

      for (const item of all) {
        if (!isRecognizedExplorerItem(item)) continue;
        const key = explorerGroupKey(item);
        const title = item.displayTitle ?? item.title;

        const artworkKey = item.category === "audiobook"
          ? `audiobook:${item.audiobookId ?? item.parentRatingKey ?? item.grandparentRatingKey ?? item.ratingKey}`
          : (item.category === "tv" || item.category === "classic_tv" || item.category === "anime")
            ? (item.grandparentRatingKey ?? item.ratingKey)
            : item.ratingKey;
        const artwork = buildDashboardArtworkDescriptor(this.db, artworkKey);

        let group = groups.get(key);
        if (!group) {
          group = {
            groupKey: key,
            title,
            category: item.category,
            artworkUrl: artwork.artworkUrl,
            posterUrl: artwork.posterUrl,
            artworkRevision: artwork.artworkRevision,
            latestWatchedAt: item.watchedAt,
            plays: 0,
            completedPlays: 0,
            partials: 0,
            observedMinutes: 0,
            distinctItems: new Set<string>(),
            distinctCompleted: new Set<string>(),
            seasons: (item.category === "tv" || item.category === "classic_tv" || item.category === "anime") ? {} : null,
            hierarchy: null,
            peopleMap: new Map(),
            rawItems: [],
            percentages: []
          };
          groups.set(key, group);
        }

        group.plays++;
        if (item.completed) {
          group.completedPlays++;
          group.distinctCompleted.add(item.ratingKey);
        } else {
          group.partials++;
        }
        group.distinctItems.add(item.ratingKey);
        group.observedMinutes += minutesFromDuration(item.duration);
        if (item.percentComplete != null) {
          group.percentages.push(item.percentComplete);
        }
        if (item.watchedAt > group.latestWatchedAt) {
          group.latestWatchedAt = item.watchedAt;
        }

        // Aggregate per-season episodes for TV shows
        if (group.seasons && item.seasonNumber != null && item.episodeNumber != null) {
          if (!group.seasons[item.seasonNumber]) {
            group.seasons[item.seasonNumber] = [];
          }
          if (!group.seasons[item.seasonNumber].includes(item.episodeNumber)) {
            group.seasons[item.seasonNumber].push(item.episodeNumber);
          }
        }

        // Aggregate person context
        let pCtx = group.peopleMap.get(item.userId);
        if (!pCtx) {
          pCtx = {
            userId: item.userId,
            plexUsername: item.username,
            displayName: item.displayName,
            plays: 0,
            completedPlays: 0,
            partials: 0,
            distinctItems: new Set<string>(),
            distinctCompleted: new Set<string>(),
            latestWatchedAt: item.watchedAt
          };
          group.peopleMap.set(item.userId, pCtx);
        }
        pCtx.plays++;
        if (item.completed) {
          pCtx.completedPlays++;
          pCtx.distinctCompleted.add(item.ratingKey);
        } else {
          pCtx.partials++;
        }
        pCtx.distinctItems.add(item.ratingKey);
        if (item.watchedAt > pCtx.latestWatchedAt) {
          pCtx.latestWatchedAt = item.watchedAt;
        }

        group.rawItems.push(item);
      }

      // Convert temporary maps to the final DashboardProgressGroup structures
      const progressGroups: DashboardProgressGroup[] = [];
      const compatProgress: any[] = [];

      for (const [key, g] of groups.entries()) {
        const first = g.rawItems[0];
        let totalKnown = false;
        let totalItems: number | null = null;
        let hierarchy: any = null;
        let progressUnit: any = undefined;
        let progressUnitLabel: any = undefined;
        let progressSource: any = undefined;
        let progressSourceVerified: any = undefined;
        let hasVerifiedChapters: boolean | undefined = undefined;
        let currentChapterIndex: number | null = null;
        let currentProgressPercent: number | null = null;
        let audiobookBook: any = null;

        if (first.category === "audiobook") {
          progressUnit = "track";
          progressUnitLabel = "tracks/files";
          progressSource = "plex";
          progressSourceVerified = false;

          const book = this.db.prepare(`
            SELECT ab.id, ab.parent_series_title, ab.subseries_title, ab.series_title, ab.title, ab.chapter_count
            FROM content_catalog cat
            JOIN audiobook_books ab ON ab.id = cat.audiobook_id
            WHERE cat.rating_key = ?
          `).get(first.ratingKey) as any;
          if (book) {
            audiobookBook = book;
            totalKnown = false;
            totalItems = book.chapter_count || null;
            hierarchy = {
              parentSeries: book.parent_series_title || null,
              subseries: book.subseries_title || null,
              series: book.series_title || null,
              book: book.title || null
            };
            hasVerifiedChapters = this.getActiveAudiobookChapterSource(book.id) !== null;
          }
        } else if (first.category === "tv" || first.category === "classic_tv" || first.category === "anime") {
          progressUnit = "episode";
          progressUnitLabel = "episodes";
          progressSource = "plex";
          progressSourceVerified = true;
          const showKey = first.grandparentRatingKey ?? first.ratingKey;
          const show = this.db.prepare(`
            SELECT leaf_count
            FROM content_catalog
            WHERE rating_key = ?
          `).get(showKey) as any;
          if (show) {
            totalKnown = Boolean(show.leaf_count && show.leaf_count > 0);
            totalItems = show.leaf_count || null;
          }
        } else if (first.category === "movie") {
          progressUnit = "movie";
          progressUnitLabel = "movie";
          progressSource = "plex";
          progressSourceVerified = true;

          totalKnown = true;
          totalItems = 1;
        }

        // Sort season episode arrays
        if (g.seasons) {
          for (const s in g.seasons) {
            g.seasons[s].sort((a, b) => a - b);
          }
        }

        const replayProjection = this.aggregateReplaySemantics(g.rawItems);
        let sessionCount = replayProjection.total.sessionCount;
        let viewingDayCount = replayProjection.total.viewingDayCount;
        let replayCount = replayProjection.total.replayCount;

        // Build people array
        let people: DashboardProgressPersonContext[] = [...g.peopleMap.values()].map((pCtx) => {
          const semantics = replayProjection.byUserId.get(pCtx.userId) ?? emptyReplaySemantics();
          return {
            userId: pCtx.userId,
            plexUsername: pCtx.plexUsername,
            displayName: pCtx.displayName,
            plays: pCtx.plays,
            observationCount: pCtx.plays,
            sessionCount: semantics.sessionCount,
            viewingDayCount: semantics.viewingDayCount,
            replayCount: semantics.replayCount,
            completedPlays: pCtx.completedPlays,
            partials: pCtx.partials,
            distinctItems: pCtx.distinctItems.size,
            distinctCompleted: pCtx.distinctCompleted.size,
            latestWatchedAt: pCtx.latestWatchedAt
          };
        }).sort((a, b) => b.plays - a.plays || a.displayName.localeCompare(b.displayName));

        let distinctItems = g.distinctItems.size;
        let distinctCompleted = g.distinctCompleted.size;
        let partials = g.partials;
        if (first.category === "audiobook" && audiobookBook) {
          const audiobookProgress = this.buildAudiobookHierarchy(audiobookBook, g.rawItems, people);
          hasVerifiedChapters = audiobookProgress.hasVerifiedChapters;
          if (audiobookProgress.hasVerifiedChapters) {
            progressUnit = "chapter";
            progressUnitLabel = "chapters";
            progressSource = "audiobook_tool";
            progressSourceVerified = true;
            totalKnown = true;
            totalItems = audiobookProgress.chapters.length;
            distinctItems = audiobookProgress.distinctItems;
            distinctCompleted = audiobookProgress.distinctCompleted;
            currentChapterIndex = audiobookProgress.currentChapterIndex ?? null;
            currentProgressPercent = audiobookProgress.currentProgressPercent ?? null;
            partials = [...audiobookProgress.peopleStats.values()].reduce((sum, stat) => sum + stat.partials, 0);
            people = people.map((person) => {
              const stats = audiobookProgress.peopleStats.get(person.displayName);
              return stats ? {
                ...person,
                distinctItems: stats.distinctItems,
                distinctCompleted: stats.distinctCompleted,
                partials: stats.partials
              } : person;
            });
          }
        }

        const pg: DashboardProgressGroup = {
          groupKey: g.groupKey,
          title: g.title,
          category: g.category,
          artworkUrl: g.artworkUrl,
          posterUrl: g.posterUrl,
          artworkRevision: g.artworkRevision,
          latestWatchedAt: g.latestWatchedAt,
          progressUnit,
          progressUnitLabel,
          progressSource,
          progressSourceVerified,
          hasVerifiedChapters,
          currentChapterIndex,
          currentProgressPercent,
          totalKnown,
          totalItems,
          distinctItems,
          distinctCompleted,
          plays: g.plays,
          observationCount: g.plays,
          sessionCount,
          viewingDayCount,
          replayCount,
          completedPlays: g.completedPlays,
          partials,
          observedMinutes: g.observedMinutes,
          people,
          seasons: g.seasons,
          hierarchy
        };
        progressGroups.push(pg);

        // Populate old compatibility progress array
        const firstRaw = g.rawItems[0];
        const averagePercent = g.percentages.length ? Math.round(g.percentages.reduce((sum: number, val: number) => sum + val, 0) / g.percentages.length) : null;
        compatProgress.push({
          userId: firstRaw.userId,
          displayName: firstRaw.displayName,
          title: g.title,
          category: g.category,
          distinctItems: g.distinctItems.size,
          plays: g.plays,
          observationCount: g.plays,
          sessionCount,
          viewingDayCount,
          replayCount,
          completed: g.completedPlays,
          averagePercent,
          totalKnown,
          totalItems,
          hierarchy,
          seasons: g.seasons,
          latestWatchedAt: g.latestWatchedAt
        });
      }

      // Sort compat progress
      compatProgress.sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));

      // Separate into buckets
      const recentlyActiveGroups = [...progressGroups].sort((a, b) => b.latestWatchedAt.localeCompare(a.latestWatchedAt));

      const continueGroups = progressGroups.filter((g) => {
        if (g.category === "movie") {
          return g.distinctCompleted === 0 && g.plays > 0;
        }
        if (g.totalKnown) {
          return g.distinctCompleted < (g.totalItems || 0);
        }
        return g.partials > 0;
      }).sort((a, b) => b.latestWatchedAt.localeCompare(a.latestWatchedAt));

      const recentlyCompletedGroups = progressGroups.filter((g) => {
        return g.completedPlays > 0;
      }).sort((a, b) => b.latestWatchedAt.localeCompare(a.latestWatchedAt));

      // Parse pagination
      const rawQuery = (input || {}) as any;
      const getPagination = (prefix: string) => {
        const limitVal = rawQuery[`${prefix}Limit`] ?? rawQuery.limit;
        const offsetVal = rawQuery[`${prefix}Offset`] ?? rawQuery.offset;
        const limit = limitVal !== undefined ? Math.min(Number(limitVal), 1000) : 50;
        const offset = offsetVal !== undefined ? Number(offsetVal) : 0;
        return { limit, offset };
      };

      const activePage = getPagination("recentlyActive");
      const continuePage = getPagination("continue");
      const completedPage = getPagination("recentlyCompleted");

      const makeBucket = (allGroups: DashboardProgressGroup[], limit: number, offset: number): DashboardProgressBucket => {
        return {
          items: allGroups.slice(offset, offset + limit),
          total: allGroups.length,
          limit,
          offset
        };
      };

      // Populate old compatibility recently completed array
      const recentlyCompletedOld = all.filter(item => item.completed).map(item => ({ ...item, displayTitle: explorerTitle(item) }));
      const uniqueCompleted: any[] = [];
      const seenTitles = new Set<string>();
      for (const item of recentlyCompletedOld) {
        if (!seenTitles.has(item.displayTitle)) {
          seenTitles.add(item.displayTitle);
          uniqueCompleted.push(item);
        }
      }
      const compatRecentlyCompleted = uniqueCompleted.slice(0, 5);

      return {
        recentlyActive: makeBucket(recentlyActiveGroups, activePage.limit, activePage.offset),
        continue: makeBucket(continueGroups, continuePage.limit, continuePage.offset),
        recentlyCompleted: makeBucket(recentlyCompletedGroups, completedPage.limit, completedPage.offset),
        progress: compatProgress,
        recentlyCompletedCompat: compatRecentlyCompleted
      };
    });

    return { ...timed.value, timingMs: timed.timingMs };
  }

  getDetail(ratingKey: string) {
    const timed = withTiming(() => {
      // 1. Resolve top-level metadata from content_catalog or fallback
      let catalog = this.db.prepare(`SELECT media_type,title,duration,library_title,grandparent_title,parent_title,leaf_count,source_provenance,audiobook_id,grandparent_rating_key,parent_rating_key FROM content_catalog WHERE rating_key=?`).get(ratingKey) as any;

      if (!catalog) {
        // Check if there are episodes under this grandparent key (meaning the clicked key is a TV show rating key)
        const ep = this.db.prepare(`SELECT media_type,library_title,grandparent_title,grandparent_rating_key,leaf_count FROM content_catalog WHERE grandparent_rating_key=? LIMIT 1`).get(ratingKey) as any;
        if (ep) {
          catalog = {
            media_type: "show",
            title: ep.grandparent_title,
            library_title: ep.library_title,
            grandparent_title: null,
            parent_title: null,
            grandparent_rating_key: null,
            parent_rating_key: null,
            leaf_count: ep.leaf_count,
            audiobook_id: null,
          };
        } else {
          // Check if it's an audiobook book
          const book = this.db.prepare(`SELECT id,title FROM audiobook_books WHERE id=? LIMIT 1`).get(ratingKey) as any;
          if (book) {
            catalog = {
              media_type: "audiobook",
              title: book.title,
              library_title: "Audiobooks",
              audiobook_id: book.id,
            };
          } else {
            const ab = this.db.prepare(`SELECT cat.audiobook_id, ab.title FROM content_catalog cat JOIN audiobook_books ab ON ab.id = cat.audiobook_id WHERE cat.parent_rating_key=? OR cat.rating_key=? LIMIT 1`).get(ratingKey, ratingKey) as any;
            if (ab) {
              catalog = {
                media_type: "audiobook",
                title: ab.title,
                library_title: "Audiobooks",
                audiobook_id: ab.audiobook_id,
              };
            }
          }
        }
      }

      if (!catalog) {
        // Check if we can get it from playback_observations
        const obs = this.db.prepare(`SELECT media_type,title,duration,library_name,show_title,season_number,episode_number,grandparent_rating_key,parent_rating_key FROM playback_observations WHERE rating_key=? LIMIT 1`).get(ratingKey) as any;
        if (obs) {
          catalog = {
            media_type: obs.media_type,
            title: obs.title,
            duration: obs.duration,
            library_title: obs.library_name,
            grandparent_title: obs.show_title,
            parent_title: obs.season_number != null ? `Season ${obs.season_number}` : null,
            grandparent_rating_key: obs.grandparent_rating_key,
            parent_rating_key: obs.parent_rating_key,
          };
        }
      }

      if (!catalog) return null;

      // 2. Fetch audiobook details if applicable
      const audiobook = catalog.audiobook_id ? this.db.prepare(`SELECT id,title,subtitle,authors_json,narrators_json,parent_series_title,subseries_title,series_title,series_index,chapter_count,total_duration_seconds,source_provenance,enrichment_status FROM audiobook_books WHERE id=?`).get(catalog.audiobook_id) : null;

      // 3. Derive category
      const libraryName = catalog.library_title || "";
      const mediaType = catalog.media_type || "";
      const categoryObj = deriveDashboardCategory(mediaType, libraryName);
      const category = categoryObj.category;

      // 4. Fetch all plays (playback observations) for the item / show / audiobook
      let plays: DashboardActivityItem[] = [];
      if (category === "tv" || category === "classic_tv" || category === "anime") {
        const showKey = catalog.grandparent_rating_key || ratingKey;
        plays = this.getActivity({ grandparentRatingKey: showKey, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
      } else if (category === "audiobook" && catalog.audiobook_id) {
        plays = this.getActivity({ audiobookId: catalog.audiobook_id, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
      } else {
        plays = this.getActivity({ ratingKey, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
      }

      if (!plays.length) {
        plays = this.getActivity({ ratingKey, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
      }

      const first = plays[0] || {
        ratingKey,
        title: catalog.title,
        showTitle: catalog.grandparent_title,
        libraryName: catalog.library_title,
        mediaType: catalog.media_type,
        category,
        categoryLabel: categoryObj.label,
        duration: catalog.duration,
        watchedAt: new Date().toISOString(),
      };

      // 5. Exclude hidden/disabled users from aggregate details
      const peopleByName = new Map<string, { userId: number | null; displayName: string }>();
      for (const play of plays) {
        const names = play.displayNames?.length ? play.displayNames : [play.displayName];
        for (const displayName of names) {
          const sourceUserId = displayName === play.displayName ? play.userId : null;
          const existing = peopleByName.get(displayName);
          if (!existing || (existing.userId == null && sourceUserId != null)) {
            peopleByName.set(displayName, { userId: sourceUserId, displayName });
          }
        }
      }
      const people = [...peopleByName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));

      // 6. Build the rich hierarchy
      let hierarchy: any = null;

      if (category === "tv" || category === "classic_tv" || category === "anime") {
        const showKey = catalog.grandparent_rating_key || ratingKey;
        hierarchy = this.buildTvHierarchy(showKey, catalog.grandparent_title || catalog.title, plays, people);
      } else if (category === "audiobook" && audiobook) {
        const audiobookProgress = this.buildAudiobookHierarchy(audiobook, plays, people);
        hierarchy = {
          type: "audiobook",
          parentSeries: audiobook.parent_series_title,
          subseries: audiobook.subseries_title,
          series: audiobook.series_title,
          bookTitle: audiobook.title,
          chapters: audiobookProgress.chapters,
          hasVerifiedChapters: audiobookProgress.hasVerifiedChapters,
          source: audiobookProgress.source
        };
      } else {
        hierarchy = {
          type: "movie"
        };
      }

      const detailRatingKeys = [...new Set([ratingKey, ...plays.map((play) => play.ratingKey)])];
      const placeholders = detailRatingKeys.map(() => "?").join(",");
      const adjudications = detailRatingKeys.length ? this.db.prepare(`
        SELECT ca.id,ca.candidate_id candidateId,ca.rating_key ratingKey,ca.decision,ca.method,ca.created_at createdAt,
          COALESCE(NULLIF(source.dashboard_alias,''),source.plex_username) sourceName,
          COALESCE(NULLIF(target.dashboard_alias,''),target.plex_username) targetName
        FROM cowatch_adjudications ca
        JOIN users source ON source.id=ca.source_user_id
        JOIN users target ON target.id=ca.target_user_id
        WHERE ca.rating_key IN (${placeholders})
          AND COALESCE(source.dashboard_shown,source.enabled)=1
          AND COALESCE(target.dashboard_shown,target.enabled)=1
        ORDER BY ca.id DESC LIMIT 50
      `).all(...detailRatingKeys) : [];
      const replayProjection = this.aggregateReplaySemantics(plays);

      return {
        item: first,
        plays,
        people,
        observationCount: replayProjection.total.observationCount,
        sessionCount: replayProjection.total.sessionCount,
        viewingDayCount: replayProjection.total.viewingDayCount,
        replayCount: replayProjection.total.replayCount,
        replayReason: replayProjection.total.replayReason,
        repeatCount: replayProjection.total.replayCount,
        catalog,
        audiobook,
        hierarchy,
        adjudications
      };
    });
    return timed.value ? { ...timed.value, timingMs: timed.timingMs } : null;
  }

  private progressWatcherEvidence(
    displayName: string,
    state: ProgressNodeState,
    plays: DashboardActivityItem[],
    stateSource?: ProgressNodeStateSource,
    partialPosition?: number,
    userId: number | null = null,
    replaySemantics = this.replaySemanticsForPlays(plays)
  ) {
    const sourceLabels = [...new Set(plays
      .map((play) => typeof play.evidence?.sourceLabel === "string" ? play.evidence.sourceLabel : null)
      .filter((label): label is string => Boolean(label)))];
    return {
      userId,
      displayName,
      state,
      latestObservedAt: replaySemantics.latestObservedAt,
      watchCount: replaySemantics.observationCount,
      observationCount: replaySemantics.observationCount,
      sessionCount: replaySemantics.sessionCount,
      viewingDayCount: replaySemantics.viewingDayCount,
      replayCount: replaySemantics.replayCount,
      replayReason: replaySemantics.replayReason,
      ...(sourceLabels.length ? { sourceLabels } : {}),
      stateSource,
      partialPosition
    };
  }

  private visibleDashboardPeople(): DashboardWatcherPerson[] {
    return this.db.prepare(`SELECT id AS userId, COALESCE(NULLIF(dashboard_alias,''), plex_username) displayName FROM users WHERE COALESCE(dashboard_shown, enabled)=1 ORDER BY displayName COLLATE NOCASE, id`).all() as DashboardWatcherPerson[];
  }

  private buildTvHierarchy(
    showKey: string,
    showTitle: string,
    plays: DashboardActivityItem[],
    people: Array<{ displayName: string; userId?: number | null }>
  ) {
    const episodesCatalog = this.db.prepare(`
      SELECT rating_key, title, parent_title, parent_rating_key, leaf_count
      FROM content_catalog
      WHERE grandparent_rating_key = ?
      UNION
      SELECT rating_key, title, 'Season ' || season_number AS parent_title, parent_rating_key, NULL as leaf_count
      FROM playback_observations
      WHERE grandparent_rating_key = ?
    `).all(showKey, showKey) as any[];

    const episodePlays = new Map<string, DashboardActivityItem[]>();
    for (const play of plays) {
      if (!episodePlays.has(play.ratingKey)) {
        episodePlays.set(play.ratingKey, []);
      }
      episodePlays.get(play.ratingKey)!.push(play);
    }

    const seasonsMap = new Map<string, { seasonName: string; episodes: any[] }>();
    const seenEpisodes = new Set<string>();

    for (const ep of episodesCatalog) {
      if (seenEpisodes.has(ep.rating_key)) continue;
      seenEpisodes.add(ep.rating_key);

      const epPlays = episodePlays.get(ep.rating_key) || [];
      const watchedStates: { [displayName: string]: "watched" | "partial" | "repeated" | "unknown" } = {};
      const watcherEvidence: ProgressWatcherEvidence[] = [];

      for (const person of people) {
        const userPlays = epPlays.filter(p => {
          const names = p.displayNames?.length ? p.displayNames : [p.displayName];
          return names.includes(person.displayName);
        });
        const replaySemantics = this.replaySemanticsForPlays(userPlays);
        if (userPlays.length === 0) {
          watchedStates[person.displayName] = "unknown";
        } else if (userPlays.some(play => play.completed)) {
          watchedStates[person.displayName] = replaySemantics.replayCount > 0 ? "repeated" : "watched";
        } else {
          watchedStates[person.displayName] = "partial";
        }
        watcherEvidence.push(this.progressWatcherEvidence(person.displayName, watchedStates[person.displayName], userPlays, undefined, undefined, person.userId ?? null, replaySemantics));
      }

      const seasonName = ep.parent_title || "Season 1";
      if (!seasonsMap.has(seasonName)) {
        seasonsMap.set(seasonName, { seasonName, episodes: [] });
      }

      let episodeNumber = null;
      const match = ep.title.match(/(?:Episode|Ep\.)\s*(\d+)/i);
      if (match) {
        episodeNumber = Number(match[1]);
      } else if (epPlays.length > 0) {
        episodeNumber = epPlays[0].episodeNumber;
      }

      seasonsMap.get(seasonName)!.episodes.push({
        ratingKey: ep.rating_key,
        title: ep.title,
        episodeNumber,
        duration: epPlays[0]?.duration || 0,
        watchedStates,
        watcherEvidence
      });
    }

    const seasons = [...seasonsMap.values()].map(s => {
      const seasonNum = Number(s.seasonName.replace(/\D/g, "")) || 1;
      s.episodes.sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0) || a.title.localeCompare(b.title));
      return { ...s, seasonNumber: seasonNum };
    }).sort((a, b) => a.seasonNumber - b.seasonNumber);

    return {
      type: "tv" as const,
      showTitle,
      seasons
    };
  }

  private buildAudiobookHierarchy(
    audiobook: any,
    plays: DashboardActivityItem[],
    people: Array<{ displayName: string }>
  ): AudiobookChapterProgressSnapshot {
    const source = this.getActiveAudiobookChapterSource(audiobook.id);
    const cachedChapters = source ? this.getCachedAudiobookChapters(audiobook.id) : [];
    if (source && cachedChapters.length > 0) {
      return this.buildVerifiedAudiobookChapterProgress(audiobook, plays, people, source, cachedChapters);
    }

    return this.buildTrackFileAudiobookProgress(audiobook, plays, people);
  }

  private getActiveAudiobookChapterSource(audiobookId: number): CachedAudiobookSource | null {
    const source = this.db.prepare(`
      SELECT source.source_type, source.source_status, source.confidence, source.refreshed_at
      FROM audiobook_books book
      JOIN audiobook_chapter_sources source ON source.audiobook_id = book.id
      LEFT JOIN audiobook_chapter_revisions revision ON revision.id = book.active_chapter_revision_id
      WHERE book.id = ? AND source.source_status = 'active'
        AND (
          (
            book.active_chapter_revision_id IS NOT NULL
            AND revision.source_status = 'active'
            AND source.source_type = revision.source_type
            AND (book.current_media_revision IS NULL OR revision.media_revision = book.current_media_revision)
          )
          OR (
            book.active_chapter_revision_id IS NULL
            AND book.current_media_revision IS NULL
          )
        )
      ORDER BY source.confidence DESC, source.refreshed_at DESC
      LIMIT 1
    `).get(audiobookId) as CachedAudiobookSource | undefined;
    return source ?? null;
  }

  private getCachedAudiobookChapters(audiobookId: number): CachedAudiobookChapter[] {
    return (this.db.prepare(`
      SELECT chapter_index, title, start_offset_ms, end_offset_ms
      FROM audiobook_chapters
      WHERE audiobook_id = ?
      ORDER BY chapter_index, start_offset_ms
    `).all(audiobookId) as CachedAudiobookChapter[])
      .filter((chapter) => chapter.end_offset_ms > chapter.start_offset_ms);
  }

  private buildVerifiedAudiobookChapterProgress(
    audiobook: any,
    plays: DashboardActivityItem[],
    people: Array<{ displayName: string; userId?: number | null }>,
    source: CachedAudiobookSource,
    cachedChapters: CachedAudiobookChapter[]
  ): AudiobookChapterProgressSnapshot {
    const bookDurationMs = Math.max(...cachedChapters.map((chapter) => chapter.end_offset_ms));
    const currentPosition = this.resolveCurrentAudiobookPosition(plays, cachedChapters, bookDurationMs);
    const completedChapters = new Set<number>();
    const touchedChapters = new Set<number>();
    const replaySemantics = emptyReplaySemantics();
    const peopleStats = new Map<string, { distinctItems: number; distinctCompleted: number; partials: number; observationCount: number; sessionCount: number; viewingDayCount: number; replayCount: number }>();

    const chapters = cachedChapters.map((chapter) => {
      const watchedStates: Record<string, ProgressNodeState> = {};
      const stateSources: Record<string, ProgressNodeStateSource> = {};
      const partialPositions: Record<string, number> = {};
      const watcherEvidence: ProgressWatcherEvidence[] = [];

      for (const person of people) {
        const userPlays = plays.filter((play) => {
          const names = play.displayNames?.length ? play.displayNames : [play.displayName];
          return names.includes(person.displayName);
        });

        const mappedStates: ProgressNodeState[] = [];
        const mappedSources: ProgressNodeStateSource[] = [];
        const mappedPartials: number[] = [];
        const mappedPlays: DashboardActivityItem[] = [];
        const mappedReplayObservations: ReplayObservation[] = [];
        let sawUncertainEvidence = false;

        for (const play of userPlays) {
          const offset = this.resolveAudiobookOffsetMs(play, bookDurationMs);
          if (offset.status === "valid") {
            if (offset.value >= chapter.end_offset_ms) {
              mappedStates.push("watched");
              mappedSources.push("verified_offset");
              mappedPlays.push(play);
              mappedReplayObservations.push(this.replayObservation(play, true, 100));
            } else if (offset.value > chapter.start_offset_ms && offset.value < chapter.end_offset_ms) {
              mappedStates.push("partial");
              mappedSources.push("verified_offset");
              const chapterPercent = Math.round(((offset.value - chapter.start_offset_ms) / (chapter.end_offset_ms - chapter.start_offset_ms)) * 100);
              mappedPartials.push(chapterPercent);
              mappedPlays.push(play);
              mappedReplayObservations.push(this.replayObservation(play, false, chapterPercent));
            }
          } else if (play.completed) {
            mappedStates.push("watched");
            mappedSources.push("book_completion");
            mappedPlays.push(play);
            mappedReplayObservations.push(this.replayObservation(play, true, 100));
          } else if (offset.status === "uncertain") {
            sawUncertainEvidence = true;
            mappedPlays.push(play);
            mappedReplayObservations.push(this.replayObservation(play, false, null));
          }
        }

        const personReplaySemantics = evaluateReplaySemantics(mappedReplayObservations);
        let state: ProgressNodeState = "unknown";
        let stateSource: ProgressNodeStateSource = "none";
        const hasWatchedEvidence = mappedStates.includes("watched") || mappedStates.includes("repeated");
        if (hasWatchedEvidence && personReplaySemantics.replayCount > 0) {
          state = "repeated";
          stateSource = mappedSources.includes("book_completion") ? "book_completion" : "verified_offset";
        } else if (hasWatchedEvidence) {
          state = "watched";
          stateSource = mappedSources[mappedStates.indexOf("watched")] ?? "verified_offset";
        } else if (mappedStates.includes("partial")) {
          state = "partial";
          stateSource = "verified_offset";
        } else if (sawUncertainEvidence) {
          state = "source_uncertain";
          stateSource = "source_uncertain";
        }

        watchedStates[person.displayName] = state;
        stateSources[person.displayName] = stateSource;
        if (state === "partial" && mappedPartials.length > 0) {
          partialPositions[person.displayName] = Math.max(...mappedPartials);
        }
        watcherEvidence.push(this.progressWatcherEvidence(person.displayName, state, mappedPlays, stateSource, partialPositions[person.displayName], person.userId ?? null, personReplaySemantics));
        addReplaySemantics(replaySemantics, personReplaySemantics);

        if (state === "watched" || state === "repeated" || state === "partial") {
          touchedChapters.add(chapter.chapter_index);
        }
        if (state === "watched" || state === "repeated") {
          completedChapters.add(chapter.chapter_index);
        }

        const stats = peopleStats.get(person.displayName) ?? { distinctItems: 0, distinctCompleted: 0, partials: 0, observationCount: 0, sessionCount: 0, viewingDayCount: 0, replayCount: 0 };
        if (state === "watched" || state === "repeated" || state === "partial") stats.distinctItems += 1;
        if (state === "watched" || state === "repeated") stats.distinctCompleted += 1;
        if (state === "partial" || state === "source_uncertain") stats.partials += 1;
        stats.observationCount += personReplaySemantics.observationCount;
        stats.sessionCount += personReplaySemantics.sessionCount;
        stats.viewingDayCount += personReplaySemantics.viewingDayCount;
        stats.replayCount += personReplaySemantics.replayCount;
        peopleStats.set(person.displayName, stats);
      }

      return {
        ratingKey: `audiobook:${audiobook.id}:chapter:${chapter.chapter_index}`,
        title: chapter.title,
        chapterIndex: chapter.chapter_index,
        startOffsetMs: chapter.start_offset_ms,
        endOffsetMs: chapter.end_offset_ms,
        duration: chapter.end_offset_ms - chapter.start_offset_ms,
        watchedStates,
        watcherEvidence,
        stateSources,
        partialPositions,
        sourceType: "audiobook_tool" as const,
        sourceStatus: source.source_status,
        sourceConfidence: source.confidence,
        sourceRefreshedAt: source.refreshed_at,
        nodeKind: "chapter" as const
      };
    });

    return {
      hasVerifiedChapters: true,
      source,
      chapters,
      distinctItems: touchedChapters.size,
      distinctCompleted: completedChapters.size,
      currentChapterIndex: currentPosition?.chapterIndex ?? null,
      currentProgressPercent: currentPosition?.progressPercent ?? null,
      replaySemantics,
      peopleStats
    };
  }

  private resolveCurrentAudiobookPosition(
    plays: DashboardActivityItem[],
    cachedChapters: CachedAudiobookChapter[],
    bookDurationMs: number
  ): { chapterIndex: number; progressPercent: number } | null {
    const orderedPlays = [...plays].sort((a, b) => b.watchedAt.localeCompare(a.watchedAt) || b.id - a.id);
    for (const play of orderedPlays) {
      const offset = this.resolveAudiobookOffsetMs(play, bookDurationMs);
      if (offset.status === "valid") {
        const chapter = cachedChapters.find((candidate) => offset.value < candidate.end_offset_ms) ?? cachedChapters[cachedChapters.length - 1];
        if (!chapter) continue;
        const sourcePercent = Number(play.percentComplete);
        const progressPercent = Number.isFinite(sourcePercent)
          ? Math.max(0, Math.min(100, Math.round(sourcePercent)))
          : Math.max(0, Math.min(100, Math.round((offset.value / bookDurationMs) * 100)));
        return { chapterIndex: chapter.chapter_index, progressPercent };
      }
      if (play.completed) {
        const finalChapter = cachedChapters[cachedChapters.length - 1];
        if (finalChapter) return { chapterIndex: finalChapter.chapter_index, progressPercent: 100 };
      }
    }
    return null;
  }

  private resolveAudiobookOffsetMs(play: DashboardActivityItem, bookDurationMs: number): { status: "valid"; value: number } | { status: "missing" | "uncertain" } {
    let offset = normalizeAudiobookEvidenceOffsetMs(play.viewOffset, bookDurationMs);
    if (offset <= 0 && play.percentComplete != null && bookDurationMs > 0) {
      offset = Math.round(bookDurationMs * Math.max(0, Math.min(100, play.percentComplete)) / 100);
      if (Number.isFinite(Number(play.percentComplete))) {
        return { status: "valid", value: offset };
      }
    }
    if (offset <= 0) {
      return play.viewOffset != null || play.percentComplete != null ? { status: "uncertain" } : { status: "missing" };
    }
    if (bookDurationMs > 0 && offset > bookDurationMs * 1.05) {
      return { status: "uncertain" };
    }
    return { status: "valid", value: Math.min(offset, bookDurationMs || offset) };
  }

  private buildTrackFileAudiobookProgress(
    audiobook: any,
    plays: DashboardActivityItem[],
    people: Array<{ displayName: string; userId?: number | null }>
  ): AudiobookChapterProgressSnapshot {
    const chaptersCatalog = this.db.prepare(`
      SELECT rating_key, title, duration
      FROM content_catalog
      WHERE audiobook_id = ?
      ORDER BY title, rating_key
    `).all(audiobook.id) as any[];

    const chapterPlays = new Map<string, DashboardActivityItem[]>();
    for (const play of plays) {
      if (!chapterPlays.has(play.ratingKey)) {
        chapterPlays.set(play.ratingKey, []);
      }
      chapterPlays.get(play.ratingKey)!.push(play);
    }

    const completedTracks = new Set<string>();
    const touchedTracks = new Set<string>();
    const replaySemantics = emptyReplaySemantics();
    const peopleStats = new Map<string, { distinctItems: number; distinctCompleted: number; partials: number; observationCount: number; sessionCount: number; viewingDayCount: number; replayCount: number }>();

    const chapters = chaptersCatalog.map(ch => {
      const chPlays = chapterPlays.get(ch.rating_key) || [];
      const watchedStates: Record<string, ProgressNodeState> = {};
      const stateSources: Record<string, ProgressNodeStateSource> = {};
      const watcherEvidence: ProgressWatcherEvidence[] = [];

      for (const person of people) {
        const userPlays = chPlays.filter(p => {
          const names = p.displayNames?.length ? p.displayNames : [p.displayName];
          return names.includes(person.displayName);
        });
        const personReplaySemantics = this.replaySemanticsForPlays(userPlays);
        let state: ProgressNodeState = "unknown";
        if (userPlays.some(play => play.completed)) state = personReplaySemantics.replayCount > 0 ? "repeated" : "watched";
        else if (userPlays.length > 0) state = "partial";
        watchedStates[person.displayName] = state;
        stateSources[person.displayName] = state === "unknown" ? "none" : "track_file";
        watcherEvidence.push(this.progressWatcherEvidence(person.displayName, state, userPlays, stateSources[person.displayName], undefined, person.userId ?? null, personReplaySemantics));
        addReplaySemantics(replaySemantics, personReplaySemantics);

        if (state === "watched" || state === "repeated" || state === "partial") touchedTracks.add(ch.rating_key);
        if (state === "watched" || state === "repeated") completedTracks.add(ch.rating_key);

        const stats = peopleStats.get(person.displayName) ?? { distinctItems: 0, distinctCompleted: 0, partials: 0, observationCount: 0, sessionCount: 0, viewingDayCount: 0, replayCount: 0 };
        if (state === "watched" || state === "repeated" || state === "partial") stats.distinctItems += 1;
        if (state === "watched" || state === "repeated") stats.distinctCompleted += 1;
        if (state === "partial") stats.partials += 1;
        stats.observationCount += personReplaySemantics.observationCount;
        stats.sessionCount += personReplaySemantics.sessionCount;
        stats.viewingDayCount += personReplaySemantics.viewingDayCount;
        stats.replayCount += personReplaySemantics.replayCount;
        peopleStats.set(person.displayName, stats);
      }

      return {
        ratingKey: ch.rating_key,
        title: ch.title,
        duration: ch.duration || chPlays[0]?.duration || 0,
        watchedStates,
        watcherEvidence,
        stateSources,
        partialPositions: {},
        nodeKind: "track" as const
      };
    });

    return {
      hasVerifiedChapters: false,
      source: null,
      chapters,
      distinctItems: touchedTracks.size,
      distinctCompleted: completedTracks.size,
      replaySemantics,
      peopleStats
    };
  }

  getProgressExpansion(groupKey: string): ProgressHierarchyExpansion | null {
    const timed = withTiming(() => {
      const tvMatch = groupKey.match(/^series:(tv|classic_tv|anime):([^:]+):(.+)$/);
      if (tvMatch) {
        const category = tvMatch[1] as DashboardCategory;
        const grandparentRatingKey = tvMatch[3];

        const catalog = this.db.prepare(`
          SELECT title, leaf_count
          FROM content_catalog
          WHERE rating_key = ?
        `).get(grandparentRatingKey) as any;

        if (!catalog) return null;

        const plays = this.getActivity({ grandparentRatingKey, limit: DETAIL_HIERARCHY_HISTORY_LIMIT, offset: 0 }).items;
        const people = this.visibleDashboardPeople();

        const hierarchy = this.buildTvHierarchy(grandparentRatingKey, catalog.title, plays, people);

        // Calculate distinct completed
        const distinctCompleted = new Set<string>();
        const distinctItems = new Set<string>();
        for (const play of plays) {
          distinctItems.add(play.ratingKey);
          if (play.completed) {
            distinctCompleted.add(play.ratingKey);
          }
        }

        const artwork = buildDashboardArtworkDescriptor(this.db, grandparentRatingKey);
        const result: ProgressHierarchyExpansion = {
          groupKey,
          category,
          title: catalog.title,
          artworkUrl: artwork.artworkUrl,
          posterUrl: artwork.posterUrl,
          artworkRevision: artwork.artworkRevision,
          progressUnit: "episode",
          progressUnitLabel: "episodes",
          progressSource: "plex",
          progressSourceVerified: true,
          totalKnown: Boolean(catalog.leaf_count && catalog.leaf_count > 0),
          totalItems: catalog.leaf_count || null,
          distinctItems: distinctItems.size,
          distinctCompleted: distinctCompleted.size,
          people,
          hierarchy,
          timingMs: 0
        };
        return result;
      }

      const abMatch = groupKey.match(/^audiobook:([^:]+):(.+)$/);
      if (abMatch) {
        const audiobookId = Number(abMatch[2]);
        const audiobook = this.db.prepare(`
          SELECT id, title, parent_series_title, subseries_title, series_title, chapter_count, cover_url
          FROM audiobook_books
          WHERE id = ?
        `).get(audiobookId) as any;

        if (!audiobook) return null;

        const plays = this.getActivity({ audiobookId, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
        const people = this.visibleDashboardPeople();

        const audiobookProgress = this.buildAudiobookHierarchy(audiobook, plays, people);
        const hierarchy = {
          type: "audiobook" as const,
          parentSeries: audiobook.parent_series_title,
          subseries: audiobook.subseries_title,
          series: audiobook.series_title,
          bookTitle: audiobook.title,
          chapters: audiobookProgress.chapters,
          hasVerifiedChapters: audiobookProgress.hasVerifiedChapters,
          currentChapterIndex: audiobookProgress.currentChapterIndex ?? null,
          currentProgressPercent: audiobookProgress.currentProgressPercent ?? null,
          source: audiobookProgress.source
        };

        const distinctCompleted = new Set<string>();
        const distinctItems = new Set<string>();
        for (const play of plays) {
          distinctItems.add(play.ratingKey);
          if (play.completed) {
            distinctCompleted.add(play.ratingKey);
          }
        }

        const hasVerifiedChapters = audiobookProgress.hasVerifiedChapters;
        const progressUnit = hasVerifiedChapters ? "chapter" : "track";
        const progressUnitLabel = hasVerifiedChapters ? "chapters" : "tracks/files";
        const progressSource = hasVerifiedChapters ? "audiobook_tool" : "plex";
        const progressSourceVerified = hasVerifiedChapters;
        const totalKnown = hasVerifiedChapters;
        const totalItems = hasVerifiedChapters ? audiobookProgress.chapters.length : (audiobook.chapter_count || null);

        const artwork = buildDashboardArtworkDescriptor(this.db, `audiobook:${audiobookId}`);
        const result: ProgressHierarchyExpansion = {
          groupKey,
          category: "audiobook",
          title: audiobook.title,
          artworkUrl: artwork.artworkUrl,
          posterUrl: artwork.posterUrl,
          artworkRevision: artwork.artworkRevision,
          progressUnit,
          progressUnitLabel,
          progressSource,
          progressSourceVerified,
          hasVerifiedChapters,
          currentChapterIndex: hasVerifiedChapters ? (audiobookProgress.currentChapterIndex ?? null) : null,
          currentProgressPercent: hasVerifiedChapters ? (audiobookProgress.currentProgressPercent ?? null) : null,
          totalKnown,
          totalItems,
          distinctItems: hasVerifiedChapters ? audiobookProgress.distinctItems : distinctItems.size,
          distinctCompleted: hasVerifiedChapters ? audiobookProgress.distinctCompleted : distinctCompleted.size,
          people,
          hierarchy,
          timingMs: 0
        };
        return result;
      }

      const mvMatch = groupKey.match(/^movie:([^:]+):(.+)$/);
      if (mvMatch) {
        const ratingKey = getCanonicalMovieRatingKey(this.db, mvMatch[2]);
        const movieKeys = getMovieIdentityKeys(this.db, ratingKey);
        const movieKeyPlaceholders = movieKeys.map(() => "?").join(",");
        const catalog = this.db.prepare(`
          SELECT title, duration, library_title, media_type, leaf_count, source_provenance
          FROM content_catalog
          WHERE rating_key IN (${movieKeyPlaceholders})
          ORDER BY CASE WHEN rating_key = ? THEN 0 ELSE 1 END
          LIMIT 1
        `).get(...movieKeys, ratingKey) as any;

        if (!catalog) return null;

        const plays = this.getActivity({ ratingKey, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
        const peopleByName = new Map<string, { displayName: string }>();
        for (const play of plays) {
          const names = play.displayNames?.length ? play.displayNames : [play.displayName];
          for (const displayName of names) {
            peopleByName.set(displayName, { displayName });
          }
        }
        const people = [...peopleByName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));

        const artwork = buildDashboardArtworkDescriptor(this.db, ratingKey);
        const result: ProgressHierarchyExpansion = {
          groupKey,
          category: "movie",
          title: catalog.title,
          artworkUrl: artwork.artworkUrl,
          posterUrl: artwork.posterUrl,
          artworkRevision: artwork.artworkRevision,
          progressUnit: "movie",
          progressUnitLabel: "movie",
          progressSource: "plex",
          progressSourceVerified: true,
          totalKnown: true,
          totalItems: 1,
          distinctItems: 1,
          distinctCompleted: plays.some(p => p.completed) ? 1 : 0,
          people,
          hierarchy: { type: "movie" },
          timingMs: 0
        };
        return result;
      }

      return null;
    });

    return timed.value ? { ...timed.value, timingMs: timed.timingMs } : null;
  }


  private mapActivity(row: any, cowatchMap?: Map<number, { event: any; participant: any }>): DashboardActivityItem {
    const libraryName = resolveLibraryName(row.library_name, row.catalog_library_title ?? row.group_catalog_library_title);
    const category = deriveDashboardCategory(row.media_type, libraryName);
    if (!isHouseholdCategory(category.category)) return null as any;
    const canonicalRatingKey = category.category === "movie" ? getCanonicalMovieRatingKey(this.db, String(row.rating_key)) : String(row.rating_key);
    const artworkKey = this.resolveArtworkKey({ ...row, rating_key: canonicalRatingKey }, category.category);
    const artwork = buildDashboardArtworkDescriptor(this.db, artworkKey);
    const displayName = resolveDashboardAlias(row.dashboard_alias, row.plex_username);
    
    const cowatch = cowatchMap?.get(row.id);
    let relationship = "watched_by";
    if (cowatch) {
      const hasConfirmed = cowatch.event.participants.some((p: any) => p.evidenceState === "confirmed");
      const hasInferred = cowatch.event.participants.some((p: any) => p.evidenceState === "inferred");
      if (hasConfirmed) {
        relationship = "together";
      } else if (hasInferred) {
        relationship = "likely_together";
      } else if (cowatch.event.participants.some((p: any) => p.evidenceState === "dismissed")) {
        relationship = "none";
      }
    }

    let displayNames: string[] = [];
    let confirmedUserIds: number[] = [];
    if (cowatch && (relationship === "together" || relationship === "likely_together")) {
      const eventParts = cowatch.event.participants.filter((p: any) => {
        if (p.userId === row.user_id) return true;
        const u = this.db.prepare("SELECT dashboard_shown, enabled FROM users WHERE id = ?").get(p.userId) as any;
        if (!u) return false;
        const shown = u.dashboard_shown !== null ? u.dashboard_shown === 1 : u.enabled === 1;
        if (!shown) return false;
        return p.evidenceState === "confirmed" || p.evidenceState === "inferred" || p.role === "source";
      });
      displayNames = [...new Set<string>(eventParts.map((p: any) => String(p.displayName || "")))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      confirmedUserIds = eventParts.filter((p: any) => p.evidenceState === "confirmed").map((p: any) => p.userId);
    } else {
      const confirmedParticipants = parseConfirmedParticipants(row.confirmed_participants_json);
      displayNames = [...new Set([displayName, ...confirmedParticipants.map((participant) => participant.displayName)])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      confirmedUserIds = confirmedParticipants.map((participant) => participant.userId);
    }
    
    return { 
      id: row.id, 
      userId: row.user_id, 
      username: row.plex_username, 
      displayName,
      displayNames,
      confirmedUserIds,
      displayTitle: resolveDashboardDisplayTitle({
        category: category.category,
        title: row.title,
        showTitle: row.show_title ?? undefined,
        audiobookTitle: row.audiobook_title ?? undefined,
        parentTitle: row.catalog_parent_title ?? undefined
      }),
      ratingKey: canonicalRatingKey,
      detailKey: activityDetailKey(category.category, canonicalRatingKey, row.grandparent_rating_key, row.audiobook_id),
      title: row.title, 
      showTitle: row.show_title ?? undefined, 
      parentTitle: row.catalog_parent_title ?? undefined,
      grandparentTitle: row.catalog_grandparent_title ?? undefined,
      mediaType: row.media_type, 
      category: category.category, 
      categoryLabel: category.label, 
      categoryDerived: category.derived, 
      libraryName, 
      watchedAt: row.watched_at, 
      sessionStartAt: row.session_start_at ?? undefined,
      sessionEndAt: row.session_end_at ?? undefined,
      duration: row.duration ?? undefined,
      viewOffset: row.view_offset ?? undefined,
      percentComplete: row.percent_complete ?? undefined, 
      completed: row.completed === 1, 
      artworkUrl: artwork.artworkUrl,
      posterUrl: artwork.posterUrl,
      artworkRevision: artwork.artworkRevision,
      grandparentRatingKey: row.grandparent_rating_key ?? undefined, 
      parentRatingKey: row.parent_rating_key ?? undefined, 
      audiobookId: row.audiobook_id ?? undefined, 
      audiobookTitle: row.audiobook_title ?? undefined, 
      seasonNumber: row.season_number ?? undefined, 
      episodeNumber: row.episode_number ?? undefined, 
        evidence: { 
          observed: true, 
          confirmed: row.confirmation_status === "confirmed" || confirmedUserIds.length > 0 || Boolean(cowatch && cowatch.event.participants.some((p: any) => {
            const u = this.db.prepare("SELECT dashboard_shown, enabled FROM users WHERE id = ?").get(p.userId) as any;
            const shown = u ? (u.dashboard_shown !== null ? u.dashboard_shown === 1 : u.enabled === 1) : false;
            return shown && p.evidenceState === "confirmed";
          })),
          relationship,
          cowatchEventId: (relationship === "together" || relationship === "likely_together") ? (cowatch?.event.id ?? null) : null,
          ruleVersion: cowatch?.event.ruleVersion ?? null,
          timingRelationship: cowatch?.participant.timingRelationship ?? null,
          reason: cowatch?.participant.reason ?? null,
          confidence: cowatch?.participant.confidence ?? (relationship === "together" ? 1.0 : 0.0),
          promptStatus: row.prompt_status ?? null, 
          plexSyncStatus: row.plex_sync_status ?? null, 
          sourceRatingKey: row.rating_key,
          sourcePlexGuid: row.plex_guid ?? null,
          sources: row.plex_history_linked
            ? ["Tautulli", "Plex play history"]
            : row.watched_at_provenance === "plex_play_history"
              ? ["Plex play history"]
              : ["Tautulli"],
          sourceLabel: row.plex_history_linked
            ? "Plex + Tautulli"
            : row.watched_at_provenance === "plex_play_history"
              ? "Plex play history"
              : "Tautulli",
          watchedAtProvenance: row.watched_at_provenance ?? "unknown", 
        percentCompleteProvenance: row.percent_complete_provenance ?? "unknown" 
      } 
    };
  }

  private resolveArtworkKey(row: any, category: DashboardCategory): string {
    if (category === "audiobook") {
      return `audiobook:${row.audiobook_id ?? row.parent_rating_key ?? row.grandparent_rating_key ?? row.rating_key}`;
    }
    if (category === "tv" || category === "anime" || category === "classic_tv") {
      return row.grandparent_rating_key ?? row.rating_key;
    }
    return category === "movie" ? getCanonicalMovieRatingKey(this.db, String(row.rating_key)) : row.rating_key;
  }

  private resolveArtworkDescriptor(item: DashboardActivityItem, fallbackKey: string): Pick<DashboardArtworkDescriptor, "artworkUrl" | "posterUrl" | "artworkRevision"> {
    const key = item.category === "audiobook"
      ? (item.audiobookId != null ? `audiobook:${item.audiobookId}` : fallbackKey)
      : fallbackKey;
    const descriptor = buildDashboardArtworkDescriptor(this.db, key);
    return {
      artworkUrl: descriptor.artworkUrl,
      posterUrl: descriptor.posterUrl,
      artworkRevision: descriptor.artworkRevision
    };
  }

  private buildRecentPlaybackCards(items: DashboardActivityItem[], limit: number): DashboardActivityItem[] {
    const sessionGapMs = 2 * 60 * 60 * 1000;
    type SessionGroup = {
      canonicalKey: string;
      items: DashboardActivityItem[];
      startMs: number;
      endMs: number;
      completedUsers: Set<number>;
      eventIds: Set<string>;
    };
    const groupsByCanonical = new Map<string, SessionGroup[]>();
    const groupsByEvent = new Map<string, SessionGroup>();
    const groups: SessionGroup[] = [];
    const ordered = [...items].sort((a, b) => a.watchedAt.localeCompare(b.watchedAt) || a.id - b.id);

    const canonicalKey = (item: DashboardActivityItem) => {
      if (item.category === "audiobook") {
        const title = resolveDashboardDisplayTitle(item).toLocaleLowerCase();
        const author = (item.showTitle ?? "").trim().toLocaleLowerCase();
        return `audiobook:${item.libraryName ?? ""}:${author}:${title}`;
      }
      return `${item.category}:${item.ratingKey}`;
    };
    const eventId = (item: DashboardActivityItem) => {
      const value = item.evidence?.cowatchEventId;
      return value == null || value === "" ? null : String(value);
    };
    const addToGroup = (group: SessionGroup, item: DashboardActivityItem) => {
      const watchedMs = new Date(item.watchedAt).getTime();
      group.items.push(item);
      group.startMs = Math.min(group.startMs, watchedMs);
      group.endMs = Math.max(group.endMs, watchedMs);
      if (item.completed) group.completedUsers.add(item.userId);
      const stableEventId = eventId(item);
      if (stableEventId) {
        group.eventIds.add(stableEventId);
        groupsByEvent.set(`${group.canonicalKey}:${stableEventId}`, group);
      }
    };

    for (const item of ordered) {
      const key = canonicalKey(item);
      const stableEventId = eventId(item);
      let group = stableEventId ? groupsByEvent.get(`${key}:${stableEventId}`) : undefined;
      if (!group && stableEventId) {
        const candidates = groupsByCanonical.get(key) ?? [];
        const candidate = candidates[candidates.length - 1];
        const watchedMs = new Date(item.watchedAt).getTime();
        const withinGap = candidate && watchedMs - candidate.endMs < sessionGapMs;
        const replayAfterCompletion = candidate && candidate.completedUsers.has(item.userId);
        if (withinGap && !replayAfterCompletion && candidate.eventIds.size === 0) group = candidate;
      }
      if (!group && !stableEventId) {
        const candidates = groupsByCanonical.get(key) ?? [];
        const watchedMs = new Date(item.watchedAt).getTime();
        const candidate = candidates[candidates.length - 1];
        const withinGap = candidate && watchedMs - candidate.endMs < sessionGapMs;
        const replayAfterCompletion = candidate && candidate.completedUsers.has(item.userId);
        if (withinGap && !replayAfterCompletion) group = candidate;
      }
      if (!group) {
        const watchedMs = new Date(item.watchedAt).getTime();
        group = { canonicalKey: key, items: [], startMs: watchedMs, endMs: watchedMs, completedUsers: new Set<number>(), eventIds: new Set<string>() };
        groups.push(group);
        const candidates = groupsByCanonical.get(key) ?? [];
        candidates.push(group);
        groupsByCanonical.set(key, candidates);
      }
      addToGroup(group, item);
    }

    const result = groups.map((group) => {
      const groupItems = [...group.items].sort((a, b) => b.watchedAt.localeCompare(a.watchedAt) || b.id - a.id);
      const primary = groupItems[0];
      const displayNames = [...new Set(groupItems.flatMap(it => it.displayNames ?? [it.displayName]))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      const confirmedUserIds = [...new Set(groupItems.flatMap(it => it.confirmedUserIds ?? []))];
      const relationship = groupItems.some(it => it.evidence?.relationship === "together")
        ? "together"
        : groupItems.some(it => it.evidence?.relationship === "likely_together")
          ? "likely_together"
          : "watched_by";
      const sessionStartAt = new Date(group.startMs).toISOString();
      const sessionEndAt = new Date(group.endMs).toISOString();
      return {
        ...primary,
        watchedAt: sessionEndAt,
        sessionStartAt,
        sessionEndAt,
        displayNames,
        displayName: displayNames.join(" + "),
        confirmedUserIds,
        evidence: { ...primary.evidence, relationship, sessionStartAt, sessionEndAt }
      } satisfies DashboardActivityItem;
    });

    return result.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt)).slice(0, limit);
  }
}
