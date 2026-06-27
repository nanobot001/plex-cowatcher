import type { RecentHistoryParams, TautulliHistoryRow } from "../types/index.js";
import { appConfig } from "../utils/config.js";

export interface TautulliActivity {
  streamCount: number;
}

export interface TautulliMetadata {
  ratingKey: string;
  title: string;
}

export interface TautulliAdapter {
  getUsers(): Promise<unknown[]>;
  getRecentHistory(params: RecentHistoryParams): Promise<TautulliHistoryRow[]>;
  getActivity(): Promise<TautulliActivity>;
  getMetadata(ratingKey: string): Promise<TautulliMetadata>;
}

export class HttpTautulliAdapter implements TautulliAdapter {
  private buildUrl(cmd: string, params: Record<string, string | number | undefined> = {}): URL {
    const url = new URL("/api/v2", appConfig.TAUTULLI_BASE_URL);
    url.searchParams.set("apikey", appConfig.TAUTULLI_API_KEY);
    url.searchParams.set("cmd", cmd);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url;
  }

  async getUsers(): Promise<unknown[]> {
    if (!appConfig.TAUTULLI_API_KEY) return [];
    const json = await this.getJson(this.buildUrl("get_users"));
    return Array.isArray(json.response?.data) ? json.response.data : [];
  }

  async getRecentHistory(params: RecentHistoryParams): Promise<TautulliHistoryRow[]> {
    if (!appConfig.TAUTULLI_API_KEY) return [];
    const json = await this.getJson(this.buildUrl("get_history", { user: params.user, length: params.length ?? 100, start: params.start, section_id: params.section_id, search: params.search }));
    const rows: Record<string, unknown>[] = Array.isArray(json.response?.data?.data) ? json.response.data.data : [];
    return rows.map(normalizeTautulliHistoryRow).filter((row) => row.user && row.ratingKey);
  }

  async getActivity(): Promise<TautulliActivity> {
    if (!appConfig.TAUTULLI_API_KEY) return { streamCount: 0 };
    const json = await this.getJson(this.buildUrl("get_activity"));
    return { streamCount: Number(json.response?.data?.stream_count ?? 0) };
  }

  async getMetadata(ratingKey: string): Promise<TautulliMetadata> {
    const json = await this.getJson(this.buildUrl("get_metadata", { rating_key: ratingKey }));
    return {
      ratingKey,
      title: String(json.response?.data?.title ?? "")
    };
  }

  private async getJson(url: URL): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Tautulli request failed: ${response.status}`);
    return response.json();
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "complete", "completed"].includes(normalized)) return true;
  if (["0", "false", "no", "incomplete"].includes(normalized)) return false;
  return undefined;
}

function watchedAtIso(value: unknown): string {
  const numeric = optionalNumber(value);
  if (numeric !== undefined) return new Date(numeric * 1000).toISOString();
  const stringValue = optionalString(value);
  if (stringValue) {
    const parsed = new Date(stringValue);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function sanitizeTitle(value: unknown): string {
  const str = optionalString(value);
  if (!str) return "";
  return str
    .replace(/\s+/g, " ")
    .replace(/\s*Narrated by:.*$/i, "")
    .trim();
}

function sanitizeShowTitle(value: unknown): string | undefined {
  const str = optionalString(value);
  if (!str) return undefined;
  return sanitizeTitle(str) || undefined;
}

export function normalizeTautulliHistoryRow(row: Record<string, unknown>): TautulliHistoryRow {
  const hasDate = row.date !== undefined && row.date !== null && row.date !== "";
  const hasStopped = row.stopped !== undefined && row.stopped !== null && row.stopped !== "";
  const hasPercentComplete = row.percent_complete !== undefined && row.percent_complete !== null && row.percent_complete !== "";

  return {
    rowId: optionalString(row.row_id),
    user: String(row.user ?? row.username ?? ""),
    ratingKey: String(row.rating_key ?? ""),
    grandparentRatingKey: optionalString(row.grandparent_rating_key),
    parentRatingKey: optionalString(row.parent_rating_key),
    plexGuid: optionalString(row.guid),
    mediaType: String(row.media_type ?? row.media_type_full ?? "unknown"),
    libraryName: optionalString(row.library_name ?? row.section_name),
    title: sanitizeTitle(row.title),
    showTitle: sanitizeShowTitle(row.grandparent_title),
    seasonNumber: optionalNumber(row.parent_media_index),
    episodeNumber: optionalNumber(row.media_index),
    watchedAt: watchedAtIso(row.date ?? row.stopped),
    watchedAtProvenance: (hasDate || hasStopped) ? "source" : "fallback",
    percentComplete: optionalNumber(row.percent_complete),
    percentCompleteProvenance: hasPercentComplete ? "source" : "unknown",
    viewOffset: optionalNumber(row.view_offset),
    duration: optionalNumber(row.duration),
    completed: optionalBoolean(row.completed ?? row.watched_status)
  };
}

export function createTautulliAdapter(): TautulliAdapter {
  return new HttpTautulliAdapter();
}
