import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db/database.js";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import { MetadataService } from "./metadataService.js";

export const AIR_GRACE_PERIOD_MS = 6 * 60 * 60 * 1000; // 6-hour broadcast + subbing release buffer

export interface CanonicalTvMetadata {
  canonicalTotalEpisodes: number;
  seriesStatus: string;
  airedEpisodesCount?: number | null;
  nextAirAt?: string | null;
}

export interface ShowOverrideEntry {
  canonicalTotalEpisodes?: number;
  seriesStatus?: string;
  caughtUp?: boolean;
  airedEpisodesCount?: number | null;
  nextAirAt?: string | null;
}

const overridesConfigPath = "config/show_overrides.json";

export function readShowOverrides(filePath = overridesConfigPath): Record<string, ShowOverrideEntry> {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) return {};
  try {
    const raw = fs.readFileSync(absolute, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function cleanShowTitle(title: string): string {
  return title
    .replace(/\s*\(\d{4}\)$/, "")
    .replace(/\s*:\s*season\s*\d+.*$/i, "")
    .trim();
}

export function hasEpisodeAiredWithGrace(
  ep: { airstamp?: string | null; airdate?: string | null },
  nowMs = Date.now(),
  graceMs = AIR_GRACE_PERIOD_MS
): boolean {
  if (ep.airstamp && typeof ep.airstamp === "string") {
    const airMs = Date.parse(ep.airstamp);
    if (Number.isFinite(airMs)) {
      return airMs + graceMs <= nowMs;
    }
  }
  if (ep.airdate && typeof ep.airdate === "string") {
    const effectiveToday = new Date(nowMs - graceMs).toISOString().slice(0, 10);
    return ep.airdate <= effectiveToday;
  }
  return false;
}

export async function resolveAniListMetadata(
  title: string,
  nowMs = Date.now(),
  graceMs = AIR_GRACE_PERIOD_MS
): Promise<CanonicalTvMetadata | null> {
  const cleanTitle = cleanShowTitle(title);
  if (!cleanTitle) return null;

  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, ONA]) {
        id
        status
        episodes
        nextAiringEpisode {
          episode
          airingAt
        }
      }
    }
  `;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        query,
        variables: { search: cleanTitle }
      })
    });
    if (!res.ok) return null;

    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      return null;
    }

    const media = payload?.data?.Media;
    if (!media) return null;

    const rawStatus = String(media.status || "").toUpperCase();
    const seriesStatus =
      rawStatus === "FINISHED" ? "ended" :
      rawStatus === "RELEASING" ? "running" :
      rawStatus === "NOT_YET_RELEASED" ? "upcoming" : "unknown";

    let airedEpisodesCount: number | null = null;
    let nextAirAt: string | null = null;

    if (media.nextAiringEpisode && typeof media.nextAiringEpisode.episode === "number") {
      const nextEp = Number(media.nextAiringEpisode.episode);
      const nextAirSec = Number(media.nextAiringEpisode.airingAt || 0);
      if (nextAirSec > 0) {
        const nextAirMs = nextAirSec * 1000;
        nextAirAt = new Date(nextAirMs).toISOString();
        // If the previous weekly episode aired within the last graceMs window, hold back the aired count by 1
        const prevEpisodeAirMs = nextAirMs - 7 * 24 * 3600 * 1000;
        if (prevEpisodeAirMs + graceMs > nowMs) {
          airedEpisodesCount = Math.max(0, nextEp - 2);
        } else {
          airedEpisodesCount = Math.max(0, nextEp - 1);
        }
      } else {
        airedEpisodesCount = Math.max(0, nextEp - 1);
      }
    } else if (seriesStatus === "ended" && typeof media.episodes === "number" && media.episodes > 0) {
      airedEpisodesCount = Number(media.episodes);
    }

    const canonicalTotalEpisodes =
      (typeof media.episodes === "number" && media.episodes > 0)
        ? Number(media.episodes)
        : (airedEpisodesCount ?? 0);

    if (canonicalTotalEpisodes <= 0) return null;

    return {
      canonicalTotalEpisodes,
      seriesStatus,
      airedEpisodesCount,
      nextAirAt
    };
  } catch {
    return null;
  }
}

export async function resolveCanonicalTvMetadata(input: {
  title: string;
  imdbId?: string | null;
  tvdbId?: string | null;
  isAnime?: boolean;
  nowMs?: number;
  overridesPath?: string;
}): Promise<CanonicalTvMetadata | null> {
  const nowMs = input.nowMs ?? Date.now();
  const overrides = readShowOverrides(input.overridesPath);
  const cleanTitle = cleanShowTitle(input.title);

  // 1. Check local manual overrides first
  const match = overrides[input.title] || overrides[cleanTitle];
  if (match && typeof match.canonicalTotalEpisodes === "number" && match.canonicalTotalEpisodes > 0) {
    const status = match.seriesStatus ? String(match.seriesStatus).toLowerCase() : "unknown";
    return {
      canonicalTotalEpisodes: match.canonicalTotalEpisodes,
      seriesStatus: status,
      airedEpisodesCount: match.airedEpisodesCount !== undefined
        ? match.airedEpisodesCount
        : (status === "ended" ? match.canonicalTotalEpisodes : null),
      nextAirAt: match.nextAirAt ?? null
    };
  }

  // 2. Query TVMaze API
  let tvMazeResult: CanonicalTvMetadata | null = null;
  try {
    let show: any = null;

    if (input.imdbId && /^tt\d+$/.test(input.imdbId)) {
      try {
        const res = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(input.imdbId)}`, {
          signal: AbortSignal.timeout(5000),
          headers: { "Accept": "application/json" }
        });
        if (res.ok) show = await res.json();
      } catch {}
    }

    if (!show && input.tvdbId && /^\d+$/.test(input.tvdbId)) {
      try {
        const res = await fetch(`https://api.tvmaze.com/lookup/shows?thetvdb=${encodeURIComponent(input.tvdbId)}`, {
          signal: AbortSignal.timeout(5000),
          headers: { "Accept": "application/json" }
        });
        if (res.ok) show = await res.json();
      } catch {}
    }

    if (!show && cleanTitle) {
      try {
        const res = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}`, {
          signal: AbortSignal.timeout(5000),
          headers: { "Accept": "application/json" }
        });
        if (res.ok) show = await res.json();
      } catch {}
    }

    if (show && show.id) {
      const episodesRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/episodes`, {
        signal: AbortSignal.timeout(5000),
        headers: { "Accept": "application/json" }
      });
      if (episodesRes.ok) {
        const rawEpisodes = (await episodesRes.json()) as any[];
        if (Array.isArray(rawEpisodes) && rawEpisodes.length > 0) {
          const episodes = rawEpisodes.filter((ep) => ep.season == null || Number(ep.season) > 0);
          const airedSeasons = new Set(
            episodes
              .filter((ep) => hasEpisodeAiredWithGrace(ep, nowMs))
              .map((ep) => ep.season)
          );

          const activeEpisodes = airedSeasons.size > 0
            ? episodes.filter((ep) => airedSeasons.has(ep.season))
            : episodes;

          const totalEpisodes = activeEpisodes.length > 0 ? activeEpisodes.length : episodes.length;
          const airedEpisodesCount = activeEpisodes.filter((ep) => hasEpisodeAiredWithGrace(ep, nowMs)).length;

          const futureEpisodes = episodes
            .filter((ep) => !hasEpisodeAiredWithGrace(ep, nowMs) && (ep.airstamp || ep.airdate))
            .sort((a, b) => String(a.airstamp || a.airdate).localeCompare(String(b.airstamp || b.airdate)));

          const nextAirAt = futureEpisodes[0]?.airstamp || futureEpisodes[0]?.airdate || null;

          let seriesStatus = "unknown";
          if (show.status) {
            const s = String(show.status).toLowerCase();
            seriesStatus = s === "ended" ? "ended" : s === "running" ? "running" : s;
          }

          tvMazeResult = {
            canonicalTotalEpisodes: totalEpisodes,
            seriesStatus,
            airedEpisodesCount: seriesStatus === "ended" ? totalEpisodes : airedEpisodesCount,
            nextAirAt: seriesStatus === "ended" ? null : nextAirAt
          };
        }
      }
    }
  } catch {}

  // 3. Fallback or supplement with AniList public GraphQL API for Anime (or when TVMaze has no match / incomplete cour)
  if (!tvMazeResult || (input.isAnime && tvMazeResult.seriesStatus === "running" && tvMazeResult.canonicalTotalEpisodes <= (tvMazeResult.airedEpisodesCount ?? 0))) {
    const aniListResult = await resolveAniListMetadata(input.title, nowMs);
    if (aniListResult) {
      if (!tvMazeResult) {
        return aniListResult;
      }
      return {
        canonicalTotalEpisodes: Math.max(tvMazeResult.canonicalTotalEpisodes, aniListResult.canonicalTotalEpisodes),
        seriesStatus: tvMazeResult.seriesStatus !== "unknown" ? tvMazeResult.seriesStatus : aniListResult.seriesStatus,
        airedEpisodesCount: tvMazeResult.airedEpisodesCount ?? aniListResult.airedEpisodesCount ?? null,
        nextAirAt: tvMazeResult.nextAirAt ?? aniListResult.nextAirAt ?? null
      };
    }
  }

  return tvMazeResult;
}

