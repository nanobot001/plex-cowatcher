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
    const json = await this.getJson(this.buildUrl("get_history", { user: params.user, length: 100 }));
    const rows = Array.isArray(json.response?.data?.data) ? json.response.data.data : [];
    return rows.map((row: Record<string, unknown>) => ({
      rowId: String(row.row_id ?? ""),
      user: String(row.user ?? ""),
      ratingKey: String(row.rating_key ?? ""),
      mediaType: String(row.media_type ?? "unknown"),
      title: String(row.title ?? ""),
      showTitle: row.grandparent_title ? String(row.grandparent_title) : undefined,
      seasonNumber: row.parent_media_index ? Number(row.parent_media_index) : undefined,
      episodeNumber: row.media_index ? Number(row.media_index) : undefined,
      watchedAt: row.date ? new Date(Number(row.date) * 1000).toISOString() : new Date().toISOString(),
      percentComplete: row.percent_complete ? Number(row.percent_complete) : undefined,
      completed: true
    }));
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

export function createTautulliAdapter(): TautulliAdapter {
  return new HttpTautulliAdapter();
}
