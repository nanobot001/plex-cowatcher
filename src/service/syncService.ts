import type { PlexAdapter } from "../adapters/plexAdapter.js";
import { PlexAdapterError } from "../adapters/plexAdapter.js";
import type { MarkWatchedResult } from "../types/index.js";
import { appConfig } from "../utils/config.js";

export class SyncService {
  constructor(private readonly plex: PlexAdapter) {}

  async markWatchedIfNeeded(targetPlexUserId: string, ratingKey: string, plexGuid?: string): Promise<MarkWatchedResult> {
    try {
      if (appConfig.PLEX_MUTATION_MODE === "live") {
        await this.plex.getMetadataByRatingKey(ratingKey, plexGuid);
        return this.plex.markWatched(targetPlexUserId, ratingKey, plexGuid);
      }

      const state = await this.plex.getWatchedState(targetPlexUserId, ratingKey, plexGuid);
      if (state.watched) return { ok: true, status: "already_watched" };
      return this.plex.markWatched(targetPlexUserId, ratingKey, plexGuid);
    } catch (error) {
      if (error instanceof PlexAdapterError) {
        return {
          ok: false,
          status: error.status,
          errorCode: error.errorCode,
          error: error.message,
          details: error.details
        };
      }

      return {
        ok: false,
        status: "plex_failure",
        errorCode: "PLEX_SYNC_FAILED",
        error: error instanceof Error ? error.message : "Plex sync failed."
      };
    }
  }
}
