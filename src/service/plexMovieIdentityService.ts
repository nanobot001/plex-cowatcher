import type { Db } from "../db/database.js";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import { nowIso } from "../utils/time.js";
import { AuditService } from "./auditService.js";

type IdentityConfidence = "high" | "medium" | "low" | "unknown";
type IdentityStatus = "resolved" | "ambiguous" | "unresolved";
type RepairOutcome = "repaired" | "already_canonical" | "unresolved" | "ambiguous" | "failed";

type MovieEvidenceRow = {
  plex_guid: string;
  rating_key: string;
  title: string | null;
  refreshed_at: string | null;
  last_seen_at: string | null;
  artwork_poster_fingerprint: string | null;
  artwork_backdrop_fingerprint: string | null;
  source_name: string;
};

type MovieKeyEvidence = {
  ratingKey: string;
  title: string | null;
  refreshedAt: string | null;
  lastSeenAt: string | null;
  artworkScore: number;
  sources: string[];
};

export interface MovieIdentityCandidate {
  plexGuid: string;
  title: string | null;
  ratingKeys: MovieKeyEvidence[];
  canonicalRatingKey: string | null;
  status: IdentityStatus;
  outcome: RepairOutcome;
  resolutionMethod: string;
  confidence: IdentityConfidence;
  sourceRowCount: number;
  errorCode?: string;
}

export interface MovieIdentityRepairSummary {
  exactGuidCandidates: number;
  sourceRows: number;
  ratingKeys: number;
  repaired: number;
  alreadyCanonical: number;
  unresolved: number;
  ambiguous: number;
  failed: number;
  aliasesWritten: number;
}

export type MovieIdentityRepairResult = {
  ok: true;
  dryRun: boolean;
  confirmRequired: boolean;
  summary: MovieIdentityRepairSummary;
  candidates: MovieIdentityCandidate[];
} | {
  ok: false;
  errorCode: string;
  message: string;
  retryable: boolean;
};

const MOVIE_EVIDENCE_SQL = `
  SELECT guid AS plex_guid, rating_key, title, refreshed_at, last_seen_at,
    artwork_poster_fingerprint, artwork_backdrop_fingerprint, 'content_catalog' AS source_name
  FROM content_catalog
  WHERE lower(media_type) = 'movie' AND trim(COALESCE(guid, '')) <> ''
  UNION ALL
  SELECT plex_guid, rating_key, title, NULL AS refreshed_at, watched_at AS last_seen_at,
    NULL AS artwork_poster_fingerprint, NULL AS artwork_backdrop_fingerprint, 'playback_observations' AS source_name
  FROM playback_observations
  WHERE lower(media_type) = 'movie' AND trim(COALESCE(plex_guid, '')) <> ''
  UNION ALL
  SELECT plex_guid, rating_key, title, NULL AS refreshed_at, last_viewed_at AS last_seen_at,
    NULL AS artwork_poster_fingerprint, NULL AS artwork_backdrop_fingerprint, 'plex_historical_movie_snapshots' AS source_name
  FROM plex_historical_movie_snapshots
  WHERE trim(COALESCE(plex_guid, '')) <> ''
  UNION ALL
  SELECT source_guid AS plex_guid, source_rating_key AS rating_key, title_snapshot AS title,
    NULL AS refreshed_at, event_time AS last_seen_at,
    NULL AS artwork_poster_fingerprint, NULL AS artwork_backdrop_fingerprint, 'archive_watch_events' AS source_name
  FROM archive_watch_events
  WHERE trim(COALESCE(source_guid, '')) <> '' AND trim(COALESCE(source_rating_key, '')) <> ''
`;

function nonEmpty(value: unknown): string | null {
  const result = typeof value === "string" ? value.trim() : "";
  return result || null;
}

function compareIsoDescending(left: string | null, right: string | null): number {
  return String(right ?? "").localeCompare(String(left ?? ""));
}

