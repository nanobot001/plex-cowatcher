import type { MarkWatchedResult, PlexMetadata, PlexUser, WatchedState } from "../types/index.js";
import { appConfig } from "../utils/config.js";

export interface PlexAdapter {
  listUsers(): Promise<PlexUser[]>;
  getMetadataByRatingKey(ratingKey: string): Promise<PlexMetadata>;
  getWatchedState(userId: string, ratingKey: string): Promise<WatchedState>;
  markWatched(userId: string, ratingKey: string): Promise<MarkWatchedResult>;
}

export class MockPlexAdapter implements PlexAdapter {
  async listUsers(): Promise<PlexUser[]> {
    return [];
  }

  async getMetadataByRatingKey(ratingKey: string): Promise<PlexMetadata> {
    return { ratingKey, title: `Mock metadata ${ratingKey}`, mediaType: "unknown" };
  }

  async getWatchedState(): Promise<WatchedState> {
    return { watched: false, source: "mock" };
  }

  async markWatched(_userId: string, _ratingKey: string): Promise<MarkWatchedResult> {
    return { ok: true, status: "mocked" };
  }
}

export class HttpPlexAdapter extends MockPlexAdapter {
  async listUsers(): Promise<PlexUser[]> {
    if (!appConfig.PLEX_TOKEN) return [];
    const response = await fetch(`${appConfig.PLEX_BASE_URL}/api/v2/server/access_tokens?X-Plex-Token=${encodeURIComponent(appConfig.PLEX_TOKEN)}`);
    if (!response.ok) throw new Error(`Plex users request failed: ${response.status}`);
    return [];
  }

  async markWatched(userId: string, ratingKey: string): Promise<MarkWatchedResult> {
    if (appConfig.PLEX_MUTATION_MODE !== "live") {
      return { ok: true, status: "mocked" };
    }

    return {
      ok: false,
      status: "failed",
      error: `Live per-user mark-watched is intentionally unverified for user ${userId}, rating key ${ratingKey}.`
    };
  }
}

export function createPlexAdapter(): PlexAdapter {
  return appConfig.PLEX_MUTATION_MODE === "live" ? new HttpPlexAdapter() : new MockPlexAdapter();
}