export async function enrichCatalogShow(
  db: Db,
  ratingKey: string,
  options: { force?: boolean; overridesPath?: string; nowMs?: number } = {}
): Promise<CanonicalTvMetadata | null> {
  const row = db.prepare(`
    SELECT rating_key, title, guid, library_title, canonical_total_episodes, series_status, aired_episodes_count, next_air_at
    FROM content_catalog
    WHERE rating_key = ?
  `).get(ratingKey) as any;

  if (!row) return null;

  const nowIsoStr = new Date(options.nowMs ?? Date.now()).toISOString();
  const needsRunningRefresh =
    row.series_status === "running" &&
    (row.aired_episodes_count == null || (row.next_air_at && String(row.next_air_at) <= nowIsoStr));

  if (!options.force && !needsRunningRefresh && row.canonical_total_episodes != null && Number(row.canonical_total_episodes) > 0) {
    return {
      canonicalTotalEpisodes: Number(row.canonical_total_episodes),
      seriesStatus: row.series_status ?? "unknown",
      airedEpisodesCount: row.aired_episodes_count != null ? Number(row.aired_episodes_count) : null,
      nextAirAt: row.next_air_at ?? null
    };
  }

  // Extract external IDs if stored in guid
  let imdbId: string | null = null;
  let tvdbId: string | null = null;
  if (row.guid) {
    const imdbMatch = row.guid.match(/imdb:\/\/(tt\d+)/i);
    if (imdbMatch) imdbId = imdbMatch[1];
    const tvdbMatch = row.guid.match(/tvdb:\/\/(\d+)/i);
    if (tvdbMatch) tvdbId = tvdbMatch[1];
  }

  const isAnime = Boolean(row.library_title && String(row.library_title).toLowerCase().includes("anime"));

  const result = await resolveCanonicalTvMetadata({
    title: row.title,
    imdbId,
    tvdbId,
    isAnime,
    nowMs: options.nowMs,
    overridesPath: options.overridesPath
  });

  if (result) {
    db.prepare(`
      UPDATE content_catalog
      SET canonical_total_episodes = ?, series_status = ?, aired_episodes_count = ?, next_air_at = ?
      WHERE rating_key = ?
    `).run(
      result.canonicalTotalEpisodes,
      result.seriesStatus,
      result.airedEpisodesCount ?? null,
      result.nextAirAt ?? null,
      ratingKey
    );
  }

  return result;
}