function compareKeyEvidence(left: MovieKeyEvidence, right: MovieKeyEvidence): number {
  return right.artworkScore - left.artworkScore
    || compareIsoDescending(left.refreshedAt, right.refreshedAt)
    || compareIsoDescending(left.lastSeenAt, right.lastSeenAt)
    || left.ratingKey.localeCompare(right.ratingKey, undefined, { numeric: true });
}

function qualityIsDecisive(sorted: MovieKeyEvidence[]): boolean {
  if (sorted.length <= 1) return true;
  const [first, second] = sorted;
  if (first.artworkScore !== second.artworkScore) return true;
  if (first.refreshedAt !== second.refreshedAt) return true;
  if (first.lastSeenAt !== second.lastSeenAt) return true;
  return false;
}

function uniqueKeys(rows: MovieEvidenceRow[]): MovieKeyEvidence[] {
  const byKey = new Map<string, MovieKeyEvidence>();
  for (const row of rows) {
    const ratingKey = nonEmpty(row.rating_key);
    if (!ratingKey) continue;
    const existing = byKey.get(ratingKey);
    const next: MovieKeyEvidence = {
      ratingKey,
      title: nonEmpty(row.title),
      refreshedAt: nonEmpty(row.refreshed_at),
      lastSeenAt: nonEmpty(row.last_seen_at),
      artworkScore: (nonEmpty(row.artwork_poster_fingerprint) ? 1 : 0) + (nonEmpty(row.artwork_backdrop_fingerprint) ? 1 : 0),
      sources: [row.source_name]
    };
    if (!existing) {
      byKey.set(ratingKey, next);
      continue;
    }
    existing.title ||= next.title;
    if (compareIsoDescending(existing.refreshedAt, next.refreshedAt) > 0) existing.refreshedAt = next.refreshedAt;
    if (compareIsoDescending(existing.lastSeenAt, next.lastSeenAt) > 0) existing.lastSeenAt = next.lastSeenAt;
    existing.artworkScore = Math.max(existing.artworkScore, next.artworkScore);
    if (!existing.sources.includes(row.source_name)) existing.sources.push(row.source_name);
  }
  return [...byKey.values()].sort(compareKeyEvidence);
}

type ExplicitMovieIdentity = { guid: string; canonicalKey: string; keys: string[] };
type MovieIdentityCache = {
  explicitByKey: Map<string, ExplicitMovieIdentity>;
  fallbackGuidByKey: Map<string, string>;
  fallbackKeysByGuid: Map<string, string[]>;
  fallbackCanonicalByKey: Map<string, string>;
};

const identityCaches = new WeakMap<object, MovieIdentityCache>();

