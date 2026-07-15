import { createHash } from "node:crypto";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { Db } from "../db/database.js";

export type ArtworkVariant = "poster" | "backdrop";
export type ArtworkResolutionOutcome =
  | "local_cover"
  | "plex_key"
  | "plex_guid_recovered"
  | "missing"
  | "rejected_source"
  | "upstream_failure";

export interface ArtworkResolution {
  canonicalKey: string;
  source: string;
  revision: string;
  outcome: Exclude<ArtworkResolutionOutcome, "missing" | "rejected_source" | "upstream_failure">;
}

export interface DashboardArtworkDescriptor {
  artworkKey: string;
  artworkRevision: string;
  artworkUrl: string;
  posterUrl: string;
  backdropUrl: string;
}

type CacheEntry = {
  expiresAt: number;
  value: ArtworkResolution | null;
};

type PlexArtworkIdentity = {
  ratingKey: string;
  plexGuid: string | null;
  expectedFamily: "movie" | "tv" | "audio" | "unknown";
};

const DEFAULT_POSITIVE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_NEGATIVE_TTL_MS = 30 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 256;

function opaqueRevision(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function familyForMediaType(mediaType: string | null | undefined): PlexArtworkIdentity["expectedFamily"] {
  const normalized = String(mediaType ?? "").toLowerCase();
  if (normalized === "movie") return "movie";
  if (["show", "season", "episode"].includes(normalized)) return "tv";
  if (["audiobook", "track", "album"].includes(normalized)) return "audio";
  return "unknown";
}

function revisionRows(db: Db, artworkKey: string): unknown[] {
  if (artworkKey.startsWith("audiobook:")) {
    const audiobookId = Number(artworkKey.slice("audiobook:".length));
    if (!Number.isInteger(audiobookId) || audiobookId <= 0) return [{ artworkKey }];
    const book = db.prepare(`
      SELECT id, cover_url, updated_at
      FROM audiobook_books
      WHERE id = ?
    `).get(audiobookId) as Record<string, unknown> | undefined;
    const catalog = db.prepare(`
      SELECT rating_key, guid, parent_rating_key, parent_guid, grandparent_rating_key,
        grandparent_guid, media_type, refreshed_at
      FROM content_catalog
      WHERE audiobook_id = ?
      ORDER BY rating_key
    `).all(audiobookId) as Record<string, unknown>[];
    return [{ artworkKey }, book ?? null, ...catalog];
  }

  const rows = db.prepare(`
    SELECT rating_key, guid, parent_rating_key, parent_guid, grandparent_rating_key,
      grandparent_guid, media_type, refreshed_at
    FROM content_catalog
    WHERE rating_key = ? OR parent_rating_key = ? OR grandparent_rating_key = ?
    ORDER BY rating_key
  `).all(artworkKey, artworkKey, artworkKey) as Record<string, unknown>[];
  return [{ artworkKey }, ...rows];
}

export function getArtworkRevisionSeed(db: Db, artworkKey: string): string {
  return opaqueRevision(JSON.stringify(revisionRows(db, artworkKey)));
}

export function buildDashboardArtworkDescriptor(db: Db, artworkKey: string): DashboardArtworkDescriptor {
  const encodedKey = encodeURIComponent(artworkKey);
  const artworkRevision = getArtworkRevisionSeed(db, artworkKey);
  const posterUrl = `/api/artwork/${encodedKey}?variant=poster&v=${artworkRevision}`;
  return {
    artworkKey,
    artworkRevision,
    artworkUrl: posterUrl,
    posterUrl,
    backdropUrl: `/api/artwork/${encodedKey}?variant=backdrop&v=${artworkRevision}`
  };
}

export class ArtworkResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<ArtworkResolution | null>>();

  constructor(
    private readonly db: Db,
    private readonly plex: PlexAdapter,
    private readonly options: {
      positiveTtlMs?: number;
      negativeTtlMs?: number;
      maxCacheEntries?: number;
      now?: () => number;
    } = {}
  ) {}

  getRevisionSeed(artworkKey: string): string {
    return getArtworkRevisionSeed(this.db, artworkKey);
  }

  async resolve(
    artworkKey: string,
    variant: ArtworkVariant,
    options: { skipLocalCover?: boolean } = {}
  ): Promise<ArtworkResolution | null> {
    const revisionSeed = this.getRevisionSeed(artworkKey);
    const mode = options.skipLocalCover ? "fallback" : "primary";
    const cacheKey = `${variant}:${mode}:${artworkKey}:${revisionSeed}`;
    const now = this.options.now?.() ?? Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached.value;
    }
    if (cached) this.cache.delete(cacheKey);

    const existing = this.inflight.get(cacheKey);
    if (existing) return existing;

    const pending = this.resolveUncached(artworkKey, variant, options.skipLocalCover === true)
      .then((value) => {
        const ttl = value
          ? (this.options.positiveTtlMs ?? DEFAULT_POSITIVE_TTL_MS)
          : (this.options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS);
        this.setCache(cacheKey, { value, expiresAt: now + ttl });
        return value;
      })
      .finally(() => this.inflight.delete(cacheKey));
    this.inflight.set(cacheKey, pending);
    return pending;
  }

  private setCache(key: string, entry: CacheEntry): void {
    const maxEntries = this.options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    while (this.cache.size >= maxEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    this.cache.set(key, entry);
  }

  private async resolveUncached(
    artworkKey: string,
    variant: ArtworkVariant,
    skipLocalCover: boolean
  ): Promise<ArtworkResolution | null> {
    if (variant === "poster" && artworkKey.startsWith("audiobook:") && !skipLocalCover) {
      const audiobookId = Number(artworkKey.slice("audiobook:".length));
      if (Number.isInteger(audiobookId) && audiobookId > 0) {
        const book = this.db.prepare(`
          SELECT cover_url
          FROM audiobook_books
          WHERE id = ?
        `).get(audiobookId) as { cover_url: string | null } | undefined;
        const source = book?.cover_url?.trim();
        if (source && isSupportedArtworkSource(source)) {
          return {
            canonicalKey: artworkKey,
            source,
            revision: opaqueRevision(`${artworkKey}:${variant}:${source}`),
            outcome: "local_cover"
          };
        }
      }
    }

    const identity = this.resolvePlexIdentity(artworkKey);
    if (!identity) return null;

    try {
      const metadata = await this.plex.getRichMetadataByRatingKey(identity.ratingKey, identity.plexGuid ?? undefined);
      if (identity.plexGuid) {
        if (!metadata.guid || metadata.guid !== identity.plexGuid) return null;
        const actualFamily = familyForMediaType(metadata.mediaType);
        if (identity.expectedFamily !== "unknown" && actualFamily !== identity.expectedFamily) return null;
      }
      const source = variant === "backdrop"
        ? metadata.art ?? metadata.parentArt ?? metadata.grandparentArt
        : metadata.thumb ?? metadata.parentThumb ?? metadata.grandparentThumb;
      if (!source || !isSupportedArtworkSource(source)) return null;
      return {
        canonicalKey: artworkKey,
        source,
        revision: opaqueRevision(`${artworkKey}:${variant}:${source}`),
        outcome: metadata.ratingKey !== identity.ratingKey ? "plex_guid_recovered" : "plex_key"
      };
    } catch {
      return null;
    }
  }

  private resolvePlexIdentity(artworkKey: string): PlexArtworkIdentity | null {
    if (artworkKey.startsWith("audiobook:")) {
      const audiobookId = Number(artworkKey.slice("audiobook:".length));
      if (!Number.isInteger(audiobookId) || audiobookId <= 0) return null;
      const row = this.db.prepare(`
        SELECT COALESCE(parent_rating_key, rating_key) AS rating_key,
          COALESCE(parent_guid, guid) AS guid, media_type
        FROM content_catalog
        WHERE audiobook_id = ?
        ORDER BY refreshed_at DESC, rating_key DESC
        LIMIT 1
      `).get(audiobookId) as { rating_key: string; guid: string | null; media_type: string } | undefined;
      if (!row?.rating_key) return null;
      return { ratingKey: row.rating_key, plexGuid: row.guid ?? null, expectedFamily: "audio" };
    }

    const direct = this.db.prepare(`
      SELECT rating_key, guid, media_type
      FROM content_catalog
      WHERE rating_key = ?
      LIMIT 1
    `).get(artworkKey) as { rating_key: string; guid: string | null; media_type: string } | undefined;
    if (direct) {
      return {
        ratingKey: direct.rating_key,
        plexGuid: direct.guid ?? null,
        expectedFamily: familyForMediaType(direct.media_type)
      };
    }

    const hierarchy = this.db.prepare(`
      SELECT
        CASE WHEN grandparent_rating_key = ? THEN grandparent_rating_key ELSE parent_rating_key END AS rating_key,
        CASE WHEN grandparent_rating_key = ? THEN grandparent_guid ELSE parent_guid END AS guid,
        CASE WHEN grandparent_rating_key = ? THEN 'show' ELSE media_type END AS media_type
      FROM content_catalog
      WHERE grandparent_rating_key = ? OR parent_rating_key = ?
      ORDER BY refreshed_at DESC, rating_key
      LIMIT 1
    `).get(artworkKey, artworkKey, artworkKey, artworkKey, artworkKey) as { rating_key: string; guid: string | null; media_type: string } | undefined;
    if (hierarchy?.rating_key) {
      return {
        ratingKey: hierarchy.rating_key,
        plexGuid: hierarchy.guid ?? null,
        expectedFamily: familyForMediaType(hierarchy.media_type)
      };
    }

    return { ratingKey: artworkKey, plexGuid: null, expectedFamily: "unknown" };
  }
}

export function isSupportedArtworkSource(source: string): boolean {
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)(?:;|,)/i.test(source)) return true;
  if (/^https?:\/\//i.test(source)) return true;
  return source.startsWith("/");
}