export async function enrichAllCatalogShows(
  db: Db,
  options: {
    force?: boolean;
    overridesPath?: string;
    throttleMs?: number;
    onProgress?: (current: number, total: number, title: string) => void;
  } = {}
): Promise<{ enriched: number; skipped: number; failed: number }> {
  const rows = db.prepare(`
    SELECT rating_key, title, guid, leaf_count, canonical_total_episodes, series_status, aired_episodes_count, next_air_at
    FROM content_catalog
    WHERE media_type = 'show'
    ORDER BY title ASC
  `).all() as any[];

  let enriched = 0;
  let skipped = 0;
  let failed = 0;
  const throttle = options.throttleMs ?? 150;
  const nowIsoStr = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const needsRunningRefresh =
      row.series_status === "running" &&
      (row.aired_episodes_count == null || (row.next_air_at && String(row.next_air_at) <= nowIsoStr));

    if (!options.force && !needsRunningRefresh && row.canonical_total_episodes != null && Number(row.canonical_total_episodes) > 0) {
      skipped++;
      continue;
    }
    options.onProgress?.(i + 1, rows.length, row.title);
    try {
      const res = await enrichCatalogShow(db, row.rating_key, options);
      if (res) {
        enriched++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    if (throttle > 0 && i < rows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, throttle));
    }
  }

  return { enriched, skipped, failed };
}

export async function syncActiveCatalogShows(
  db: Db,
  plex?: PlexAdapter | null,
  options: { throttleMs?: number; nowMs?: number } = {}
): Promise<{ synced: number; failed: number }> {
  const nowIsoStr = new Date(options.nowMs ?? Date.now()).toISOString();
  const rows = db.prepare(`
    SELECT rating_key, title, guid
    FROM content_catalog
    WHERE media_type = 'show'
      AND (
        series_status = 'running'
        OR (next_air_at IS NOT NULL AND next_air_at <= ?)
        OR canonical_total_episodes IS NULL
      )
    ORDER BY title ASC
  `).all(nowIsoStr) as Array<{ rating_key: string; title: string; guid: string | null }>;

  const metadataService = plex ? new MetadataService(db, plex) : null;
  const throttle = options.throttleMs ?? 200;
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (metadataService) {
        await metadataService.refreshMetadataExplicit(row.rating_key, row.guid ?? undefined);
      }
      const res = await enrichCatalogShow(db, row.rating_key, { force: true, nowMs: options.nowMs });
      if (res) synced++;
      else failed++;
    } catch {
      failed++;
    }
    if (throttle > 0 && i < rows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, throttle));
    }
  }

  return { synced, failed };
}


