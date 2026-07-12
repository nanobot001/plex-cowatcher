import { createHash } from "node:crypto";
import type { Db } from "../db/database.js";
import type { CatalogEntry } from "./metadataService.js";

export type ManifestStatus = "ready" | "unsupported_multi_file" | "unavailable";

export interface MediaRevisionManifestItem {
  order: number;
  stableIdentity: string;
  durationMs: number | null;
  privateFilePath: string | null;
  pathHash: string | null;
}

export interface MediaRevisionManifest {
  mediaRevision: string;
  trackCount: number;
  fileCount: number;
  totalDurationMs: number | null;
  status: ManifestStatus;
  items: MediaRevisionManifestItem[];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

export function calculateMediaRevisionManifest(tracks: CatalogEntry[]): MediaRevisionManifest | null {
  const stableTracks = tracks.map((track) => {
    const normalizedPath = track.filePath ? normalizePath(track.filePath) : null;
    const pathHash = normalizedPath ? createHash("sha256").update(normalizedPath).digest("hex") : null;
    const stableIdentity = track.guid ? `guid:${track.guid}` : pathHash ? `path:${pathHash}` : null;
    if (!stableIdentity) return null;
    return {
      stableIdentity,
      orderKey: normalizedPath ?? stableIdentity,
      durationMs: track.duration,
      privateFilePath: track.filePath ?? null,
      pathHash
    };
  });
  if (stableTracks.some((track) => track === null)) return null;

  const ordered = (stableTracks as Array<NonNullable<(typeof stableTracks)[number]>>)
    .sort((left, right) => left.orderKey.localeCompare(right.orderKey));
  const revisionParts = ordered.map((track, index) =>
    `${String(index).padStart(6, "0")}|${track.stableIdentity}|${track.durationMs ?? "unknown"}`
  );
  const fileCount = new Set(ordered.map((track) => track.pathHash).filter(Boolean)).size;
  const allDurationsKnown = ordered.every((track) => track.durationMs != null);
  const allPathsKnown = ordered.every((track) => track.privateFilePath != null);
  return {
    mediaRevision: createHash("sha256").update(revisionParts.join("\n")).digest("hex"),
    trackCount: ordered.length,
    fileCount,
    totalDurationMs: allDurationsKnown
      ? ordered.reduce((total, track) => total + Number(track.durationMs), 0)
      : null,
    status: !allPathsKnown || fileCount === 0
      ? "unavailable"
      : fileCount > 1
        ? "unsupported_multi_file"
        : "ready",
    items: ordered.map((track, order) => ({
      order,
      stableIdentity: track.stableIdentity,
      durationMs: track.durationMs,
      privateFilePath: track.privateFilePath,
      pathHash: track.pathHash
    }))
  };
}

export function persistManifestAndOutbox(
  db: Db,
  audiobookId: number,
  manifest: MediaRevisionManifest,
  triggerReason: string,
  createdAt: string
): boolean {
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare(`
      SELECT id, track_count, file_count, total_duration_ms, manifest_status
      FROM audiobook_media_revisions WHERE audiobook_id = ? AND media_revision = ?
    `).get(audiobookId, manifest.mediaRevision) as any;
    let revisionId: number;
    if (existing) {
      const items = db.prepare(`
        SELECT item_order, stable_identity, duration_ms, private_file_path, path_hash
        FROM audiobook_media_revision_items WHERE revision_id = ? ORDER BY item_order
      `).all(existing.id) as any[];
      const expected = manifest.items.map((item) => [item.order, item.stableIdentity, item.durationMs,
        item.privateFilePath, item.pathHash]);
      const actual = items.map((item) => [item.item_order, item.stable_identity, item.duration_ms,
        item.private_file_path, item.path_hash]);
      if (existing.track_count !== manifest.trackCount || existing.file_count !== manifest.fileCount ||
          existing.total_duration_ms !== manifest.totalDurationMs || existing.manifest_status !== manifest.status ||
          JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error("MEDIA_REVISION_MANIFEST_CONFLICT");
      }
      revisionId = existing.id;
    } else {
      const inserted = db.prepare(`
        INSERT INTO audiobook_media_revisions
          (audiobook_id, media_revision, track_count, file_count, total_duration_ms, manifest_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(audiobookId, manifest.mediaRevision, manifest.trackCount, manifest.fileCount,
        manifest.totalDurationMs, manifest.status, createdAt);
      revisionId = Number(inserted.lastInsertRowid);
      const insertItem = db.prepare(`
        INSERT INTO audiobook_media_revision_items
          (revision_id, item_order, stable_identity, duration_ms, private_file_path, path_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const item of manifest.items) {
        insertItem.run(revisionId, item.order, item.stableIdentity, item.durationMs,
          item.privateFilePath, item.pathHash);
      }
    }

    db.prepare(`
      UPDATE audiobook_books
      SET current_media_revision = ?, media_revision_updated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(manifest.mediaRevision, createdAt, createdAt, audiobookId);
    const insertedOutbox = db.prepare(`
      INSERT OR IGNORE INTO audiobook_discovery_outbox
        (audiobook_id, media_revision, trigger_reason, created_at, manifest_status, safe_outcome_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(audiobookId, manifest.mediaRevision, triggerReason, createdAt, manifest.status,
      manifest.status === "unavailable" ? "MANIFEST_UNAVAILABLE" : null);
    db.prepare(`
      UPDATE audiobook_discovery_outbox
      SET manifest_status = ?, safe_outcome_code = ?
      WHERE audiobook_id = ? AND media_revision = ?
    `).run(manifest.status, manifest.status === "unavailable" ? "MANIFEST_UNAVAILABLE" : null,
      audiobookId, manifest.mediaRevision);
    db.exec("COMMIT");
    return Number(insertedOutbox.changes) > 0;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function reconcileLegacyDiscoveryOutbox(db: Db, now: string): void {
  const rows = db.prepare(`
    SELECT outbox.id, outbox.audiobook_id, outbox.media_revision, book.current_media_revision
    FROM audiobook_discovery_outbox outbox
    JOIN audiobook_books book ON book.id = outbox.audiobook_id
    LEFT JOIN audiobook_media_revisions revision
      ON revision.audiobook_id = outbox.audiobook_id AND revision.media_revision = outbox.media_revision
    WHERE outbox.consumed_at IS NULL AND revision.id IS NULL
  `).all() as Array<any>;
  for (const row of rows) {
    if (row.current_media_revision !== row.media_revision) {
      db.prepare(`UPDATE audiobook_discovery_outbox
        SET manifest_status = 'superseded', safe_outcome_code = 'SUPERSEDED_REVISION', consumed_at = ?
        WHERE id = ?`).run(now, row.id);
      continue;
    }
    const latestScan = db.prepare(`
      SELECT MAX(last_seen_scan_id) AS scan_id FROM content_catalog WHERE audiobook_id = ?
    `).get(row.audiobook_id) as { scan_id: number | null };
    const catalogRows = db.prepare(`
      SELECT rating_key, guid, media_type, title, duration, library_id, library_title,
             source_provenance, refreshed_at, file_path, audiobook_id
      FROM content_catalog
      WHERE audiobook_id = ? AND (? IS NULL OR last_seen_scan_id = ?)
      ORDER BY rating_key
    `).all(row.audiobook_id, latestScan.scan_id, latestScan.scan_id) as any[];
    const manifest = calculateMediaRevisionManifest(catalogRows.map((item) => ({
      ...item,
      ratingKey: item.rating_key,
      mediaType: item.media_type,
      libraryId: item.library_id,
      libraryTitle: item.library_title,
      sourceProvenance: item.source_provenance,
      refreshedAt: item.refreshed_at,
      filePath: item.file_path,
      audiobookId: item.audiobook_id,
      genres: [], grandparentRatingKey: null, grandparentGuid: null, grandparentTitle: null,
      parentRatingKey: null, parentGuid: null, parentTitle: null, leafCount: null
    })));
    if (manifest && manifest.mediaRevision === row.media_revision) {
      persistManifestAndOutbox(db, row.audiobook_id, manifest, "reconcile", now);
    } else {
      db.prepare(`UPDATE audiobook_discovery_outbox
        SET manifest_status = 'unavailable', safe_outcome_code = 'MANIFEST_UNAVAILABLE', consumed_at = ?
        WHERE id = ?`).run(now, row.id);
    }
  }
}
