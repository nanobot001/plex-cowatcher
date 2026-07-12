import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { Db } from "../db/database.js";
import type { PlexRichMetadata } from "../types/index.js";
import { nowIso } from "../utils/time.js";
import { AudiobookCatalogService } from "./audiobookService.js";
import { MetadataService, type CatalogEntry } from "./metadataService.js";
import {
  calculateMediaRevisionManifest,
  persistManifestAndOutbox,
  reconcileLegacyDiscoveryOutbox
} from "./audiobookRevisionService.js";

export type AudiobookDiscoveryTrigger = "startup" | "interval" | "webhook-item" | "manual";

export interface AudiobookScanResult {
  ok: boolean;
  status: "succeeded" | "partial";
  libraryTitle: string;
  scanned: number;
  added: number;
  enriched: number;
  errors: string[];
  tracksVisited: number;
  trackFailures: number;
  booksNew: number;
  booksChanged: number;
  booksAlreadyKnown: number;
  booksPendingIdentity: number;
  booksPendingEnrichment: number;
  identityConflicts: number;
  outboxEnqueued: number;
}

type ScanOptions = {
  runId?: number;
  trigger?: AudiobookDiscoveryTrigger;
  enrichmentLimit?: number;
  now?: Date;
};

type BookRow = {
  id: number;
  identity_status: string;
  enrichment_status: string;
  enrichment_next_attempt_at: string | null;
  enrichment_attempt_count: number;
  current_media_revision: string | null;
};

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

  async scanLibrary(libraryNameOrKey: string, options: ScanOptions = {}): Promise<AudiobookScanResult> {
    const libraries = await this.plex.listLibraries();
    const library = libraries.find(
      (item) => item.key === libraryNameOrKey || item.title.toLowerCase() === libraryNameOrKey.toLowerCase()
    );
    if (!library) throw new Error("AUDIOBOOK_LIBRARY_NOT_FOUND");

    const result = emptyResult(library.title);
    const existingBookIds = new Set<number>(
      (this.db.prepare("SELECT id FROM audiobook_books").all() as Array<{ id: number }>).map((row) => row.id)
    );
    const tracks = await this.plex.listLibraryTracks(library.key);
    const tracksByBook = new Map<number, CatalogEntry[]>();
    const failedBooks = new Set<number>();

    for (const rawTrack of tracks) {
      result.scanned++;
      result.tracksVisited++;
      try {
        const track: PlexRichMetadata = {
          ...rawTrack,
          mediaType: "audiobook",
          librarySectionID: rawTrack.librarySectionID ?? library.key,
          librarySectionTitle: rawTrack.librarySectionTitle ?? library.title
        };
        const entry = this.metadata.ingestRichMetadata(track, options.runId);
        if (!entry.audiobookId) {
          result.booksPendingIdentity++;
          continue;
        }
        const bookTracks = tracksByBook.get(entry.audiobookId) ?? [];
        bookTracks.push(entry);
        tracksByBook.set(entry.audiobookId, bookTracks);
      } catch {
        result.trackFailures++;
        result.errors.push(`TRACK_RECONCILE_FAILED:${rawTrack.ratingKey}`);
        const prior = this.db.prepare("SELECT audiobook_id FROM content_catalog WHERE rating_key = ?")
          .get(rawTrack.ratingKey) as { audiobook_id: number | null } | undefined;
        if (prior?.audiobook_id) failedBooks.add(prior.audiobook_id);
      }
      if (result.tracksVisited % 25 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    let enrichmentsAttempted = 0;
    const enrichmentLimit = Math.max(0, Math.min(20, options.enrichmentLimit ?? 20));
    const scanNow = options.now ?? new Date();
    const trigger = options.trigger ?? "manual";

    for (const [bookId, bookTracks] of tracksByBook) {
      const book = this.db.prepare(`
        SELECT id, identity_status, enrichment_status, enrichment_next_attempt_at,
               enrichment_attempt_count, current_media_revision
        FROM audiobook_books WHERE id = ?
      `).get(bookId) as BookRow;

      const wasKnown = existingBookIds.has(bookId);
      if (!wasKnown) result.booksNew++;

      if (book.identity_status === "conflict") {
        result.identityConflicts++;
      } else if (book.identity_status !== "identified") {
        result.booksPendingIdentity++;
      }

      const manifest = failedBooks.has(bookId) ? null : calculateMediaRevisionManifest(bookTracks);
      if (manifest) {
        if (book.current_media_revision && book.current_media_revision !== manifest.mediaRevision) result.booksChanged++;
        else if (wasKnown) result.booksAlreadyKnown++;

        if (book.identity_status === "identified") {
          if (persistManifestAndOutbox(this.db, bookId, manifest, trigger, scanNow.toISOString())) {
            result.outboxEnqueued++;
          }
        } else {
          this.db.prepare(`
            UPDATE audiobook_books
            SET current_media_revision = ?, media_revision_updated_at = ?, updated_at = ?
            WHERE id = ?
          `).run(manifest.mediaRevision, scanNow.toISOString(), scanNow.toISOString(), bookId);
        }
      }

      if (book.enrichment_status !== "enriched") {
        const nextAttempt = book.enrichment_next_attempt_at ? Date.parse(book.enrichment_next_attempt_at) : 0;
        if (enrichmentsAttempted < enrichmentLimit && (!Number.isFinite(nextAttempt) || nextAttempt <= scanNow.getTime())) {
          enrichmentsAttempted++;
          const outcome = await this.catalog.enrichBook(bookId, true);
          if (outcome.status === "enriched") {
            result.enriched++;
            this.db.prepare(`
              UPDATE audiobook_books
              SET enrichment_status = 'enriched', enrichment_last_attempt_at = ?,
                  enrichment_next_attempt_at = NULL, enrichment_attempt_count = 0,
                  enrichment_last_error_code = NULL
              WHERE id = ?
            `).run(scanNow.toISOString(), bookId);
          } else {
            result.booksPendingEnrichment++;
            const attempt = Math.max(0, book.enrichment_attempt_count) + 1;
            const delay = enrichmentDelayMs(attempt, outcome.reason);
            this.db.prepare(`
              UPDATE audiobook_books
              SET enrichment_status = 'retry_wait', enrichment_last_attempt_at = ?,
                  enrichment_next_attempt_at = ?, enrichment_attempt_count = ?,
                  enrichment_last_error_code = ?
              WHERE id = ?
            `).run(
              scanNow.toISOString(),
              new Date(scanNow.getTime() + delay).toISOString(),
              attempt,
              safeEnrichmentCode(outcome.reason),
              bookId
            );
          }
        } else {
          result.booksPendingEnrichment++;
        }
      }
    }

    reconcileLegacyDiscoveryOutbox(this.db, scanNow.toISOString());

    result.added = result.booksNew;
    result.ok = result.trackFailures === 0;
    result.status = result.ok ? "succeeded" : "partial";
    return result;
  }

  async scanItem(
    ratingKey: string,
    plexGuid?: string,
    libraryTitle = "Audiobooks",
    options: ScanOptions = {}
  ): Promise<AudiobookScanResult> {
    const result = emptyResult(libraryTitle);
    result.scanned = 1;
    result.tracksVisited = 1;
    const before = this.db.prepare("SELECT COUNT(*) AS count FROM audiobook_books").get() as { count: number };
    const entry = await this.metadata.refreshMetadata(ratingKey, plexGuid);
    if (!entry?.audiobookId) {
      result.booksPendingIdentity = 1;
      return result;
    }
    const after = this.db.prepare("SELECT COUNT(*) AS count FROM audiobook_books").get() as { count: number };
    result.booksNew = Math.max(0, after.count - before.count);
    result.booksAlreadyKnown = result.booksNew === 0 ? 1 : 0;
    result.added = result.booksNew;
    this.db.prepare("UPDATE content_catalog SET last_seen_at = ? WHERE rating_key = ?")
      .run((options.now ?? new Date()).toISOString(), entry.ratingKey);
    return result;
  }
}

function emptyResult(libraryTitle: string): AudiobookScanResult {
  return {
    ok: true,
    status: "succeeded",
    libraryTitle,
    scanned: 0,
    added: 0,
    enriched: 0,
    errors: [],
    tracksVisited: 0,
    trackFailures: 0,
    booksNew: 0,
    booksChanged: 0,
    booksAlreadyKnown: 0,
    booksPendingIdentity: 0,
    booksPendingEnrichment: 0,
    identityConflicts: 0,
    outboxEnqueued: 0
  };
}

function enrichmentDelayMs(attempt: number, reason?: string): number {
  if (reason?.includes("no_match")) return 7 * 24 * 60 * 60 * 1000;
  const delays = [15 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60];
  return delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)]! * 1000;
}

function safeEnrichmentCode(reason?: string): string {
  if (reason === "audnexus_no_match") return "AUDNEXUS_NO_MATCH";
  if (reason === "google_books_no_confident_match") return "GOOGLE_BOOKS_NO_CONFIDENT_MATCH";
  if (reason === "upstream_timeout") return "ENRICHMENT_TIMEOUT";
  if (reason === "book_not_found") return "AUDIOBOOK_NOT_FOUND";
  return "ENRICHMENT_UNAVAILABLE";
}
