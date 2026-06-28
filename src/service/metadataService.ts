import type { Db } from "../db/database.js";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { PlexRichMetadata } from "../types/index.js";
import { nowIso } from "../utils/time.js";
import { AudiobookCatalogService, prepareAudiobookMetadata } from "./audiobookService.js";

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
  constructor(
    private readonly db: Db,
    private readonly plex: PlexAdapter
  ) {
    this.audiobooks = new AudiobookCatalogService(db);
  }

  async getMetadata(ratingKey: string, plexGuid?: string): Promise<CatalogEntry | null> {
    const cached = this.getCached(ratingKey);
    if (cached) {
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
    try {
      const plexMeta = await this.plex.getRichMetadataByRatingKey(ratingKey, plexGuid);
      const entry = this.savePlexMetadata(plexMeta);
      
      if (entry.mediaType === "episode" && entry.grandparentRatingKey) {
        await this.ensureShowMetadata(entry.grandparentRatingKey, entry.grandparentGuid);
      }
      
      return entry;
    } catch (error) {
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
