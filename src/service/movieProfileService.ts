import type { Db } from "../db/database.js";
import type { DashboardDetailIdentity, DashboardMovieProfile, DashboardMovieProfileReadResult } from "../types/api.js";
import type { MovieProfileAdapterLike, MovieProfileLookupInput } from "./movieProfileAdapter.js";

const DEFAULT_TTL_MS = 15 * 60 * 1_000;
const DEFAULT_FAILURE_BACKOFF_MS = 5_000;

type CachedProfile = { profile: DashboardMovieProfile; expiresAt: number };
type FailureBackoff = { result: DashboardMovieProfileReadResult; retryAt: number };

export interface MovieProfileServiceOptions {
  ttlMs?: number;
  failureBackoffMs?: number;
  now?: () => number;
}

export class MovieProfileService {
  private readonly cache = new Map<string, CachedProfile>();
  private readonly failures = new Map<string, FailureBackoff>();
  private readonly inFlight = new Map<string, Promise<DashboardMovieProfileReadResult>>();
  private readonly ttlMs: number;
  private readonly failureBackoffMs: number;
  private readonly now: () => number;

  constructor(
    private readonly db: Db,
    private readonly adapter: MovieProfileAdapterLike,
    options: MovieProfileServiceOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.failureBackoffMs = options.failureBackoffMs ?? DEFAULT_FAILURE_BACKOFF_MS;
    this.now = options.now ?? Date.now;
  }

  async getProfile(identity: DashboardDetailIdentity): Promise<DashboardMovieProfileReadResult> {
    if (identity.kind !== "movie") return { status: "unavailable", reason: "not_found" };
    const lookup = this.lookupInput(identity.ratingKey);
    const cacheKey = lookup.imdbId ? `imdb:${lookup.imdbId}` : lookup.tmdbId ? `tmdb:${lookup.tmdbId}` : `plex:${lookup.ratingKey}`;
    const now = this.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return { status: "available", profile: cached.profile, cached: true };
    if (cached) this.cache.delete(cacheKey);
    const failure = this.failures.get(cacheKey);
    if (failure && failure.retryAt > now) return failure.result;
    if (failure) this.failures.delete(cacheKey);
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    const request = this.adapter.fetchProfile(lookup).then((result) => {
      if (result.status === "available") {
        this.cache.set(cacheKey, { profile: result.profile, expiresAt: this.now() + this.ttlMs });
        this.failures.delete(cacheKey);
      } else {
        this.failures.set(cacheKey, { result, retryAt: this.now() + this.failureBackoffMs });
      }
      return result;
    }).catch(() => {
      const result = { status: "unavailable", reason: "upstream_unavailable" } as const;
      this.failures.set(cacheKey, { result, retryAt: this.now() + this.failureBackoffMs });
      return result;
    }).finally(() => {
      this.inFlight.delete(cacheKey);
    });
    this.inFlight.set(cacheKey, request);
    return request;
  }

  private lookupInput(ratingKey: string): MovieProfileLookupInput {
    const row = this.db.prepare(`
      SELECT title, guid
      FROM content_catalog
      WHERE rating_key = ? AND lower(media_type) = 'movie'
      LIMIT 1
    `).get(ratingKey) as any;
    const guid = typeof row?.guid === "string" ? row.guid : "";
    const imdbId = guid.match(/(?:imdb:\/\/|\b)(tt\d{5,12})\b/i)?.[1];
    const tmdbMatch = guid.match(/tmdb:\/\/(\d+)/i);
    const tmdbId = tmdbMatch ? Number(tmdbMatch[1]) : undefined;
    return {
      ratingKey,
      ...(imdbId ? { imdbId } : {}),
      ...(Number.isInteger(tmdbId) && Number(tmdbId) > 0 ? { tmdbId } : {}),
      ...(typeof row?.title === "string" && row.title.trim() ? { title: row.title.trim() } : {})
    };
  }
}
