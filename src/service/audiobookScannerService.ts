import type { Db } from "../db/database.js";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import { AudiobookCatalogService } from "./audiobookService.js";
import { MetadataService } from "./metadataService.js";

export interface AudiobookScanResult {
  ok: boolean;
  libraryTitle: string;
  scanned: number;
  added: number;
  enriched: number;
  errors: string[];
}

export class AudiobookScannerService {
  private readonly catalog: AudiobookCatalogService;
  private readonly metadata: MetadataService;

  constructor(
    private readonly db: Db,
    private readonly plex: PlexAdapter,
    fetcher: typeof fetch = fetch
  ) {
    this.catalog = new AudiobookCatalogService(db, fetcher);
    this.metadata = new MetadataService(db, plex);
  }

  async scanLibrary(libraryNameOrKey: string): Promise<AudiobookScanResult> {
    const result: AudiobookScanResult = {
      ok: true,
      libraryTitle: libraryNameOrKey,
      scanned: 0,
      added: 0,
      enriched: 0,
      errors: []
    };

    // 1. Resolve library key
    const libraries = await this.plex.listLibraries();
    const lib = libraries.find(
      (l) => l.key === libraryNameOrKey || l.title.toLowerCase() === libraryNameOrKey.toLowerCase()
    );
    if (!lib) {
      throw new Error(`Library '${libraryNameOrKey}' not found in Plex.`);
    }

    result.libraryTitle = lib.title;

    // 2. Fetch all tracks
    const tracks = await this.plex.listLibraryTracks(lib.key);
    
    // Track unique audiobook IDs we touched during the scan
    const enrichedBookIds = new Set<number>();

    for (const track of tracks) {
      result.scanned++;
      try {
        const entry = await this.metadata.refreshMetadata(track.ratingKey);
        if (entry?.audiobookId) {
          result.added++;
          
          // Trigger enrichment if not already done, and we haven't enriched this book in this run yet
          if (!enrichedBookIds.has(entry.audiobookId)) {
            const book = this.db.prepare("SELECT enrichment_status FROM audiobook_books WHERE id = ?").get(entry.audiobookId) as { enrichment_status: string } | undefined;
            if (book && book.enrichment_status !== "enriched") {
              const outcome = await this.catalog.enrichBook(entry.audiobookId, true);
              if (outcome.status === "enriched") {
                result.enriched++;
              }
            }
            enrichedBookIds.add(entry.audiobookId);
          }
        }
      } catch (err) {
        result.errors.push(`Track ${track.ratingKey} (${track.title}) failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    result.ok = result.errors.length === 0;
    return result;
  }
}