function buildMovieIdentityCache(db: Db): MovieIdentityCache {
  const explicitById = new Map<number, ExplicitMovieIdentity>();
  const explicitByKey = new Map<string, ExplicitMovieIdentity>();
  const explicitRows = db.prepare(`
    SELECT ci.id, ci.plex_guid, ci.canonical_rating_key, mia.rating_key
    FROM movie_canonical_identities ci
    JOIN movie_identity_aliases mia ON mia.canonical_movie_id = ci.id
    WHERE ci.status = 'resolved'
  `).all() as Array<{ id: number; plex_guid: string; canonical_rating_key: string; rating_key: string }>;
  for (const row of explicitRows) {
    const identity = explicitById.get(Number(row.id)) ?? { guid: row.plex_guid, canonicalKey: row.canonical_rating_key, keys: [] };
    if (!identity.keys.includes(row.rating_key)) identity.keys.push(row.rating_key);
    explicitById.set(Number(row.id), identity);
  }
  for (const identity of explicitById.values()) {
    for (const key of identity.keys) explicitByKey.set(key, identity);
  }

  const fallbackRows = db.prepare(`
    SELECT guid AS plex_guid, rating_key, title, refreshed_at, last_seen_at,
      artwork_poster_fingerprint, artwork_backdrop_fingerprint, 'content_catalog' AS source_name
    FROM content_catalog
    WHERE lower(media_type) = 'movie' AND trim(COALESCE(guid, '')) <> ''
    UNION ALL
    SELECT plex_guid, rating_key, title, NULL AS refreshed_at, watched_at AS last_seen_at,
      NULL AS artwork_poster_fingerprint, NULL AS artwork_backdrop_fingerprint, 'playback_observations' AS source_name
    FROM playback_observations
    WHERE lower(media_type) = 'movie' AND trim(COALESCE(plex_guid, '')) <> ''
  `).all() as MovieEvidenceRow[];
  const fallbackByGuid = new Map<string, MovieEvidenceRow[]>();
  for (const row of fallbackRows) {
    const guid = nonEmpty(row.plex_guid);
    const key = nonEmpty(row.rating_key);
    if (!guid || !key) continue;
    const group = fallbackByGuid.get(guid) ?? [];
    group.push(row);
    fallbackByGuid.set(guid, group);
  }
  const fallbackGuidByKey = new Map<string, string>();
  const fallbackKeysByGuid = new Map<string, string[]>();
  const fallbackCanonicalByKey = new Map<string, string>();
  for (const [guid, rows] of fallbackByGuid.entries()) {
    const keys = uniqueKeys(rows).map((row) => row.ratingKey);
    fallbackKeysByGuid.set(guid, keys);
    for (const key of keys) fallbackGuidByKey.set(key, guid);
    const sorted = uniqueKeys(rows);
    if (qualityIsDecisive(sorted) && sorted[0]?.ratingKey) {
      for (const key of keys) fallbackCanonicalByKey.set(key, sorted[0].ratingKey);
    }
  }
  return { explicitByKey, fallbackGuidByKey, fallbackKeysByGuid, fallbackCanonicalByKey };
}

function movieIdentityCache(db: Db): MovieIdentityCache {
  const existing = identityCaches.get(db);
  if (existing) return existing;
  const created = buildMovieIdentityCache(db);
  identityCaches.set(db, created);
  return created;
}

export function warmMovieIdentityCache(db: Db): void {
  movieIdentityCache(db);
}

export function clearMovieIdentityCache(db: Db): void {
  identityCaches.delete(db);
}

export function getMovieIdentityGuid(db: Db, ratingKey: string): string | null {
  const cache = movieIdentityCache(db);
  return cache.explicitByKey.get(ratingKey)?.guid ?? cache.fallbackGuidByKey.get(ratingKey) ?? null;
}

export function getMovieIdentityKeys(db: Db, ratingKey: string): string[] {
  const cache = movieIdentityCache(db);
  const explicit = cache.explicitByKey.get(ratingKey);
  if (explicit) return [...explicit.keys];
  const guid = cache.fallbackGuidByKey.get(ratingKey);
  return guid ? [...(cache.fallbackKeysByGuid.get(guid) ?? [ratingKey])] : [ratingKey];
}

export function getCanonicalMovieRatingKey(db: Db, ratingKey: string): string {
  const cache = movieIdentityCache(db);
  return cache.explicitByKey.get(ratingKey)?.canonicalKey
    ?? cache.fallbackCanonicalByKey.get(ratingKey)
    ?? ratingKey;
}

export class PlexMovieIdentityService {
  constructor(private readonly db: Db, private readonly plex?: PlexAdapter) {}

