import type { Db } from "../db/database.js";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { PlexRichMetadata } from "../types/index.js";
import { nowIso } from "../utils/time.js";
import { AudiobookCatalogService, prepareAudiobookMetadata } from "./audiobookService.js";

export const METADATA_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
export const METADATA_REPAIR_BATCH_SIZE = 20;

export interface CatalogEntry {
  ratingKey: string;
  guid: string | null;
  mediaType: string;
  title: string;
  duration: number | null;
  libraryId: string | null;
  libraryTitle: string | null;
  genres: string[];
  grandparentRatingKey: string | null;
  grandparentGuid: string | null;
  grandparentTitle: string | null;
  parentRatingKey: string | null;
  parentGuid: string | null;
  parentTitle: string | null;
  leafCount: number | null;
  sourceProvenance: string;
  refreshedAt: string;
  filePath?: string | null;
  audiobookId?: number | null;
}

export class MetadataService {
  private readonly audiobooks: AudiobookCatalogService;
  private readonly refreshes = new Map<string, Promise<CatalogEntry | null>>();
  constructor(
    private readonly db: Db,
    private readonly plex: PlexAdapter
  ) {
    this.audiobooks = new AudiobookCatalogService(db);
  }

  async getMetadata(ratingKey: string, plexGuid?: string): Promise<CatalogEntry | null> {
    const cached = this.getCached(ratingKey);
    if (cached && !this.shouldRetry(cached)) {
      return cached;
    }
    return this.refreshMetadata(ratingKey, plexGuid);
  }

  getCached(ratingKey: string): CatalogEntry | null {
    const row = this.db.prepare("SELECT * FROM content_catalog WHERE rating_key = ?").get(ratingKey) as any;
    if (!row) return null;
    return this.mapRowToEntry(row);
  }

  async refreshMetadata(ratingKey: string, plexGuid?: string): Promise<CatalogEntry | null> {
    const inFlight = this.refreshes.get(ratingKey);
    if (inFlight) return inFlight;

    const refresh = this.refreshMetadataUnshared(ratingKey, plexGuid);
    this.refreshes.set(ratingKey, refresh);
    try {
      return await refresh;
    } finally {
      if (this.refreshes.get(ratingKey) === refresh) this.refreshes.delete(ratingKey);
    }
  }

  ingestRichMetadata(plexMeta: PlexRichMetadata, scanId?: number): CatalogEntry {
    const entry = this.savePlexMetadata(plexMeta);
    const now = nowIso();
    this.db.prepare(`
      UPDATE content_catalog
      SET last_seen_at = ?, last_seen_scan_id = COALESCE(?, last_seen_scan_id)
      WHERE rating_key = ?
    `).run(now, scanId ?? null, entry.ratingKey);
    return entry;
  }

  async repairMissingMetadata(limit = METADATA_REPAIR_BATCH_SIZE): Promise<{ attempted: number; refreshed: number; failed: number }> {
    const batchSize = Math.max(1, Math.min(METADATA_REPAIR_BATCH_SIZE, Math.trunc(limit)));
    const candidates = this.db.prepare(`
      SELECT
        CASE
          WHEN lower(po.media_type) IN ('audiobook', 'track') THEN COALESCE(po.grandparent_rating_key, po.parent_rating_key, po.rating_key)
          WHEN lower(po.media_type) = 'episode' THEN COALESCE(po.grandparent_rating_key, po.rating_key)
          ELSE po.rating_key
        END AS catalog_key,
        MAX(po.plex_guid) AS plex_guid,
        MAX(po.watched_at) AS watched_at
      FROM playback_observations po
      JOIN users u ON u.id = po.user_id
      LEFT JOIN content_catalog cat ON cat.rating_key = CASE
        WHEN lower(po.media_type) IN ('audiobook', 'track') THEN COALESCE(po.grandparent_rating_key, po.parent_rating_key, po.rating_key)
        WHEN lower(po.media_type) = 'episode' THEN COALESCE(po.grandparent_rating_key, po.rating_key)
        ELSE po.rating_key
      END
      WHERE COALESCE(u.dashboard_shown, u.enabled) = 1
        AND lower(po.media_type) IN ('movie', 'episode', 'audiobook', 'track')
        AND (cat.rating_key IS NULL OR cat.source_provenance = 'fallback' OR cat.media_type = 'unknown')
      GROUP BY catalog_key
      ORDER BY watched_at DESC
      LIMIT ?
    `).all(batchSize * 5) as Array<{ catalog_key: string | null; plex_guid: string | null; watched_at: string }>;

    let attempted = 0;
    let refreshed = 0;
    let failed = 0;
    for (const candidate of candidates) {
      if (!candidate.catalog_key) continue;
      const cached = this.getCached(candidate.catalog_key);
      if (cached && !this.shouldRetry(cached)) continue;

      attempted++;
      const entry = await this.refreshMetadata(candidate.catalog_key, candidate.plex_guid ?? undefined);
      if (entry && !this.isFallback(entry)) refreshed++;
      else failed++;
      if (attempted >= batchSize) break;
    }
    return { attempted, refreshed, failed };
  }

