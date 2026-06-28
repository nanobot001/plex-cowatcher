import { createHash } from "node:crypto";
import type { Db } from "../db/database.js";
import type { AudiobookBook, PlexRichMetadata, TautulliHistoryRow } from "../types/index.js";
import { nowIso } from "../utils/time.js";

export interface AudiobookPathIdentity {
  folderKey: string;
  author: string;
  seriesTitle?: string;
  bookTitle: string;
  folderPathHint: string;
}

export interface PreparedAudiobookMetadata {
  metadata: PlexRichMetadata;
  identity?: AudiobookPathIdentity;
  asin?: string;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type BookRow = {
  id: number;
  folder_key: string;
  asin: string | null;
  title: string;
  authors_json: string;
  enrichment_status: string;
};

export function isAudiobookMedia(input: Pick<TautulliHistoryRow, "mediaType" | "plexGuid" | "libraryName" | "duration">): boolean {
  if (input.mediaType === "audiobook") return true;
  if (input.mediaType !== "track") return false;
  const guid = input.plexGuid?.toLowerCase() ?? "";
  const library = input.libraryName?.toLowerCase() ?? "";
  const durationSeconds = (input.duration ?? 0) > 100000 ? (input.duration ?? 0) / 1000 : (input.duration ?? 0);
  return guid.includes("audnexus") || guid.includes("audiobook") || library.includes("audiobook") || durationSeconds > 900;
}

export function parseAudnexusAsin(guid?: string): string | undefined {
  if (!guid || !/audnexus/i.test(guid)) return undefined;
  return guid.match(/audnexus:\/\/([a-z0-9]{10})(?:_[a-z]{2})?/i)?.[1]?.toUpperCase();
}

export function normalizeBookText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalizeAudiobookSeriesTitle(value?: string): string | undefined {
  const normalized = normalizeBookText(value ?? "");
  if (!normalized) return undefined;
  if (normalized === "wheel of time" || normalized === "the wheel of time") {
    return "Wheel of Time";
  }
  return value?.trim() || undefined;
}

export function parseAudiobookPath(filePath?: string): AudiobookPathIdentity | undefined {
  if (!filePath) return undefined;
  const parts = filePath.split(/[\\/]+/).filter(Boolean);
  const marker = parts.findIndex((part) => part.toLowerCase() === "audiobooks");
  const directories = marker >= 0 ? parts.slice(marker + 1, -1) : [];
  if (directories.length < 2) return undefined;

  const bookTitle = directories.at(-1)!;
  const author = directories[0]!;
  const seriesTitle = directories.length >= 3 ? directories.at(-2) : undefined;
  const normalized = directories.map(normalizeBookText).join("/");
  const folderKey = createHash("sha256").update(normalized).digest("hex");
  return {
    folderKey,
    author,
    seriesTitle,
    bookTitle,
    folderPathHint: parts.slice(0, -1).join("\\")
  };
}

export function prepareAudiobookMetadata(metadata: PlexRichMetadata): PreparedAudiobookMetadata {
  const audiobook = isAudiobookMedia({
    mediaType: metadata.mediaType,
    plexGuid: metadata.guid,
    libraryName: metadata.librarySectionTitle,
    duration: metadata.duration
  });
  if (!audiobook) return { metadata };

  const identity = parseAudiobookPath(metadata.filePath);
  return {
    asin: parseAudnexusAsin(metadata.guid),
    identity,
    metadata: {
      ...metadata,
      mediaType: "audiobook",
      parentTitle: identity?.bookTitle ?? metadata.parentTitle,
      grandparentTitle: canonicalizeAudiobookSeriesTitle(identity?.seriesTitle ?? metadata.grandparentTitle) ?? identity?.author ?? metadata.grandparentTitle
    }
  };
}

export class AudiobookCatalogService {
  constructor(
    private readonly db: Db,
    private readonly fetcher: FetchLike = fetch
  ) {}