  async run(options: { apply: boolean; confirm: boolean; actor?: string }): Promise<MovieIdentityRepairResult> {
    if (options.apply && !options.confirm) {
      return {
        ok: false,
        errorCode: "PLEX_MOVIE_IDENTITY_CONFIRM_REQUIRED",
        message: "Canonical Plex movie identity repair requires --apply and --confirm.",
        retryable: false
      };
    }

    const rows = this.db.prepare(MOVIE_EVIDENCE_SQL).all() as MovieEvidenceRow[];
    const byGuid = new Map<string, MovieEvidenceRow[]>();
    for (const row of rows) {
      const guid = nonEmpty(row.plex_guid);
      if (!guid) continue;
      const group = byGuid.get(guid) ?? [];
      group.push(row);
      byGuid.set(guid, group);
    }

    const candidates: MovieIdentityCandidate[] = [];
    for (const [plexGuid, evidence] of byGuid.entries()) {
      candidates.push(await this.chooseCandidate(plexGuid, evidence));
    }
    candidates.sort((left, right) => left.plexGuid.localeCompare(right.plexGuid));

    const summary: MovieIdentityRepairSummary = {
      exactGuidCandidates: candidates.length,
      sourceRows: rows.length,
      ratingKeys: candidates.reduce((total, candidate) => total + candidate.ratingKeys.length, 0),
      repaired: candidates.filter((candidate) => candidate.outcome === "repaired").length,
      alreadyCanonical: candidates.filter((candidate) => candidate.outcome === "already_canonical").length,
      unresolved: candidates.filter((candidate) => candidate.outcome === "unresolved").length,
      ambiguous: candidates.filter((candidate) => candidate.outcome === "ambiguous").length,
      failed: 0,
      aliasesWritten: 0
    };

    if (options.apply) {
      for (const candidate of candidates.filter((item) => item.status === "resolved" && item.canonicalRatingKey)) {
        try {
          summary.aliasesWritten += this.persistCandidate(candidate);
        } catch (error) {
          const priorOutcome = candidate.outcome;
          candidate.outcome = "failed";
          candidate.errorCode = error instanceof Error ? error.message : "PLEX_MOVIE_IDENTITY_APPLY_FAILED";
          summary.failed += 1;
          if (priorOutcome === "repaired") summary.repaired -= 1;
          if (priorOutcome === "already_canonical") summary.alreadyCanonical -= 1;
        }
      }
      clearMovieIdentityCache(this.db);
      new AuditService(this.db).record(
        "plex_movie_identity_repair",
        options.actor ?? "unknown",
        summary.failed > 0 ? "partial" : "ok",
        { ...summary, dryRun: false }
      );
    }

    return { ok: true, dryRun: !options.apply, confirmRequired: false, summary, candidates };
  }

  private async chooseCandidate(plexGuid: string, evidence: MovieEvidenceRow[]): Promise<MovieIdentityCandidate> {
    const ratingKeys = uniqueKeys(evidence);
    const title = evidence.map((row) => nonEmpty(row.title)).find(Boolean) ?? null;
    const existing = this.db.prepare(`
      SELECT canonical_rating_key, status, resolution_method, confidence
      FROM movie_canonical_identities WHERE plex_guid = ? LIMIT 1
    `).get(plexGuid) as { canonical_rating_key?: string; status?: IdentityStatus; resolution_method?: string; confidence?: IdentityConfidence } | undefined;

    let canonicalRatingKey: string | null = ratingKeys.length === 1 ? ratingKeys[0].ratingKey : null;
    let resolutionMethod = "single_exact_guid_key";
    let confidence: IdentityConfidence = "high";
    if (ratingKeys.length > 1) {
      const probe = ratingKeys[0];
      let activeKey: string | null = null;
      if (this.plex?.resolveActiveRatingKey) {
        try {
          activeKey = nonEmpty(await this.plex.resolveActiveRatingKey(probe.ratingKey, plexGuid));
        } catch {
          activeKey = null;
        }
      }
      if (activeKey) {
        canonicalRatingKey = activeKey;
        if (!ratingKeys.some((item) => item.ratingKey === activeKey)) {
          ratingKeys.push({ ratingKey: activeKey, title, refreshedAt: null, lastSeenAt: null, artworkScore: 0, sources: ["plex_resolver"] });
        }
        resolutionMethod = "plex_guid_active_key";
        confidence = "high";
      } else if (qualityIsDecisive(ratingKeys)) {
        canonicalRatingKey = ratingKeys[0].ratingKey;
        resolutionMethod = ratingKeys[0].artworkScore > 0 ? "exact_guid_artwork_recency" : "exact_guid_recency";
        confidence = ratingKeys[0].artworkScore > 0 ? "high" : "medium";
      } else {
        resolutionMethod = "exact_guid_ambiguous";
        confidence = "unknown";
      }
    }

    const existingCanonical = nonEmpty(existing?.canonical_rating_key);
    if (!canonicalRatingKey && existing?.status === "resolved" && existingCanonical) {
      canonicalRatingKey = existingCanonical;
      resolutionMethod = existing?.resolution_method ?? "existing_exact_guid_identity";
      confidence = (existing?.confidence as IdentityConfidence) ?? "medium";
    }

    const status: IdentityStatus = canonicalRatingKey ? "resolved" : ratingKeys.length > 1 ? "ambiguous" : "unresolved";
    const outcome: RepairOutcome = status !== "resolved"
      ? status
      : existing?.status === "resolved" && existingCanonical === canonicalRatingKey
        ? "already_canonical"
        : "repaired";
    return {
      plexGuid,
      title,
      ratingKeys: ratingKeys.sort(compareKeyEvidence),
      canonicalRatingKey,
      status,
      outcome,
      resolutionMethod,
      confidence,
      sourceRowCount: evidence.length
    };
  }

