import { z } from "zod";
import type { Db } from "../db/database.js";
import type { DashboardActivityItem, DashboardCategory, DashboardTimelineSession } from "../types/api.js";

const HOUSEHOLD_CATEGORIES = ["movie", "tv", "classic_tv", "anime", "audiobook"] as const;
const SUMMARY_SAMPLE_LIMIT = 500;
const DETAIL_SAMPLE_LIMIT = 200;
const TIMELINE_DEFAULT_DAYS = 1;
const TIMELINE_MAX_DAYS = 7;

const filterSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  user: z.string().optional(),
  ratingKey: z.string().max(200).optional(),
  category: z.enum(HOUSEHOLD_CATEGORIES).optional(),
  library: z.string().optional(),
  completed: z.preprocess((value) => value === "true" ? true : value === "false" ? false : value, z.boolean().optional()),
  search: z.string().max(200).optional(),
  limit: z.preprocess((value) => {
    if (value === undefined) return 50;
    return Math.min(Number(value), 1000);
  }, z.number().int().min(1).max(1000)),
  offset: z.preprocess((value) => value === undefined ? 0 : Number(value), z.number().int().min(0).max(100000)),
  sort: z.enum(["recent", "title", "progress"]).default("recent")
});

const timelineFilterSchema = filterSchema.extend({
  days: z.preprocess((value) => {
    if (value === undefined) return TIMELINE_DEFAULT_DAYS;
    return Math.min(Number(value), TIMELINE_MAX_DAYS);
  }, z.number().int().min(1).max(TIMELINE_MAX_DAYS))
});

type DashboardDerivedCategory = DashboardCategory | "other";

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

function resolveDashboardDisplayTitle(item: Pick<DashboardActivityItem, "category" | "showTitle" | "title" | "audiobookTitle">): string {
  if (item.category === "audiobook") {
    return item.audiobookTitle?.trim() || item.title.trim() || item.showTitle?.trim() || "";
  }
  if (item.category === "tv" || item.category === "classic_tv" || item.category === "anime") {
    return item.showTitle?.trim() || item.title.trim() || "";
  }
  return item.title.trim();
}

function explorerTitle(item: Pick<DashboardActivityItem, "category" | "showTitle" | "title" | "audiobookTitle">): string {
  return resolveDashboardDisplayTitle(item);
}

function explorerGroupKey(item: DashboardActivityItem): string {
  const library = item.libraryName ?? "";
  if (item.category === "movie") return `movie:${library}:${item.ratingKey}`;
  if (item.category === "audiobook") return `audiobook:${library}:${item.audiobookId ?? item.grandparentRatingKey ?? item.parentRatingKey ?? item.showTitle ?? item.title}`;
  if (item.category === "tv" || item.category === "classic_tv" || item.category === "anime") return `series:${item.category}:${library}:${item.grandparentRatingKey ?? item.parentRatingKey ?? item.showTitle ?? item.title}`;
  return `other:${library}:${item.ratingKey}`;
}

function isRecognizedExplorerItem(item: DashboardActivityItem): boolean {
  return Boolean(explorerTitle(item).trim()) && (item.category === "audiobook" || Boolean(item.libraryName));
}