  ensureLocalBook(prepared: PreparedAudiobookMetadata): number | null {
    const { identity, asin, metadata } = prepared;
    if (!identity && !asin) return null;
    if (asin) {
      const existing = this.db.prepare("SELECT id FROM audiobook_books WHERE asin = ?").get(asin) as { id: number } | undefined;
      if (existing) return existing.id;
    }

    const folderKey = identity?.folderKey ?? `asin:${asin}`;
    const title = identity?.bookTitle ?? metadata.parentTitle ?? metadata.title;
    const authors = identity?.author ? [identity.author] : [];
    const seriesTitle = canonicalizeAudiobookSeriesTitle(identity?.seriesTitle ?? metadata.grandparentTitle);
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO audiobook_books (
        folder_key, asin, title, authors_json, narrators_json, series_title,
        genres_json, source_provenance, folder_path_hint, enrichment_status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, '[]', ?, '[]', 'folder_path', ?, 'pending', ?, ?)
      ON CONFLICT(folder_key) DO UPDATE SET
        asin = COALESCE(audiobook_books.asin, excluded.asin),
        title = CASE WHEN audiobook_books.source_provenance = 'folder_path' THEN excluded.title ELSE audiobook_books.title END,
        authors_json = CASE WHEN audiobook_books.source_provenance = 'folder_path' THEN excluded.authors_json ELSE audiobook_books.authors_json END,
        series_title = CASE WHEN audiobook_books.source_provenance = 'folder_path' THEN excluded.series_title ELSE audiobook_books.series_title END,
        folder_path_hint = COALESCE(audiobook_books.folder_path_hint, excluded.folder_path_hint),
        updated_at = excluded.updated_at
    `).run(
      folderKey,
      asin ?? null,
      title,
      JSON.stringify(authors),
      seriesTitle ?? null,
      identity?.folderPathHint ?? null,
      now,
      now
    );
    const row = this.db.prepare("SELECT id FROM audiobook_books WHERE folder_key = ?").get(folderKey) as { id: number };
    return row.id;
  }

  refreshAggregates(id: number): void {
    this.db.prepare(`
      UPDATE audiobook_books SET
        total_duration_seconds = (SELECT CAST(COALESCE(SUM(CASE WHEN duration > 100000 THEN duration / 1000 ELSE duration END), 0) AS INTEGER) FROM content_catalog WHERE audiobook_id = ?),
        chapter_count = (SELECT COUNT(*) FROM content_catalog WHERE audiobook_id = ?),
        updated_at = ?
      WHERE id = ?
    `).run(id, id, nowIso(), id);
  }

  async enrichBook(id: number, apply: boolean): Promise<{ status: "enriched" | "pending"; provenance?: "audnexus" | "google_books"; reason?: string }> {
    const row = this.db.prepare("SELECT id, folder_key, asin, title, authors_json, enrichment_status FROM audiobook_books WHERE id = ?").get(id) as BookRow | undefined;
    if (!row) return { status: "pending", reason: "book_not_found" };

    const authors = parseStringArray(row.authors_json);
    try {
      const enriched = row.asin
        ? await this.fetchAudnexus(row.asin)
        : await this.fetchGoogleBooks(row.title, authors);
      if (!enriched) return { status: "pending", reason: row.asin ? "audnexus_no_match" : "google_books_no_confident_match" };

      if (apply) this.applyEnrichment(row.id, enriched);
      return { status: "enriched", provenance: enriched.sourceProvenance };
    } catch (error) {
      return { status: "pending", reason: error instanceof Error ? error.message : "enrichment_failed" };
    }
  }

  private async fetchAudnexus(asin: string): Promise<EnrichmentData | null> {
    const data = await this.fetchJson(`https://api.audnex.us/books/${encodeURIComponent(asin)}`) as Record<string, any>;
    if (!data?.title) return null;
    const series = Array.isArray(data.seriesPrimary) ? data.seriesPrimary[0] : data.seriesPrimary;
    return {
      asin,
      title: String(data.title),
      subtitle: stringOrUndefined(data.subtitle),
      authors: namesFrom(data.authors),
      narrators: namesFrom(data.narrators),
      seriesTitle: canonicalizeAudiobookSeriesTitle(stringOrUndefined(series?.name)),
      seriesIndex: numberOrUndefined(series?.position),
      year: yearFrom(data.releaseDate),
      description: stringOrUndefined(data.summary ?? data.description),
      coverUrl: stringOrUndefined(data.image),
      genres: namesFrom(data.genres),
      language: stringOrUndefined(data.language),
      sourceProvenance: "audnexus"
    };
  }

