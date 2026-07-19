import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PlexLibraryMovieViewRecord } from "../types/index.js";
import { appConfig } from "../utils/config.js";

export class PlexLibraryDatabaseError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}
function stableIdFromGuid(value: unknown): string | undefined {
  const guid = String(value ?? "").trim();
  const imdb = guid.match(/(?:imdb|com\.plexapp\.agents\.imdb):\/\/(tt\d+)/i);
  if (imdb) return `imdb:${imdb[1].toLowerCase()}`;
  const tmdb = guid.match(/(?:tmdb|com\.plexapp\.agents\.themoviedb):\/\/(\d+)/i);
  if (tmdb) return `tmdb:${tmdb[1]}`;
  return undefined;
}

function isoFromEpoch(value: unknown): string | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function yearFromEpoch(value: unknown): number | undefined {
  const iso = isoFromEpoch(value);
  if (!iso) return undefined;
  return Number(iso.slice(0, 4));
}

export class PlexLibraryDatabaseAdapter {
  constructor(private readonly sqlitePath = appConfig.PLEX_LIBRARY_DB_PATH) {}

  readMovieViews(limit?: number): PlexLibraryMovieViewRecord[] {
    if (!this.sqlitePath) {
      throw new PlexLibraryDatabaseError("PLEX_LIBRARY_DB_PATH_MISSING", "Plex library database path is not configured.");
    }
    const absolutePath = path.resolve(this.sqlitePath);
    if (!fs.existsSync(absolutePath)) {
      throw new PlexLibraryDatabaseError("PLEX_LIBRARY_DB_NOT_FOUND", "Plex library database is unavailable.");
    }

    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(absolutePath, { readOnly: true });
      db.exec("PRAGMA busy_timeout = 5000");
      const hasMappings = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'media_metadata_mappings'").get());
      const mappingRows = hasMappings
        ? db.prepare("SELECT media_guid AS mediaGuid, metadata_guid AS metadataGuid FROM media_metadata_mappings WHERE media_guid IS NOT NULL OR metadata_guid IS NOT NULL").all() as Array<{ mediaGuid?: string; metadataGuid?: string }>
        : [];
      const stableByGuid = new Map<string, Set<string>>();
      const addStable = (guid: string | undefined, stable: string | undefined) => {
        if (!guid || !stable) return;
        const values = stableByGuid.get(guid) ?? new Set<string>();
        values.add(stable);
        stableByGuid.set(guid, values);
      };
      for (const row of mappingRows) {
        const stable = stableIdFromGuid(row.metadataGuid) ?? stableIdFromGuid(row.mediaGuid);
        addStable(row.mediaGuid, stable);
        addStable(row.metadataGuid, stable);
      }

      const rows = db.prepare(`
        SELECT v.id AS sourceRowId, v.account_id AS accountId, a.name AS accountName,
          v.guid, v.title, v.viewed_at AS viewedAt, v.originally_available_at AS originallyAvailableAt
        FROM metadata_item_views v
        LEFT JOIN accounts a ON a.id = v.account_id
        WHERE v.metadata_type = 1 AND v.viewed_at IS NOT NULL
        ORDER BY v.viewed_at ASC, v.id ASC
        ${limit && limit > 0 ? "LIMIT ?" : ""}
      `).all(...(limit && limit > 0 ? [Math.min(limit, 100_000)] : [])) as Array<{
        sourceRowId: number;
        accountId?: number;
        accountName?: string;
        guid?: string;
        title?: string;
        viewedAt: number;
        originallyAvailableAt?: number;
      }>;

      return rows.map((row) => {
        const stableIds = new Set<string>();
        const directStable = stableIdFromGuid(row.guid);
        if (directStable) stableIds.add(directStable);
        for (const stable of stableByGuid.get(row.guid ?? "") ?? []) stableIds.add(stable);
        return {
          sourceRowId: Number(row.sourceRowId),
          accountId: row.accountId == null ? undefined : Number(row.accountId),
          accountName: row.accountName ? String(row.accountName) : undefined,
          guid: row.guid ? String(row.guid) : undefined,
          title: String(row.title ?? row.guid ?? row.sourceRowId),
          year: yearFromEpoch(row.originallyAvailableAt),
          viewedAt: isoFromEpoch(row.viewedAt) ?? new Date(0).toISOString(),
          stableIds: [...stableIds].sort()
        };
      });
    } catch (error) {
      if (error instanceof PlexLibraryDatabaseError) throw error;
      throw new PlexLibraryDatabaseError("PLEX_LIBRARY_DB_READ_FAILED", "Plex library database could not be read.");
    } finally {
      db?.close();
    }
  }
}
