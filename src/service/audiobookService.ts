import { createHash } from "node:crypto";
import type { Db } from "../db/database.js";
import type { AudiobookBook, PlexRichMetadata, TautulliHistoryRow } from "../types/index.js";
import { nowIso } from "../utils/time.js";
import { AuditService } from "./auditService.js";

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

export const PROVENANCE_PRECEDENCE = {
  metadata: 3,
  mapping: 2,
  pattern: 1,
  none: 0
};

export interface AudiobookHierarchyResult {
  parentSeriesTitle?: string;
  subseriesTitle?: string;
  relatedWorkClassification?: string;
  hierarchyProvenance: "metadata" | "mapping" | "pattern" | "none";
}

export function normalizeAudiobookHierarchy(
  title: string,
  author: string,
  currentSeries?: string
): AudiobookHierarchyResult {
  const normTitle = normalizeBookText(title);
  const normAuthor = normalizeBookText(author);
  const normSeries = currentSeries ? normalizeBookText(currentSeries) : "";

  // 1. Declarative Mappings (Discworld & Mistborn)
  const isDiscworld =
    normSeries === "discworld" ||
    normTitle.includes("discworld") ||
    normAuthor.includes("terry pratchett");

  if (isDiscworld) {
    let subseries: string | undefined = undefined;

    const cityWatch = [
      "guards guards",
      "men at arms",
      "feet of clay",
      "jingo",
      "the fifth elephant",
      "night watch",
      "thud",
      "snuff"
    ];
    const death = [
      "mort",
      "reaper man",
      "soul music",
      "hogfather",
      "thief of time"
    ];
    const witches = [
      "equal rites",
      "wyrd sisters",
      "witches abroad",
      "lords and ladies",
      "maskerade",
      "carpe jugulum"
    ];
    const rincewind = [
      "the colour of magic",
      "the light fantastic",
      "sourcery",
      "eric",
      "interesting times",
      "the last continent",
      "unseen academicals"
    ];
    const tiffany = [
      "the wee free men",
      "a hat full of sky",
      "wintersmith",
      "i shall wear midnight",
      "the shepherd s crown",
      "the shepherds crown"
    ];
    const moist = [
      "going postal",
      "making money",
      "raising steam"
    ];

    if (cityWatch.some(t => normTitle.includes(t))) {
      subseries = "Ankh-Morpork City Watch";
    } else if (death.some(t => normTitle.includes(t))) {
      subseries = "Death";
    } else if (witches.some(t => normTitle.includes(t))) {
      subseries = "Witches";
    } else if (rincewind.some(t => normTitle.includes(t))) {
      subseries = "Rincewind";
    } else if (tiffany.some(t => normTitle.includes(t))) {
      subseries = "Tiffany Aching";
    } else if (moist.some(t => normTitle.includes(t))) {
      subseries = "Moist von Lipwig";
    }

    return {
      parentSeriesTitle: "Discworld",
      subseriesTitle: subseries,
      hierarchyProvenance: "mapping"
    };
  }

  const isMistborn =
    normSeries === "mistborn" ||
    normTitle.includes("mistborn") ||
    (normAuthor.includes("brandon sanderson") && (
      normTitle.includes("alloy of law") ||
      normTitle.includes("shadows of self") ||
      normTitle.includes("bands of mourning") ||
      normTitle.includes("lost metal") ||
      normTitle.includes("final empire") ||
      normTitle.includes("well of ascension") ||
      normTitle.includes("hero of ages") ||
      normTitle.includes("secret history")
    ));

  if (isMistborn) {
    const era1 = [
      "the final empire",
      "the well of ascension",
      "the hero of ages",
      "mistborn 1",
      "mistborn 2",
      "mistborn 3"
    ];
    const era2 = [
      "the alloy of law",
      "shadows of self",
      "the bands of mourning",
      "the lost metal",
      "mistborn 4",
      "mistborn 5",
      "mistborn 6",
      "mistborn 7"
    ];
    const companion = [
      "secret history"
    ];

    let subseries: string | undefined = undefined;
    let classification: string | undefined = undefined;

    if (era1.some(t => normTitle.includes(t))) {
      subseries = "Era 1";
    } else if (era2.some(t => normTitle.includes(t))) {
      subseries = "Wax and Wayne";
    } else if (companion.some(t => normTitle.includes(t))) {
      classification = "companion";
    }

    return {
      parentSeriesTitle: "Mistborn",
      subseriesTitle: subseries,
      relatedWorkClassification: classification,
      hierarchyProvenance: "mapping"
    };
  }

  const isWoT =
    normSeries === "wheel of time" ||
    normTitle.includes("wheel of time") ||
    normTitle.includes("eye of the world") ||
    normTitle.includes("great hunt") ||
    normTitle.includes("dragon reborn") ||
    normTitle.includes("shadow rising") ||
    normTitle.includes("fires of heaven") ||
    normTitle.includes("lord of chaos") ||
    normTitle.includes("a crown of swords") ||
    normTitle.includes("path of daggers") ||
    normTitle.includes("winter s heart") ||
    normTitle.includes("winters heart") ||
    normTitle.includes("crossroads of twilight") ||
    normTitle.includes("knife of dreams") ||
    normTitle.includes("the gathering storm") ||
    normTitle.includes("towers of midnight") ||
    normTitle.includes("a memory of light") ||
    normTitle.includes("new spring");

  if (isWoT) {
    return {
      parentSeriesTitle: "Wheel of Time",
      hierarchyProvenance: "mapping"
    };
  }

  // 3. Conservative patterns
  if (currentSeries) {
    return {
      parentSeriesTitle: currentSeries.trim(),
      hierarchyProvenance: "pattern"
    };
  }

  return {
    hierarchyProvenance: "none"
  };
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

    const folderKey = identity?.folderKey ?? `asin:${asin}`;
    const title = identity?.bookTitle ?? metadata.parentTitle ?? metadata.title;
    const authors = identity?.author ? [identity.author] : [];
    const seriesTitle = canonicalizeAudiobookSeriesTitle(identity?.seriesTitle ?? metadata.grandparentTitle);
    const now = nowIso();

    const hierarchy = normalizeAudiobookHierarchy(title, authors[0] ?? "", seriesTitle);

    let existing = null;
    if (asin) {
      existing = this.db.prepare("SELECT * FROM audiobook_books WHERE asin = ?").get(asin) as any;
    }
    if (!existing) {
      existing = this.db.prepare("SELECT * FROM audiobook_books WHERE folder_key = ?").get(folderKey) as any;
    }

    if (existing) {
      const oldProv = existing.hierarchy_provenance ?? "none";
      const newProv = hierarchy.hierarchyProvenance;

      const oldPrec = PROVENANCE_PRECEDENCE[oldProv as keyof typeof PROVENANCE_PRECEDENCE] ?? 0;
      const newPrec = PROVENANCE_PRECEDENCE[newProv as keyof typeof PROVENANCE_PRECEDENCE] ?? 0;

      let shouldUpdateHierarchy = false;
      if (newPrec > oldPrec) {
        shouldUpdateHierarchy = true;
      } else if (newPrec === oldPrec && newPrec > 0) {
        const sameParent = existing.parent_series_title === (hierarchy.parentSeriesTitle ?? null);
        const sameSub = existing.subseries_title === (hierarchy.subseriesTitle ?? null);
        const sameClass = existing.related_work_classification === (hierarchy.relatedWorkClassification ?? null);
        if (sameParent && sameSub && sameClass) {
          shouldUpdateHierarchy = true;
        }
      }

      const updatedTitle = existing.source_provenance === 'folder_path' ? title : existing.title;
      const updatedAuthors = existing.source_provenance === 'folder_path' ? JSON.stringify(authors) : existing.authors_json;
      const updatedSeries = existing.source_provenance === 'folder_path' ? seriesTitle : existing.series_title;

      if (shouldUpdateHierarchy) {
        this.db.prepare(`
          UPDATE audiobook_books SET
            asin = COALESCE(asin, ?),
            title = ?,
            authors_json = ?,
            series_title = ?,
            folder_path_hint = COALESCE(folder_path_hint, ?),
            parent_series_title = ?,
            subseries_title = ?,
            related_work_classification = ?,
            hierarchy_provenance = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          asin ?? null,
          updatedTitle,
          updatedAuthors,
          updatedSeries,
          identity?.folderPathHint ?? null,
          hierarchy.parentSeriesTitle ?? null,
          hierarchy.subseriesTitle ?? null,
          hierarchy.relatedWorkClassification ?? null,
          hierarchy.hierarchyProvenance,
          now,
          existing.id
        );
      } else {
        this.db.prepare(`
          UPDATE audiobook_books SET
            asin = COALESCE(asin, ?),
            title = ?,
            authors_json = ?,
            series_title = ?,
            folder_path_hint = COALESCE(folder_path_hint, ?),
            updated_at = ?
          WHERE id = ?
        `).run(
          asin ?? null,
          updatedTitle,
          updatedAuthors,
          updatedSeries,
          identity?.folderPathHint ?? null,
          now,
          existing.id
        );
      }
      return existing.id;
    } else {
      this.db.prepare(`
        INSERT INTO audiobook_books (
          folder_key, asin, title, authors_json, narrators_json, series_title,
          genres_json, source_provenance, folder_path_hint, enrichment_status,
          parent_series_title, subseries_title, related_work_classification, hierarchy_provenance,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, '[]', ?, '[]', 'folder_path', ?, 'pending', ?, ?, ?, ?, ?, ?)
      `).run(
        folderKey,
        asin ?? null,
        title,
        JSON.stringify(authors),
        seriesTitle ?? null,
        identity?.folderPathHint ?? null,
        hierarchy.parentSeriesTitle ?? null,
        hierarchy.subseriesTitle ?? null,
        hierarchy.relatedWorkClassification ?? null,
        hierarchy.hierarchyProvenance,
        now,
        now
      );
      const row = this.db.prepare("SELECT id FROM audiobook_books WHERE folder_key = ?").get(folderKey) as { id: number };
      return row.id;
    }
  }

  refreshAggregates(id: number): void {
    this.db.prepare(`
      UPDATE audiobook_books SET
        total_duration_seconds = (SELECT CAST(COALESCE(SUM(duration) / 1000, 0) AS INTEGER) FROM content_catalog WHERE audiobook_id = ?),
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
    const existing = this.db.prepare("SELECT * FROM audiobook_books WHERE id = ?").get(id) as any;
    if (!existing) return;

    const authors = data.authors;
    const hierarchy = normalizeAudiobookHierarchy(
      data.title,
      authors[0] ?? "",
      data.seriesTitle
    );

    const oldProv = existing.hierarchy_provenance ?? "none";
    const newProv = hierarchy.hierarchyProvenance;

    const oldPrec = PROVENANCE_PRECEDENCE[oldProv as keyof typeof PROVENANCE_PRECEDENCE] ?? 0;
    const newPrec = PROVENANCE_PRECEDENCE[newProv as keyof typeof PROVENANCE_PRECEDENCE] ?? 0;

    let shouldUpdateHierarchy = false;
    if (newPrec > oldPrec) {
      shouldUpdateHierarchy = true;
    } else if (newPrec === oldPrec && newPrec > 0) {
      const sameParent = existing.parent_series_title === (hierarchy.parentSeriesTitle ?? null);
      const sameSub = existing.subseries_title === (hierarchy.subseriesTitle ?? null);
      const sameClass = existing.related_work_classification === (hierarchy.relatedWorkClassification ?? null);
      if (sameParent && sameSub && sameClass) {
        shouldUpdateHierarchy = true;
      }
    }

    const now = nowIso();
    if (shouldUpdateHierarchy) {
      this.db.prepare(`
        UPDATE audiobook_books SET
          asin = COALESCE(?, asin), isbn = COALESCE(?, isbn), google_books_id = COALESCE(?, google_books_id),
          title = ?, subtitle = ?, authors_json = ?, narrators_json = ?, series_title = COALESCE(?, series_title),
          series_index = COALESCE(?, series_index), year = ?, description = ?, cover_url = ?, genres_json = ?,
          language = ?, source_provenance = ?, enrichment_status = 'enriched',
          parent_series_title = ?, subseries_title = ?, related_work_classification = ?, hierarchy_provenance = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        data.asin ?? null, data.isbn ?? null, data.googleBooksId ?? null, data.title, data.subtitle ?? null,
        JSON.stringify(data.authors), JSON.stringify(data.narrators), data.seriesTitle ?? null, data.seriesIndex ?? null,
        data.year ?? null, data.description ?? null, data.coverUrl ?? null, JSON.stringify(data.genres),
        data.language ?? null, data.sourceProvenance,
        hierarchy.parentSeriesTitle ?? null, hierarchy.subseriesTitle ?? null, hierarchy.relatedWorkClassification ?? null, hierarchy.hierarchyProvenance,
        now, id
      );
    } else {
      this.db.prepare(`
        UPDATE audiobook_books SET
          asin = COALESCE(?, asin), isbn = COALESCE(?, isbn), google_books_id = COALESCE(?, google_books_id),
          title = ?, subtitle = ?, authors_json = ?, narrators_json = ?, series_title = COALESCE(?, series_title),
          series_index = COALESCE(?, series_index), year = ?, description = ?, cover_url = ?, genres_json = ?,
          language = ?, source_provenance = ?, enrichment_status = 'enriched',
          updated_at = ?
        WHERE id = ?
      `).run(
        data.asin ?? null, data.isbn ?? null, data.googleBooksId ?? null, data.title, data.subtitle ?? null,
        JSON.stringify(data.authors), JSON.stringify(data.narrators), data.seriesTitle ?? null, data.seriesIndex ?? null,
        data.year ?? null, data.description ?? null, data.coverUrl ?? null, JSON.stringify(data.genres),
        data.language ?? null, data.sourceProvenance,
        now, id
      );
    }
  }

  importChapters(input: any, options: { apply: boolean }): { success: boolean; chaptersCount: number; audiobookId: number; dryRun: boolean; title: string } {
    const audit = new AuditService(this.db);
    const actor = "cli-import";
    const payload = { input, options };

    try {
      let audiobook: any = null;
      if (input.audiobookId) {
        audiobook = this.db.prepare("SELECT id, title FROM audiobook_books WHERE id = ?").get(input.audiobookId);
      } else if (input.asin) {
        audiobook = this.db.prepare("SELECT id, title FROM audiobook_books WHERE asin = ?").get(input.asin);
      } else if (input.folderKey) {
        audiobook = this.db.prepare("SELECT id, title FROM audiobook_books WHERE folder_key = ?").get(input.folderKey);
      }

      if (!audiobook) {
        throw new Error("Audiobook not found in database using the provided audiobookId, asin, or folderKey.");
      }

      if (!input.chapters || !Array.isArray(input.chapters)) {
        throw new Error("Chapters array is missing or invalid.");
      }

      for (const ch of input.chapters) {
        if (typeof ch.index !== "number" || typeof ch.title !== "string" || typeof ch.start_offset_ms !== "number" || typeof ch.end_offset_ms !== "number") {
          throw new Error(`Invalid chapter at index: ${ch.index ?? "unknown"}. Must contain index (number), title (string), start_offset_ms (number), end_offset_ms (number)`);
        }
      }

      const sourceType = input.sourceType || "audiobook_tool";
      const status = input.sourceStatus || "active";
      const confidence = typeof input.confidence === "number" ? input.confidence : 1.0;
      const now = nowIso();

      if (options.apply) {
        this.db.exec("BEGIN IMMEDIATE");
        try {
          this.db.prepare(`
            INSERT INTO audiobook_chapter_sources (audiobook_id, source_type, source_status, confidence, refreshed_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(audiobook_id, source_type) DO UPDATE SET
              source_status = excluded.source_status,
              confidence = excluded.confidence,
              refreshed_at = excluded.refreshed_at
          `).run(audiobook.id, sourceType, status, confidence, now);

          this.db.prepare("DELETE FROM audiobook_chapters WHERE audiobook_id = ?").run(audiobook.id);

          const insertStmt = this.db.prepare(`
            INSERT INTO audiobook_chapters (audiobook_id, chapter_index, title, start_offset_ms, end_offset_ms, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          for (const ch of input.chapters) {
            insertStmt.run(audiobook.id, ch.index, ch.title, ch.start_offset_ms, ch.end_offset_ms, now, now);
          }

          this.db.exec("COMMIT");
        } catch (dbErr: any) {
          this.db.exec("ROLLBACK");
          throw dbErr;
        }

        audit.record("import-audiobook-chapters", actor, "success", { ...payload, audiobookId: audiobook.id, chaptersCount: input.chapters.length });
      } else {
        audit.record("import-audiobook-chapters-dryrun", actor, "success", { ...payload, audiobookId: audiobook.id, chaptersCount: input.chapters.length });
      }

      return {
        success: true,
        chaptersCount: input.chapters.length,
        audiobookId: audiobook.id,
        dryRun: !options.apply,
        title: audiobook.title
      };

    } catch (err: any) {
      audit.record("import-audiobook-chapters", actor, "failed", payload, err.message);
      throw err;
    }
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

export interface AudiobookProviderCandidate {
  asin?: string;
  isbn?: string;
  title: string;
  authors: string[];
  narrators: string[];
  seriesTitle?: string;
  seriesIndex?: number;
  year?: number;
  description?: string;
  coverUrl?: string;
  genres: string[];
  language?: string;
  sourceProvenance: string;
  confidence: number;
}

export interface AudiobookProvider {
  name: string;
  searchBook(title: string, author: string): Promise<AudiobookProviderCandidate[]>;
  getBookByAsin?(asin: string): Promise<AudiobookProviderCandidate | null>;
}