  private async fetchGoogleBooks(title: string, authors: string[]): Promise<EnrichmentData | null> {
    const query = [`intitle:${title}`, authors[0] ? `inauthor:${authors[0]}` : ""].filter(Boolean).join(" ");
    const data = await this.fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`) as Record<string, any>;
    const items = Array.isArray(data?.items) ? data.items : [];
    const match = items.find((item: any) => {
      const info = item?.volumeInfo ?? {};
      const titleMatches = normalizeBookText(String(info.title ?? "")) === normalizeBookText(title);
      const candidateAuthors = Array.isArray(info.authors) ? info.authors.map(String) : [];
      const authorMatches = authors.length > 0 && candidateAuthors.some((candidate: string) =>
        authors.some((author) => normalizeBookText(candidate) === normalizeBookText(author))
      );
      return titleMatches && authorMatches;
    });
    if (!match) return null;
    const info = match.volumeInfo ?? {};
    const isbn = (info.industryIdentifiers ?? []).find((item: any) => item.type === "ISBN_13")?.identifier;
    return {
      googleBooksId: String(match.id),
      isbn: stringOrUndefined(isbn),
      title: String(info.title),
      subtitle: stringOrUndefined(info.subtitle),
      authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
      narrators: [],
      year: yearFrom(info.publishedDate),
      description: stringOrUndefined(info.description),
      coverUrl: stringOrUndefined(info.imageLinks?.thumbnail),
      genres: Array.isArray(info.categories) ? info.categories.map(String) : [],
      language: stringOrUndefined(info.language),
      sourceProvenance: "google_books"
    };
  }

  private async fetchJson(url: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await this.fetcher(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`upstream_http_${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(lastError instanceof Error && lastError.name === "AbortError" ? "upstream_timeout" : "upstream_unavailable");
  }

  private applyEnrichment(id: number, data: EnrichmentData): void {
    this.db.prepare(`
      UPDATE audiobook_books SET
        asin = COALESCE(?, asin), isbn = COALESCE(?, isbn), google_books_id = COALESCE(?, google_books_id),
        title = ?, subtitle = ?, authors_json = ?, narrators_json = ?, series_title = COALESCE(?, series_title),
        series_index = COALESCE(?, series_index), year = ?, description = ?, cover_url = ?, genres_json = ?,
        language = ?, source_provenance = ?, enrichment_status = 'enriched', updated_at = ?
      WHERE id = ?
    `).run(
      data.asin ?? null, data.isbn ?? null, data.googleBooksId ?? null, data.title, data.subtitle ?? null,
      JSON.stringify(data.authors), JSON.stringify(data.narrators), data.seriesTitle ?? null, data.seriesIndex ?? null,
      data.year ?? null, data.description ?? null, data.coverUrl ?? null, JSON.stringify(data.genres),
      data.language ?? null, data.sourceProvenance, nowIso(), id
    );
  }
}

interface EnrichmentData {
  asin?: string;
  isbn?: string;
  googleBooksId?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  narrators: string[];
  seriesTitle?: string;
  seriesIndex?: number;
  year?: number;
  description?: string;
  coverUrl?: string;
  genres: string[];
  language?: string;
  sourceProvenance: "audnexus" | "google_books";
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function namesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => String(item?.name ?? item)).filter(Boolean);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function yearFrom(value: unknown): number | undefined {
  const match = String(value ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : undefined;
}
