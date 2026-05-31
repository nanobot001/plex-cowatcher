import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { MarkWatchedResult } from "../types/index.js";

export class SyncService {
  constructor(private readonly plex: PlexAdapter) {}

  async markWatchedIfNeeded(targetPlexUserId: string, ratingKey: string): Promise<MarkWatchedResult> {
    const state = await this.plex.getWatchedState(targetPlexUserId, ratingKey);
    if (state.watched) return { ok: true, status: "already_watched" };
    return this.plex.markWatched(targetPlexUserId, ratingKey);
  }
}
