import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db/database.js";

export interface CanonicalTvMetadata {
  canonicalTotalEpisodes: number;
  seriesStatus: string;
}

export interface ShowOverrideEntry {
  canonicalTotalEpisodes?: number;
  seriesStatus?: string;
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

export async function resolveCanonicalTvMetadata(input: {
  title: string;
  imdbId?: string | null;
  tvdbId?: string | null;
  overridesPath?: string;
}): Promise<CanonicalTvMetadata | null> {
  const overrides = readShowOverrides(input.overridesPath);
  const cleanTitle = cleanShowTitle(input.title);

  // 1. Check local manual overrides first
  const match = overrides[input.title] || overrides[cleanTitle];
  if (match && typeof match.canonicalTotalEpisodes === "number" && match.canonicalTotalEpisodes > 0) {
    return {
      canonicalTotalEpisodes: match.canonicalTotalEpisodes,
      seriesStatus: match.seriesStatus ? String(match.seriesStatus).toLowerCase() : "unknown"
    };
  }

  // 2. Query TVMaze API
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

    if (!show || !show.id) return null;

    const episodesRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/episodes`, {
      signal: AbortSignal.timeout(5000),
      headers: { "Accept": "application/json" }
    });
    if (!episodesRes.ok) return null;

    const episodes = (await episodesRes.json()) as any[];
    if (!Array.isArray(episodes) || episodes.length === 0) return null;

    // Filter to regular aired episodes where airdate <= today (date-gated to exclude unreleased future seasons)
    const today = new Date().toISOString().slice(0, 10);
    const airedEpisodes = episodes.filter((ep) => ep.airdate && ep.airdate <= today);
    const totalEpisodes = airedEpisodes.length > 0 ? airedEpisodes.length : episodes.length;

    let seriesStatus = "unknown";
    if (show.status) {
      const s = String(show.status).toLowerCase();
      seriesStatus = s === "ended" ? "ended" : s === "running" ? "running" : s;
    }

    return {
      canonicalTotalEpisodes: totalEpisodes,
      seriesStatus
    };
  } catch {
    return null;
  }
}

export async function enrichCatalogShow(
  db: Db,
  ratingKey: string,
  options: { force?: boolean; overridesPath?: string } = {}
): Promise<CanonicalTvMetadata | null> {
  const row = db.prepare(`
    SELECT rating_key, title, guid, canonical_total_episodes, series_status
    FROM content_catalog
    WHERE rating_key = ?
  `).get(ratingKey) as any;

  if (!row) return null;

  if (!options.force && row.canonical_total_episodes != null && Number(row.canonical_total_episodes) > 0) {
    return {
      canonicalTotalEpisodes: Number(row.canonical_total_episodes),
      seriesStatus: row.series_status ?? "unknown"
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

  const result = await resolveCanonicalTvMetadata({
    title: row.title,
    imdbId,
    tvdbId,
    overridesPath: options.overridesPath
  });

  if (result) {
    db.prepare(`
      UPDATE content_catalog
      SET canonical_total_episodes = ?, series_status = ?
      WHERE rating_key = ?
    `).run(result.canonicalTotalEpisodes, result.seriesStatus, ratingKey);
  }

  return result;
}