  private async refreshMetadataUnshared(ratingKey: string, plexGuid?: string): Promise<CatalogEntry | null> {
    const prior = this.getCached(ratingKey);
    try {
      const plexMeta = await this.plex.getRichMetadataByRatingKey(ratingKey, plexGuid);
      const entry = this.savePlexMetadata(plexMeta);
      
      if (entry.mediaType === "episode" && entry.grandparentRatingKey) {
        await this.ensureShowMetadata(entry.grandparentRatingKey, entry.grandparentGuid);
      }
      
      return entry;
    } catch (error) {
      if (prior && !this.isFallback(prior)) return prior;
      const now = nowIso();
      const fallbackEntry: CatalogEntry = {
        ratingKey,
        guid: plexGuid ?? null,
        mediaType: "unknown",
        title: `Unknown Media (${ratingKey})`,
        duration: null,
        libraryId: null,
        libraryTitle: null,
        genres: [],
        grandparentRatingKey: null,
        grandparentGuid: null,
        grandparentTitle: null,
        parentRatingKey: null,
        parentGuid: null,
        parentTitle: null,
        leafCount: null,
        sourceProvenance: "fallback",
        refreshedAt: now
      };
      
      this.saveCatalogEntry(fallbackEntry);
      return fallbackEntry;
    }
  }

  private shouldRetry(entry: CatalogEntry): boolean {
    if (!this.isFallback(entry)) return false;
    const refreshedAt = Date.parse(entry.refreshedAt);
    return !Number.isFinite(refreshedAt) || Date.now() - refreshedAt >= METADATA_RETRY_COOLDOWN_MS;
  }

  private isFallback(entry: CatalogEntry): boolean {
    return entry.sourceProvenance === "fallback" || entry.mediaType === "unknown";
  }

  private async ensureShowMetadata(showRatingKey: string, showGuid?: string | null): Promise<void> {
    const cachedShow = this.getCached(showRatingKey);
    if (!cachedShow || cachedShow.mediaType !== "show") {
      await this.refreshMetadata(showRatingKey, showGuid ?? undefined);
    }
  }

  /**
   * Checks if the TV show's metadata is stale based on new evidence (Smart Auto-Healing)
   */
  async checkAndAutoHealShow(grandparentRatingKey: string): Promise<void> {
    const cachedShow = this.getCached(grandparentRatingKey);
    if (!cachedShow || cachedShow.mediaType !== "show") return;

    const obsCountRow = this.db.prepare(
      "SELECT COUNT(DISTINCT rating_key) AS count FROM playback_observations WHERE grandparent_rating_key = ?"
    ).get(grandparentRatingKey) as { count: number };

    const observedCount = obsCountRow?.count ?? 0;
    const leafCount = cachedShow.leafCount ?? 0;

    if (observedCount > leafCount) {
      console.log(`[MetadataService] Smart Auto-Healing: Observed ${observedCount} episodes for show ${grandparentRatingKey} but catalog shows ${leafCount}. Refreshing show metadata from Plex.`);
      await this.refreshMetadata(grandparentRatingKey, cachedShow.guid ?? undefined);
    }
  }