function compareExplorerItems(a: any, b: any, sort: string): number {
  const aTitle = a.displayTitle ?? a.title;
  const bTitle = b.displayTitle ?? b.title;
  if (sort === "title") return aTitle.localeCompare(bTitle, undefined, { sensitivity: "base" }) || b.latestWatchedAt.localeCompare(a.latestWatchedAt);
  if (sort === "progress") return (b.percentComplete ?? -1) - (a.percentComplete ?? -1) || b.plays - a.plays || b.latestWatchedAt.localeCompare(a.latestWatchedAt);
  return b.latestWatchedAt.localeCompare(a.latestWatchedAt) || aTitle.localeCompare(bTitle, undefined, { sensitivity: "base" });
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
  constructor(private readonly db: Db) {}

  getActivity(input: unknown): { items: DashboardActivityItem[]; total: number; limit: number; offset: number } {
    const p = parseFilters(input);
    let where = " WHERE COALESCE(u.dashboard_shown, u.enabled) = 1";
    const args: any[] = [];
    if (p.dateFrom) { where += " AND po.watched_at >= ?"; args.push(new Date(p.dateFrom).toISOString()); }
    if (p.dateTo) { where += " AND po.watched_at <= ?"; args.push(new Date(p.dateTo).toISOString()); }
    if (p.user) { where += " AND u.plex_username = ?"; args.push(p.user); }
    if (p.ratingKey) { where += " AND po.rating_key = ?"; args.push(p.ratingKey); }
    if (p.library) { where += " AND COALESCE(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) = ?"; args.push(p.library); }
    if (p.completed !== undefined) { where += " AND po.completed = ?"; args.push(p.completed ? 1 : 0); }
    if (p.search) { where += " AND (po.title LIKE ? OR po.show_title LIKE ?)"; args.push(`%${p.search}%`, `%${p.search}%`); }

    const categorySql = `CASE WHEN lower(po.media_type)='audiobook' OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%audiobook%' THEN 'audiobook' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%anime%' THEN 'anime' WHEN lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title, '')) LIKE '%classic%' THEN 'classic_tv' WHEN lower(po.media_type)='movie' AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title))='movies') THEN 'movie' WHEN lower(po.media_type) IN ('episode', 'show', 'season') AND (coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title) IS NULL OR lower(coalesce(NULLIF(po.library_name, ''), cat.library_title, groupcat.library_title)) IN ('tv shows','etv','jdrama')) THEN 'tv' ELSE 'other' END`;
    where += ` AND ${categorySql} != 'other'`;
    if (p.category) { where += ` AND ${categorySql} = ?`; args.push(p.category); }
    const from = ` FROM playback_observations po JOIN users u ON u.id=po.user_id LEFT JOIN content_catalog cat ON cat.rating_key=po.rating_key LEFT JOIN content_catalog groupcat ON groupcat.rating_key=po.grandparent_rating_key LEFT JOIN audiobook_books ab ON ab.id=cat.audiobook_id LEFT JOIN watch_events we ON we.rating_key=po.rating_key AND we.source_user_id=po.user_id AND abs(strftime('%s',we.watched_at)-strftime('%s',po.watched_at))<=600 LEFT JOIN cowatch_confirmations cc ON cc.watch_event_id=we.id AND cc.target_user_id=po.user_id`;
    const total = Number((this.db.prepare(`SELECT count(*) total${from}${where}`).get(...args) as any).total);
    const order = p.sort === "title" ? "po.title COLLATE NOCASE, po.rating_key, po.watched_at DESC, po.id DESC" : p.sort === "progress" ? "po.percent_complete DESC, po.watched_at DESC, po.id DESC" : "po.watched_at DESC, po.id DESC";
    const rows = this.db.prepare(`SELECT po.*,u.plex_username,u.display_name AS synced_display_name,u.dashboard_alias,u.dashboard_shown,we.prompt_status,cc.status confirmation_status,cc.plex_sync_status,cat.library_title AS catalog_library_title,groupcat.library_title AS group_catalog_library_title,cat.audiobook_id AS audiobook_id,ab.title AS audiobook_title${from}${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, p.limit, p.offset) as any[];
    const items = rows.map((row) => this.mapActivity(row)).filter(Boolean) as DashboardActivityItem[];
    return { items, total, limit: p.limit, offset: p.offset };
  }

  getContinueWatching(input: unknown) {
    const p = parseFilters(input);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const all = this.getActivity({ ...(input as object), limit: SUMMARY_SAMPLE_LIMIT, offset: 0 }).items;
    const groups = new Map<string, any>();
    for (const item of all) {
      if (!isRecognizedExplorerItem(item) || item.completed) continue;
      if (item.watchedAt < thirtyDaysAgo) continue;
      const key = explorerGroupKey(item);
      if (!groups.has(key)) {
        groups.set(key, { ...item, displayTitle: explorerTitle(item) });
      }
    }
    return [...groups.values()].slice(0, p.limit);
  }

  getOverview(input: unknown) {
    const timed = withTiming(() => {
      const baseActivity = this.getActivity({ ...(input as object), limit: 24, offset: 0 });
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

      for (const item of all) {
        const cat = item.category;
        const stat = categoryStats.get(cat) ?? { category: cat, plays: 0, duration: 0, completed: 0 };
        stat.plays++;
        stat.duration += item.duration ?? 0;
        if (item.completed) stat.completed++;
        categoryStats.set(cat, stat);

        if (isRecognizedExplorerItem(item)) {
          const key = explorerGroupKey(item);
          const titleStat = topTitlesMap.get(key) ?? { category: cat, title: explorerTitle(item), duration: 0, lastActivityAt: item.watchedAt };
          titleStat.duration += item.duration ?? 0;
          if (item.watchedAt > titleStat.lastActivityAt) titleStat.lastActivityAt = item.watchedAt;
          topTitlesMap.set(key, titleStat);
        }

        const date = new Date(item.watchedAt);
        const day = (date.getDay() + 6) % 7;
        const userHeatmap = heatmaps.get(item.userId) ?? [0, 0, 0, 0, 0, 0, 0];
        userHeatmap[day] += Math.round((item.duration ?? 0) / 60000);
        heatmaps.set(item.userId, userHeatmap);
      }

      const statsList = [...categoryStats.values()].map(s => ({ ...s, durationHours: Math.round(s.duration / 3600000), completionRate: s.plays > 0 ? Math.round((s.completed / s.plays) * 100) : 0 }));

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
      return {
        activity: baseActivity,
        totals: { plays: baseActivity.total, people: new Set(all.map((item) => item.userId)).size, minutes: Math.round(all.reduce((minutes, item) => minutes + (item.duration ?? 0), 0) / 60000), pendingPrompts: Number(pending.count) },
        categories: [...categoryStats.values()].map(s => ({ category: s.category, count: s.plays })),
        users,
        libraries: [...new Set(all.map((item) => item.libraryName).filter(Boolean))].sort(),
        continueWatching: this.getContinueWatching(input),
        categoryStats: statsList,
        topTitles: Object.fromEntries(topTitlesByCategory),
        heatmaps: Object.fromEntries(heatmaps)
      };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  getMedia(input: unknown) {
    const timed = withTiming(() => {
      const p = parseFilters(input);
      const all = this.getActivity({ ...(input as object), limit: SUMMARY_SAMPLE_LIMIT, offset: 0 }).items;
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
        const group = groups.get(key) ?? { ...item, title, showTitle: undefined, displayTitle: title, groupRatingKey, plays: 0, distinctItems: new Set<string>(), people: new Set<number>(), latestWatchedAt: item.watchedAt, artworkUrl: this.resolveArtworkUrl(item, groupRatingKey) };
      group.plays += 1;
      group.distinctItems.add(item.ratingKey);
      group.people.add(item.userId);
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
          group.evidence = item.evidence;
          group.grandparentRatingKey = item.grandparentRatingKey;
          group.parentRatingKey = item.parentRatingKey;
          group.audiobookId = item.audiobookId;
          group.audiobookTitle = item.audiobookTitle;
        }
        groups.set(key, group);
      }
      const items = [...groups.values()].map((group) => ({ ...group, distinctItems: group.distinctItems.size, people: [...group.people] })).sort((a, b) => compareExplorerItems(a, b, p.sort));
      return { items: items.slice(p.offset, p.offset + p.limit), total: items.length, limit: p.limit, offset: p.offset };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  getPeople(input: unknown) {
    const timed = withTiming(() => {
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
      return users.map((user) => { const items = all.filter((item) => item.userId === user.id); return { ...user, plays: items.length, minutes: Math.round(items.reduce((minutes, item) => minutes + (item.duration ?? 0), 0) / 60000), recent: items.slice(0, 5), mix: Object.entries(items.reduce<Record<string, number>>((accumulator, item) => { accumulator[item.category] = (accumulator[item.category] ?? 0) + 1; return accumulator; }, {})).map(([category, count]) => ({ category, count })) }; });
    });
    return { people: timed.value, timingMs: timed.timingMs };
  }

  getTimeline(input: unknown) {
    const timed = withTiming(() => {
      const p = parseTimelineFilters(input);
      const cappedDays = Math.min(Math.max(p.days ?? TIMELINE_DEFAULT_DAYS, 1), TIMELINE_MAX_DAYS);
      const now = p.dateTo ? new Date(p.dateTo) : new Date();
      const defaultStart = new Date(now.getTime() - (cappedDays * 24 * 60 * 60 * 1000));
      const dateFrom = p.dateFrom ? new Date(p.dateFrom) : defaultStart;
      const dateTo = p.dateTo ? new Date(p.dateTo) : now;
      const maxWindowMs = TIMELINE_MAX_DAYS * 24 * 60 * 60 * 1000;
      if (dateTo.getTime() - dateFrom.getTime() > maxWindowMs) {
        dateFrom.setTime(dateTo.getTime() - maxWindowMs);
      }

      const activity = this.getActivity({
        ...(input as object),
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        limit: p.limit,
        offset: p.offset
      });

      const sessionsByKey = new Map<string, DashboardTimelineSession>();
      for (const item of activity.items) {
        const day = item.watchedAt ? item.watchedAt.slice(0, 10) : "unknown";
        const key = `${item.userId}:${day}`;
        const existing = sessionsByKey.get(key);
        const startTime = existing ? (item.watchedAt < existing.startTime ? item.watchedAt : existing.startTime) : item.watchedAt;
        const endTime = existing ? (item.watchedAt > existing.endTime ? item.watchedAt : existing.endTime) : item.watchedAt;
        sessionsByKey.set(key, {
          id: `${item.userId}-${day}`,
          userId: item.userId,
          displayName: item.displayName,
          date: day,
          startTime,
          endTime,
          itemCount: (existing?.itemCount ?? 0) + 1,
          category: existing?.category ?? item.category
        });
      }

      const sessions = [...sessionsByKey.values()].sort((a, b) => b.date.localeCompare(a.date) || a.displayName.localeCompare(b.displayName));
      return { ...activity, windowDays: cappedDays, sessions };
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
      JOIN playback_observations po_source ON po_source.user_id=we.source_user_id AND po_source.rating_key=we.rating_key AND abs(strftime('%s',po_source.watched_at)-strftime('%s',we.watched_at))<=600
      LEFT JOIN playback_observations po_target ON po_target.user_id=cc.target_user_id AND po_target.rating_key=we.rating_key AND abs(strftime('%s',po_target.watched_at)-strftime('%s',we.watched_at))<=600
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
      
      const duration = ev.target_duration ?? ev.source_duration ?? 0;
      
      const sorted = [cat1, cat2].sort();
      const key = sorted.join('+');
      const p = pairs.get(key) ?? { cats: sorted, duration: 0 };
      p.duration += duration;
      pairs.set(key, p);
    }
    const total = [...pairs.values()].reduce((sum, p) => sum + p.duration, 0);
    return [...pairs.values()].map(p => ({ ...p, durationHours: Math.round(p.duration / 3600), percent: total > 0 ? Math.round((p.duration / total) * 100) : 0 })).sort((a,b) => b.durationHours - a.durationHours).slice(0, 4);
  }

  getProgress(input: unknown) {
    const timed = withTiming(() => {
      const all = this.getActivity({ ...(input as object), limit: SUMMARY_SAMPLE_LIMIT, offset: 0 }).items;
      const groups = new Map<string, any>();

      for (const item of all) {
        const title = item.showTitle ?? item.title;
        const key = `${item.userId}:${item.category}:${title}`;
        const group = groups.get(key) ?? { userId: item.userId, displayName: item.displayName, title, category: item.category, distinctItems: new Set<string>(), plays: 0, completed: 0, percentages: [] as number[], latestWatchedAt: item.watchedAt, items: [] };
        group.plays++;
        group.distinctItems.add(item.ratingKey);
        if (item.completed) group.completed++;
        if (item.percentComplete != null) group.percentages.push(item.percentComplete);
        if (item.watchedAt > group.latestWatchedAt) group.latestWatchedAt = item.watchedAt;
        group.items.push(item);
        groups.set(key, group);
      }

      const progress = [...groups.values()].map((group) => {
        const first = group.items[0];
        let totalKnown = false;
        let totalItems = null;
        let hierarchy = null;
        let seasons = null;

        if (first.category === "audiobook") {
          const book = this.db.prepare(`SELECT ab.parent_series_title,ab.subseries_title,ab.series_title,ab.title,ab.chapter_count FROM content_catalog cat JOIN audiobook_books ab ON ab.id=cat.audiobook_id WHERE cat.rating_key=?`).get(first.ratingKey) as any;
          if (book) {
            totalKnown = Boolean(book.chapter_count);
            totalItems = book.chapter_count;
            hierarchy = { parentSeries: book.parent_series_title, subseries: book.subseries_title, series: book.series_title, book: book.title };
          }
        } else if (first.category === "tv" || first.category === "classic_tv" || first.category === "anime") {
          const show = this.db.prepare(`SELECT leaf_count FROM content_catalog WHERE rating_key=?`).get(first.grandparentRatingKey ?? first.ratingKey) as any;
          if (show) {
            totalKnown = Boolean(show.leaf_count);
            totalItems = show.leaf_count;
          }
          seasons = {} as Record<number, number[]>;
          for (const it of group.items) {
            if (it.seasonNumber != null && it.episodeNumber != null) {
              if (!seasons[it.seasonNumber]) seasons[it.seasonNumber] = [];
              if (!seasons[it.seasonNumber].includes(it.episodeNumber)) {
                seasons[it.seasonNumber].push(it.episodeNumber);
              }
            }
          }
          for (const s in seasons) seasons[s].sort((a: number, b: number) => a - b);
        }

        return { ...group, items: undefined, distinctItems: group.distinctItems.size, averagePercent: group.percentages.length ? Math.round(group.percentages.reduce((sum: number, value: number) => sum + value, 0) / group.percentages.length) : null, totalKnown, totalItems, hierarchy, seasons };
      }).sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));

      const recentlyCompleted = all.filter(item => item.completed).map(item => ({ ...item, displayTitle: explorerTitle(item) }));
      const uniqueCompleted: any[] = [];
      const seenTitles = new Set<string>();
      for (const item of recentlyCompleted) {
        if (!seenTitles.has(item.displayTitle)) {
          seenTitles.add(item.displayTitle);
          uniqueCompleted.push(item);
        }
      }

      return { progress, recentlyCompleted: uniqueCompleted.slice(0, 5) };
    });
    return { ...timed.value, timingMs: timed.timingMs };
  }

  getDetail(ratingKey: string) {
    const timed = withTiming(() => {
      const plays = this.getActivity({ ratingKey, limit: DETAIL_SAMPLE_LIMIT, offset: 0 }).items;
      if (!plays.length) return null;
      const first = plays[0];
      const catalog = this.db.prepare(`SELECT media_type,title,duration,library_title,grandparent_title,parent_title,leaf_count,source_provenance,audiobook_id FROM content_catalog WHERE rating_key=?`).get(ratingKey) as any;
      const audiobook = catalog?.audiobook_id ? this.db.prepare(`SELECT title,subtitle,authors_json,narrators_json,parent_series_title,subseries_title,series_title,series_index,chapter_count,total_duration_seconds,source_provenance,enrichment_status FROM audiobook_books WHERE id=?`).get(catalog.audiobook_id) : null;
      return { item: first, plays, people: [...new Map(plays.map((item) => [item.userId, { userId: item.userId, displayName: item.displayName }])).values()], repeatCount: Math.max(0, plays.length - 1), catalog: catalog ?? null, audiobook };
    });
    return timed.value ? { ...timed.value, timingMs: timed.timingMs } : null;
  }

  private mapActivity(row: any): DashboardActivityItem {
    const libraryName = resolveLibraryName(row.library_name, row.catalog_library_title ?? row.group_catalog_library_title);
    const category = deriveDashboardCategory(row.media_type, libraryName);
    if (!isHouseholdCategory(category.category)) return null as any;
    const artworkKey = this.resolveArtworkKey(row, category.category);
    
    return { 
      id: row.id, 
      userId: row.user_id, 
      username: row.plex_username, 
      displayName: resolveDashboardAlias(row.dashboard_alias, row.plex_username), 
      displayTitle: resolveDashboardDisplayTitle({
        category: category.category,
        title: row.title,
        showTitle: row.show_title ?? undefined,
        audiobookTitle: row.audiobook_title ?? undefined
      }),
      ratingKey: row.rating_key, 
      title: row.title, 
      showTitle: row.show_title ?? undefined, 
      mediaType: row.media_type, 
      category: category.category, 
      categoryLabel: category.label, 
      categoryDerived: category.derived, 
      libraryName, 
      watchedAt: row.watched_at, 
      duration: row.duration ? row.duration * 1000 : undefined, 
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
          confirmed: row.confirmation_status === "confirmed", 
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
}