  private persistCandidate(candidate: MovieIdentityCandidate): number {
    const now = nowIso();
    const existingIdentity = this.db.prepare(`
      SELECT id FROM movie_canonical_identities WHERE plex_guid = ? LIMIT 1
    `).get(candidate.plexGuid) as { id?: number } | undefined;
    const identityId = existingIdentity?.id
      ? Number(existingIdentity.id)
      : Number(this.db.prepare(`
        INSERT INTO movie_canonical_identities
          (plex_guid, canonical_rating_key, title_snapshot, status, resolution_method, confidence, first_seen_at, last_seen_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(candidate.plexGuid, candidate.canonicalRatingKey, candidate.title, candidate.status, candidate.resolutionMethod, candidate.confidence, now, now, now).lastInsertRowid);

    for (const key of candidate.ratingKeys) {
      const conflict = this.db.prepare(`
        SELECT canonical_movie_id FROM movie_identity_aliases WHERE rating_key = ? AND canonical_movie_id <> ? LIMIT 1
      `).get(key.ratingKey, identityId) as { canonical_movie_id?: number } | undefined;
      if (conflict?.canonical_movie_id) throw new Error("PLEX_MOVIE_IDENTITY_ALIAS_CONFLICT");
    }

    this.db.prepare(`
      UPDATE movie_canonical_identities
      SET canonical_rating_key = ?, title_snapshot = COALESCE(?, title_snapshot), status = ?,
          resolution_method = ?, confidence = ?, last_seen_at = ?, updated_at = ?
      WHERE id = ?
    `).run(candidate.canonicalRatingKey, candidate.title, candidate.status, candidate.resolutionMethod, candidate.confidence, now, now, identityId);

    let aliasesWritten = 0;
    const upsert = this.db.prepare(`
      INSERT INTO movie_identity_aliases
        (canonical_movie_id, rating_key, alias_role, title_snapshot, resolution_method, confidence, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rating_key) DO UPDATE SET
        canonical_movie_id = excluded.canonical_movie_id,
        alias_role = excluded.alias_role,
        title_snapshot = COALESCE(excluded.title_snapshot, movie_identity_aliases.title_snapshot),
        resolution_method = excluded.resolution_method,
        confidence = excluded.confidence,
        last_seen_at = excluded.last_seen_at
    `);
    for (const key of candidate.ratingKeys) {
      const result = upsert.run(identityId, key.ratingKey, key.ratingKey === candidate.canonicalRatingKey ? "canonical" : "stale", key.title ?? candidate.title, candidate.resolutionMethod, candidate.confidence, now, now);
      aliasesWritten += Number(result.changes ?? 0);
    }
    return aliasesWritten;
  }
}