  private savePlexMetadata(plexMeta: PlexRichMetadata): CatalogEntry {
    const prepared = prepareAudiobookMetadata(plexMeta);
    plexMeta = prepared.metadata;
    const audiobookId = this.audiobooks.ensureLocalBook(prepared);
    const now = nowIso();
    const entry: CatalogEntry = {
      ratingKey: plexMeta.ratingKey,
      guid: plexMeta.guid ?? null,
      mediaType: plexMeta.mediaType,
      title: plexMeta.title,
      duration: plexMeta.duration ?? null,
      libraryId: plexMeta.librarySectionID ?? null,
      libraryTitle: plexMeta.librarySectionTitle ?? null,
      genres: plexMeta.genres,
      grandparentRatingKey: plexMeta.grandparentRatingKey ?? null,
      grandparentGuid: plexMeta.grandparentGuid ?? null,
      grandparentTitle: plexMeta.grandparentTitle ?? null,
      parentRatingKey: plexMeta.parentRatingKey ?? null,
      parentGuid: plexMeta.parentGuid ?? null,
      parentTitle: plexMeta.parentTitle ?? null,
      leafCount: plexMeta.leafCount ?? null,
      sourceProvenance: prepared.identity ? "folder_path" : "plex",
      filePath: plexMeta.filePath ?? null,
      audiobookId,
      refreshedAt: now
    };
    
    this.saveCatalogEntry(entry);
    if (audiobookId) {
      this.audiobooks.refreshAggregates(audiobookId);
    }
    return entry;
  }

  private saveCatalogEntry(entry: CatalogEntry): void {
    this.db.prepare(`
      INSERT INTO content_catalog (
        rating_key, guid, media_type, title, duration, library_id, library_title, genres_json,
        grandparent_rating_key, grandparent_guid, grandparent_title,
        parent_rating_key, parent_guid, parent_title, leaf_count, source_provenance, refreshed_at, file_path, audiobook_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rating_key) DO UPDATE SET
        guid = excluded.guid,
        media_type = excluded.media_type,
        title = excluded.title,
        duration = excluded.duration,
        library_id = excluded.library_id,
        library_title = excluded.library_title,
        genres_json = excluded.genres_json,
        grandparent_rating_key = excluded.grandparent_rating_key,
        grandparent_guid = excluded.grandparent_guid,
        grandparent_title = excluded.grandparent_title,
        parent_rating_key = excluded.parent_rating_key,
        parent_guid = excluded.parent_guid,
        parent_title = excluded.parent_title,
        leaf_count = excluded.leaf_count,
        source_provenance = excluded.source_provenance,
        refreshed_at = excluded.refreshed_at,
        file_path = excluded.file_path,
        audiobook_id = excluded.audiobook_id
    `).run(
      entry.ratingKey,
      entry.guid,
      entry.mediaType,
      entry.title,
      entry.duration,
      entry.libraryId,
      entry.libraryTitle,
      JSON.stringify(entry.genres),
      entry.grandparentRatingKey,
      entry.grandparentGuid,
      entry.grandparentTitle,
      entry.parentRatingKey,
      entry.parentGuid,
      entry.parentTitle,
      entry.leafCount,
      entry.sourceProvenance,
      entry.refreshedAt,
      entry.filePath ?? null,
      entry.audiobookId ?? null
    );
  }

  private mapRowToEntry(row: any): CatalogEntry {
    let genres: string[] = [];
    try {
      genres = JSON.parse(row.genres_json || "[]");
    } catch (_) {
      // ignore
    }

    return {
      ratingKey: row.rating_key,
      guid: row.guid,
      mediaType: row.media_type,
      title: row.title,
      duration: row.duration,
      libraryId: row.library_id,
      libraryTitle: row.library_title,
      genres,
      grandparentRatingKey: row.grandparent_rating_key,
      grandparentGuid: row.grandparent_guid,
      grandparentTitle: row.grandparent_title,
      parentRatingKey: row.parent_rating_key,
      parentGuid: row.parent_guid,
      parentTitle: row.parent_title,
      leafCount: row.leaf_count,
      sourceProvenance: row.source_provenance,
      refreshedAt: row.refreshed_at,
      filePath: row.file_path,
      audiobookId: row.audiobook_id
    };
  }
}
