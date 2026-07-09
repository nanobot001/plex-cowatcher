import { z } from "zod";
import type { Db } from "../db/database.js";
import type { DashboardActivityItem, DashboardCategory, DashboardTimelineSession, DashboardProgressResponse, DashboardProgressGroup, DashboardProgressPersonContext, DashboardProgressBucket, ProgressHierarchyExpansion, ProgressNodeState, ProgressNodeStateSource } from "../types/api.js";
import { CowatchingIntelligenceService } from "./cowatchingIntelligenceService.js";
import { CowatchAdjudicationService } from "./cowatchAdjudicationService.js";

const HOUSEHOLD_CATEGORIES = ["movie", "tv", "classic_tv", "anime", "audiobook"] as const;
const SUMMARY_SAMPLE_LIMIT = 500;
const DETAIL_SAMPLE_LIMIT = 200;
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
  peopleStats: Map<string, { distinctItems: number; distinctCompleted: number; partials: number }>;
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
    title = title.replace(/\s*\(([^()]+)\)\s*$/, "");
  }
  title = title.replace(/^Cosmere\s+/i, "");
  return title.trim();
}

function resolveDashboardDisplayTitle(item: Pick<DashboardActivityItem, "category" | "showTitle" | "title" | "audiobookTitle" | "parentTitle">): string {
  if (item.category === "audiobook") {
    return normalizeAudiobookDisplayTitle(item.audiobookTitle ?? item.parentTitle ?? item.title) || item.showTitle?.trim() || "";
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
  if (type === "audiobook" || library.includes("audiobook")) return { category: "audiobook", label: "Audiobooks", derived: type !== "audiobook" };
  if (library.includes("anime")) return { category: "anime", label: "Anime", derived: true };
  if (library.includes("classic")) return { category: "classic_tv", label: "Classic TV", derived: true };
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

  constructor(private readonly db: Db) {
    this.cowatchingService = new CowatchingIntelligenceService(db);
    this.adjudicationService = new CowatchAdjudicationService(db);
  }

  getActivity(input: unknown): { items: DashboardActivityItem[]; total: number; limit: number; offset: number } {
    const p = parseFilters(input);
    let where = " WHERE COALESCE(u.dashboard_shown, u.enabled) = 1";
    const args: any[] = [];
    if (p.dateFrom) { where += " AND po.watched_at >= ?"; args.push(new Date(p.dateFrom).toISOString()); }
    if (p.dateTo) { where += " AND po.watched_at <= ?"; args.push(new Date(p.dateTo).toISOString()); }
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
    const from = ` FROM playback_observations po JOIN users u ON u.id=po.user_id LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key LEFT JOIN audiobook_books ab ON ab.id=cat.audiobook_id LEFT JOIN watch_events we ON we.rating_key=po.rating_key AND we.source_user_id=po.user_id AND we.watched_at >= strftime('%Y-%m-%dT%H:%M:%fZ', po.watched_at, '-600 seconds') AND we.watched_at <= strftime('%Y-%m-%dT%H:%M:%fZ', po.watched_at, '+600 seconds') LEFT JOIN cowatch_confirmations cc ON cc.watch_event_id=we.id AND cc.target_user_id=po.user_id`;
    const total = Number((this.db.prepare(`SELECT count(*) total${from}${where}`).get(...args) as any).total);
    const order = p.sort === "title" ? "po.title COLLATE NOCASE, po.rating_key, po.watched_at DESC, po.id DESC" : p.sort === "progress" ? "po.percent_complete DESC, po.watched_at DESC, po.id DESC" : "po.watched_at DESC, po.id DESC";
    const confirmedUserFilter = p.user ? " AND confirmed_user.plex_username = ?" : "";
    const confirmedArgs = p.user ? [p.user] : [];
    const confirmedParticipantsSql = `(SELECT json_group_array(json_object('userId', confirmed_user.id, 'displayName', COALESCE(NULLIF(confirmed_user.dashboard_alias, ''), confirmed_user.plex_username))) FROM cowatch_confirmations confirmed JOIN users confirmed_user ON confirmed_user.id=confirmed.target_user_id WHERE confirmed.watch_event_id=we.id AND confirmed.status='confirmed' AND COALESCE(confirmed_user.dashboard_shown, confirmed_user.enabled)=1${confirmedUserFilter}) AS confirmed_participants_json`;
    const rows = this.db.prepare(`SELECT po.*,u.plex_username,u.display_name AS synced_display_name,u.dashboard_alias,u.dashboard_shown,we.prompt_status,cc.status confirmation_status,cc.plex_sync_status,cat.library_title AS catalog_library_title,groupcat.library_title AS group_catalog_library_title,cat.audiobook_id AS audiobook_id,ab.title AS audiobook_title,cat.parent_title AS catalog_parent_title,cat.grandparent_title AS catalog_grandparent_title,${confirmedParticipantsSql}${from}${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...confirmedArgs, ...args, p.limit, p.offset) as any[];

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
          needsAttention: "Open operational issues"
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

    const metadataGaps = this.db.prepare(`
      SELECT
        po.rating_key,
        po.title,
        po.show_title,
        po.watched_at,
        u.plex_username,
        COALESCE(NULLIF(u.dashboard_alias, ''), u.plex_username) AS display_name,
        po.media_type,
        po.library_name
      FROM playback_observations po
      JOIN users u ON u.id = po.user_id
      LEFT JOIN content_catalog cat ON cat.rating_key = po.rating_key
      WHERE COALESCE(u.dashboard_shown, u.enabled) = 1
        AND cat.rating_key IS NULL
      ORDER BY po.watched_at DESC
      LIMIT 6
    `).all() as any[];
    for (const row of metadataGaps) {
      const derived = deriveDashboardCategory(row.media_type, row.library_name);
      if (!isHouseholdCategory(derived.category)) continue;
      items.push({
        kind: "missing_metadata",
        title: row.show_title || row.title,
        detail: `${row.display_name} has visible playback missing catalog metadata`,
        status: "missing",
        watchedAt: row.watched_at,
        ratingKey: row.rating_key,
        user: row.plex_username,
        route: { layout: "timeline", filters: { user: row.plex_username } }
      });
    }

    const uncertainRows = this.getActivity({ limit: 120, offset: 0 }).items.filter((item) => item.categoryDerived);
    for (const item of uncertainRows.slice(0, 6)) {
      items.push({
        kind: "uncertain_classification",
        title: item.displayTitle ?? item.title,
        detail: `${item.displayName} is shown through a derived ${item.categoryLabel} classification`,
        status: "review",
        watchedAt: item.watchedAt,
        ratingKey: item.ratingKey,
        user: item.username,
        route: { layout: "timeline", filters: { user: item.username, category: item.category } }
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
        const group = groups.get(key) ?? { ...item, title, showTitle: undefined, displayTitle: title, groupKey: key, groupRatingKey, plays: 0, distinctItems: new Set<string>(), people: new Set<number>(), displayNames: new Set<string>(), latestWatchedAt: item.watchedAt, artworkUrl: this.resolveArtworkUrl(item, groupRatingKey), evidence: undefined };
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
      const earliest = this.db.prepare(`SELECT MIN(po.watched_at) AS watched_at
        FROM playback_observations po JOIN users u ON u.id=po.user_id
        WHERE COALESCE(u.dashboard_shown,u.enabled)=1`).get() as { watched_at?: string | null };
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
    const allDirect: PeopleContribution[] = directRows.map((row) => ({
      ...this.mapActivity(row),
      contribution: "observed" as const,
      confirmedTogether: false
    }));
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

        const artworkUrl = item.category === "audiobook"
          ? `/api/artwork/audiobook%3A${item.audiobookId ?? item.parentRatingKey ?? item.grandparentRatingKey ?? item.ratingKey}`
          : (item.category === "tv" || item.category === "classic_tv" || item.category === "anime")
            ? `/api/artwork/${encodeURIComponent(item.grandparentRatingKey ?? item.ratingKey)}`
            : `/api/artwork/${encodeURIComponent(item.ratingKey)}`;

        let group = groups.get(key);
        if (!group) {
          group = {
            groupKey: key,
            title,
            category: item.category,
            artworkUrl,
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
            const hasSource = this.db.prepare(`
              SELECT 1 FROM audiobook_chapter_sources 
              WHERE audiobook_id = ? AND source_status = 'active'
              LIMIT 1
            `).get(book.id);
            hasVerifiedChapters = !!hasSource;
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

        // Build people array
        let people: DashboardProgressPersonContext[] = [...g.peopleMap.values()].map((pCtx) => ({
          userId: pCtx.userId,
          plexUsername: pCtx.plexUsername,
          displayName: pCtx.displayName,
          plays: pCtx.plays,
          completedPlays: pCtx.completedPlays,
          partials: pCtx.partials,
          distinctItems: pCtx.distinctItems.size,
          distinctCompleted: pCtx.distinctCompleted.size,
          latestWatchedAt: pCtx.latestWatchedAt
        })).sort((a, b) => b.plays - a.plays || a.displayName.localeCompare(b.displayName));

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
            partials = [...audiobookProgress.peopleStats.values()].reduce((sum, stat) => sum + stat.partials, 0);
            people = people.map((person) => {
              const stats = audiobookProgress.peopleStats.get(person.displayName);
              return stats ? { ...person, distinctItems: stats.distinctItems, distinctCompleted: stats.distinctCompleted, partials: stats.partials } : person;
            });
          }
        }

        const pg: DashboardProgressGroup = {
          groupKey: g.groupKey,
          title: g.title,
          category: g.category,
          artworkUrl: g.artworkUrl,
          latestWatchedAt: g.latestWatchedAt,
          progressUnit,
          progressUnitLabel,
          progressSource,
          progressSourceVerified,
          hasVerifiedChapters,
          totalKnown,
          totalItems,
          distinctItems,
          distinctCompleted,
          plays: g.plays,
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

      return {
        item: first,
        plays,
        people,
        repeatCount: Math.max(0, plays.length - 1),
        catalog,
        audiobook,
        hierarchy,
        adjudications
      };
    });
    return timed.value ? { ...timed.value, timingMs: timed.timingMs } : null;
  }

  private buildTvHierarchy(
    showKey: string,
    showTitle: string,
    plays: DashboardActivityItem[],
    people: Array<{ displayName: string }>
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

      for (const person of people) {
        const userPlays = epPlays.filter(p => {
          const names = p.displayNames?.length ? p.displayNames : [p.displayName];
          return names.includes(person.displayName);
        });
        if (userPlays.length === 0) {
          watchedStates[person.displayName] = "unknown";
        } else if (userPlays.length === 1) {
          watchedStates[person.displayName] = userPlays[0].completed ? "watched" : "partial";
        } else {
          watchedStates[person.displayName] = "repeated";
        }
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
        watchedStates
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
      SELECT source_type, source_status, confidence, refreshed_at
      FROM audiobook_chapter_sources
      WHERE audiobook_id = ? AND source_status = 'active'
      ORDER BY confidence DESC, refreshed_at DESC
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
    people: Array<{ displayName: string }>,
    source: CachedAudiobookSource,
    cachedChapters: CachedAudiobookChapter[]
  ): AudiobookChapterProgressSnapshot {
    const bookDurationMs = Math.max(...cachedChapters.map((chapter) => chapter.end_offset_ms));
    const completedChapters = new Set<number>();
    const touchedChapters = new Set<number>();
    const peopleStats = new Map<string, { distinctItems: number; distinctCompleted: number; partials: number }>();

    const chapters = cachedChapters.map((chapter) => {
      const watchedStates: Record<string, ProgressNodeState> = {};
      const stateSources: Record<string, ProgressNodeStateSource> = {};
      const partialPositions: Record<string, number> = {};

      for (const person of people) {
        const userPlays = plays.filter((play) => {
          const names = play.displayNames?.length ? play.displayNames : [play.displayName];
          return names.includes(person.displayName);
        });

        const mappedStates: ProgressNodeState[] = [];
        const mappedSources: ProgressNodeStateSource[] = [];
        const mappedPartials: number[] = [];
        let sawUncertainEvidence = false;

        for (const play of userPlays) {
          const offset = this.resolveAudiobookOffsetMs(play, bookDurationMs);
          if (offset.status === "valid") {
            if (offset.value >= chapter.end_offset_ms) {
              mappedStates.push("watched");
              mappedSources.push("verified_offset");
            } else if (offset.value > chapter.start_offset_ms && offset.value < chapter.end_offset_ms) {
              mappedStates.push("partial");
              mappedSources.push("verified_offset");
              mappedPartials.push(Math.round(((offset.value - chapter.start_offset_ms) / (chapter.end_offset_ms - chapter.start_offset_ms)) * 100));
            }
          } else if (play.completed) {
            mappedStates.push("watched");
            mappedSources.push("book_completion");
          } else if (offset.status === "uncertain") {
            sawUncertainEvidence = true;
          }
        }

        let state: ProgressNodeState = "unknown";
        let stateSource: ProgressNodeStateSource = "none";
        if (mappedStates.length > 1) {
          state = "repeated";
          stateSource = mappedSources.includes("book_completion") ? "book_completion" : "verified_offset";
        } else if (mappedStates.includes("watched")) {
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

        if (state === "watched" || state === "repeated" || state === "partial") {
          touchedChapters.add(chapter.chapter_index);
        }
        if (state === "watched" || state === "repeated") {
          completedChapters.add(chapter.chapter_index);
        }

        const stats = peopleStats.get(person.displayName) ?? { distinctItems: 0, distinctCompleted: 0, partials: 0 };
        if (state === "watched" || state === "repeated" || state === "partial") stats.distinctItems += 1;
        if (state === "watched" || state === "repeated") stats.distinctCompleted += 1;
        if (state === "partial" || state === "source_uncertain") stats.partials += 1;
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
      peopleStats
    };
  }

  private resolveAudiobookOffsetMs(play: DashboardActivityItem, bookDurationMs: number): { status: "valid"; value: number } | { status: "missing" | "uncertain" } {
    let offset = normalizeAudiobookEvidenceOffsetMs(play.viewOffset, bookDurationMs);
    if (offset <= 0 && play.percentComplete != null && play.duration) {
      const durationMs = normalizeDurationMs(play.duration);
      if (durationMs > 0) {
        offset = Math.round(durationMs * Math.max(0, Math.min(100, play.percentComplete)) / 100);
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
    people: Array<{ displayName: string }>
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
    const peopleStats = new Map<string, { distinctItems: number; distinctCompleted: number; partials: number }>();

    const chapters = chaptersCatalog.map(ch => {
      const chPlays = chapterPlays.get(ch.rating_key) || [];
      const watchedStates: Record<string, ProgressNodeState> = {};
      const stateSources: Record<string, ProgressNodeStateSource> = {};

      for (const person of people) {
        const userPlays = chPlays.filter(p => {
          const names = p.displayNames?.length ? p.displayNames : [p.displayName];
          return names.includes(person.displayName);
        });
        let state: ProgressNodeState = "unknown";
        if (userPlays.length === 1) {
          state = userPlays[0].completed ? "watched" : "partial";
        } else if (userPlays.length > 1) {
          state = "repeated";
        }
        watchedStates[person.displayName] = state;
        stateSources[person.displayName] = state === "unknown" ? "none" : "track_file";

        if (state === "watched" || state === "repeated" || state === "partial") touchedTracks.add(ch.rating_key);
        if (state === "watched" || state === "repeated") completedTracks.add(ch.rating_key);

        const stats = peopleStats.get(person.displayName) ?? { distinctItems: 0, distinctCompleted: 0, partials: 0 };
        if (state === "watched" || state === "repeated" || state === "partial") stats.distinctItems += 1;
        if (state === "watched" || state === "repeated") stats.distinctCompleted += 1;
        if (state === "partial") stats.partials += 1;
        peopleStats.set(person.displayName, stats);
      }

      return {
        ratingKey: ch.rating_key,
        title: ch.title,
        duration: ch.duration || chPlays[0]?.duration || 0,
        watchedStates,
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

        const plays = this.getActivity({ grandparentRatingKey, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
        const peopleByName = new Map<string, { displayName: string }>();
        for (const play of plays) {
          const names = play.displayNames?.length ? play.displayNames : [play.displayName];
          for (const displayName of names) {
            peopleByName.set(displayName, { displayName });
          }
        }
        const people = [...peopleByName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));

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

        const result: ProgressHierarchyExpansion = {
          groupKey,
          category,
          title: catalog.title,
          artworkUrl: `/api/artwork/${encodeURIComponent(grandparentRatingKey)}`,
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
        const peopleByName = new Map<string, { displayName: string }>();
        for (const play of plays) {
          const names = play.displayNames?.length ? play.displayNames : [play.displayName];
          for (const displayName of names) {
            peopleByName.set(displayName, { displayName });
          }
        }
        const people = [...peopleByName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));

        const audiobookProgress = this.buildAudiobookHierarchy(audiobook, plays, people);
        const hierarchy = {
          type: "audiobook" as const,
          parentSeries: audiobook.parent_series_title,
          subseries: audiobook.subseries_title,
          series: audiobook.series_title,
          bookTitle: audiobook.title,
          chapters: audiobookProgress.chapters,
          hasVerifiedChapters: audiobookProgress.hasVerifiedChapters,
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

        const result: ProgressHierarchyExpansion = {
          groupKey,
          category: "audiobook",
          title: audiobook.title,
          artworkUrl: `/api/artwork/audiobook%3A${audiobookId}`,
          progressUnit,
          progressUnitLabel,
          progressSource,
          progressSourceVerified,
          hasVerifiedChapters,
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
        const ratingKey = mvMatch[2];
        const catalog = this.db.prepare(`
          SELECT title, duration, library_title, media_type, leaf_count, source_provenance
          FROM content_catalog
          WHERE rating_key = ?
        `).get(ratingKey) as any;

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

        const result: ProgressHierarchyExpansion = {
          groupKey,
          category: "movie",
          title: catalog.title,
          artworkUrl: `/api/artwork/${encodeURIComponent(ratingKey)}`,
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
    const artworkKey = this.resolveArtworkKey(row, category.category);
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
      ratingKey: row.rating_key, 
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
      duration: row.duration ?? undefined,
      viewOffset: row.view_offset ?? undefined,
      percentComplete: row.percent_complete ?? undefined, 
      completed: row.completed === 1, 
      artworkUrl: `/api/artwork/${encodeURIComponent(artworkKey)}`, 
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
    return row.rating_key;
  }

  private resolveArtworkUrl(item: DashboardActivityItem, fallbackKey: string): string {
    const key = item.category === "audiobook"
      ? (item.audiobookId != null ? `audiobook:${item.audiobookId}` : fallbackKey)
      : fallbackKey;
    return `/api/artwork/${encodeURIComponent(key)}`;
  }

  private buildRecentPlaybackCards(items: DashboardActivityItem[], limit: number): DashboardActivityItem[] {
    const groups = new Map<string, Array<DashboardActivityItem>>();
    const result: DashboardActivityItem[] = [];

    for (const item of items) {
      const eventId = item.evidence?.cowatchEventId as string | null;
      if (eventId) {
        if (!groups.has(eventId)) {
          groups.set(eventId, []);
        }
        groups.get(eventId)!.push(item);
      } else {
        result.push(item);
      }
    }

    for (const [eventId, groupItems] of groups.entries()) {
      groupItems.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
      const primary = groupItems[0];
      const displayNames = [...new Set(groupItems.flatMap(it => it.displayNames ?? [it.displayName]))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      const confirmedUserIds = [...new Set(groupItems.flatMap(it => it.confirmedUserIds ?? []))];
      const relationship = groupItems.some(it => it.evidence?.relationship === "together") ? "together" : "likely_together";

      const groupedItem: DashboardActivityItem = {
        ...primary,
        displayNames,
        displayName: displayNames.join(" + "),
        confirmedUserIds,
        evidence: {
          ...primary.evidence,
          relationship
        }
      };
      result.push(groupedItem);
    }

    return result.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt)).slice(0, limit);
  }
}
