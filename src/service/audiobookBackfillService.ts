import fs from "node:fs";
import path from "node:path";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import { PlexAdapterError } from "../adapters/plexAdapter.js";
import type { Db } from "../db/database.js";
import { appConfig } from "../utils/config.js";
import { nowIso } from "../utils/time.js";
import { AuditService } from "./auditService.js";
import { AudiobookCatalogService, prepareAudiobookMetadata, normalizeAudiobookHierarchy, PROVENANCE_PRECEDENCE } from "./audiobookService.js";
import { MetadataService } from "./metadataService.js";

export type AudiobookBackfillMode = "local" | "enrich" | "all" | "hierarchy";

export interface AudiobookBackfillOptions {
  mode?: AudiobookBackfillMode;
  apply?: boolean;
  confirm?: boolean;
  resume?: boolean;
  batchSize?: number;
  createBackup?: boolean;
}

export interface AudiobookBackfillResult {
  ok: boolean;
  dryRun: boolean;
  mode: AudiobookBackfillMode;
  scanned: number;
  matched: number;
  linked: number;
  enriched: number;
  pending: number;
  errors: Array<{ entity: "track" | "book"; id: string; code: string }>;
  deadReferences: Array<{ entity: "track"; id: string; reason: string }>;
  provenance: Record<string, number>;
  backupCreated: boolean;
  resumable: boolean;
  hierarchyDetails?: Array<{
    id: number;
    title: string;
    parentSeriesTitle?: string;
    subseriesTitle?: string;
    relatedWorkClassification?: string;
    status: "proposed" | "unchanged" | "skipped" | "conflicted";
    reason: string;
  }>;
}

export class AudiobookBackfillService {
  private readonly audit: AuditService;
  private readonly catalog: AudiobookCatalogService;
  private readonly metadata: MetadataService;

  constructor(
    private readonly db: Db,
    private readonly plex: PlexAdapter,
    private readonly sqlitePath = appConfig.SQLITE_PATH,
    fetcher: typeof fetch = fetch
  ) {
    this.audit = new AuditService(db);
    this.catalog = new AudiobookCatalogService(db, fetcher);
    this.metadata = new MetadataService(db, plex);
  }

  async run(options: AudiobookBackfillOptions = {}): Promise<AudiobookBackfillResult> {
    const mode = options.mode ?? "all";
    const apply = options.apply === true;
    if (apply && options.confirm !== true) {
      throw new Error("AUDIOBOOK_BACKFILL_CONFIRM_REQUIRED");
    }
    const batchSize = Math.max(1, Math.min(500, Math.trunc(options.batchSize ?? 100)));
    const result: AudiobookBackfillResult = {
      ok: true,
      dryRun: !apply,
      mode,
      scanned: 0,
      matched: 0,
      linked: 0,
      enriched: 0,
      pending: 0,
      errors: [],
      deadReferences: [],
      provenance: {},
      backupCreated: false,
      resumable: true
    };

    if (apply && options.createBackup !== false) {
      this.createBackup();
      result.backupCreated = true;
    }
    if (apply) this.audit.record("audiobook_backfill_started", "cli", "started", { mode, batchSize, resume: options.resume === true });

    if (mode === "local" || mode === "all") {
      await this.runLocal(result, batchSize, apply, options.resume === true);
    }
    if (mode === "enrich" || mode === "all") {
      await this.runEnrichment(result, batchSize, apply, options.resume === true);
    }
    if (mode === "hierarchy" || mode === "all") {
      await this.runHierarchy(result, batchSize, apply, options.resume === true);
    }

    result.ok = result.errors.length === 0;
    if (apply) {
      this.audit.record("audiobook_backfill_completed", "cli", result.ok ? "ok" : "partial", {
        mode,
        scanned: result.scanned,
        matched: result.matched,
        linked: result.linked,
        enriched: result.enriched,
        pending: result.pending,
        errors: result.errors.length,
        deadReferences: result.deadReferences.length
      });
    }
    return result;
  }

  private async runLocal(result: AudiobookBackfillResult, batchSize: number, apply: boolean, resume: boolean): Promise<void> {
    const cursor = resume ? this.getCursor("local") : "";
    const rows = this.db.prepare(`
      SELECT rating_key, MAX(plex_guid) AS plex_guid
      FROM playback_observations
      WHERE rating_key > ?
        AND (
          media_type = 'audiobook'
          OR (
            media_type = 'track'
            AND (
              lower(COALESCE(plex_guid, '')) LIKE '%audnexus%'
              OR lower(COALESCE(plex_guid, '')) LIKE '%audiobook%'
              OR lower(COALESCE(library_name, '')) LIKE '%audiobook%'
              OR CASE
                WHEN COALESCE(duration, 0) > 100000 THEN COALESCE(duration, 0) / 1000
                ELSE COALESCE(duration, 0)
              END > 900
            )
          )
        )
      GROUP BY rating_key
      ORDER BY rating_key
      LIMIT ?
    `).all(cursor, batchSize) as Array<{ rating_key: string; plex_guid: string | null }>;

    for (const row of rows) {
      result.scanned++;
      try {
        const plexMetadata = await this.plex.getRichMetadataByRatingKey(row.rating_key, row.plex_guid ?? undefined);
        const prepared = prepareAudiobookMetadata(plexMetadata);
        if (!prepared.identity && !prepared.asin) {
          result.pending++;
          if (apply) this.setCursor("local", row.rating_key);
          continue;
        }
        result.matched++;
        result.provenance.folder_path = (result.provenance.folder_path ?? 0) + 1;
        if (apply) {
          const entry = await this.metadata.refreshMetadata(row.rating_key, row.plex_guid ?? undefined);
          if (entry?.audiobookId) result.linked++;
          this.setCursor("local", row.rating_key);
        }
      } catch (error) {
        const isMissingMedia = error instanceof PlexAdapterError && error.status === "no_matching_media";
        if (isMissingMedia) {
          result.pending++;
          result.deadReferences.push({ entity: "track", id: row.rating_key, reason: "no_matching_media" });
          if (apply) this.setCursor("local", row.rating_key);
          continue;
        }
        result.errors.push({ entity: "track", id: row.rating_key, code: "PLEX_METADATA_REFRESH_FAILED" });
        if (apply) break;
      }
    }
  }

  private async runEnrichment(result: AudiobookBackfillResult, batchSize: number, apply: boolean, resume: boolean): Promise<void> {
    const cursor = resume ? Number(this.getCursor("enrich") || 0) : 0;
    const rows = this.db.prepare(`
      SELECT id FROM audiobook_books
      WHERE enrichment_status != 'enriched' AND id > ?
      ORDER BY id
      LIMIT ?
    `).all(cursor, batchSize) as Array<{ id: number }>;

    for (const row of rows) {
      result.scanned++;
      const outcome = await this.catalog.enrichBook(row.id, apply);
      if (outcome.status === "enriched") {
        result.enriched++;
        if (outcome.provenance) result.provenance[outcome.provenance] = (result.provenance[outcome.provenance] ?? 0) + 1;
      } else {
        result.pending++;
      }
      if (apply) this.setCursor("enrich", String(row.id));
    }
  }

  private async runHierarchy(result: AudiobookBackfillResult, batchSize: number, apply: boolean, resume: boolean): Promise<void> {
    const cursor = resume ? Number(this.getCursor("hierarchy") || 0) : 0;
    const rows = this.db.prepare(`
      SELECT * FROM audiobook_books
      WHERE id > ?
      ORDER BY id
      LIMIT ?
    `).all(cursor, batchSize) as any[];

    if (!result.hierarchyDetails) {
      result.hierarchyDetails = [];
    }

    for (const row of rows) {
      result.scanned++;
      let authors: string[] = [];
      try {
        authors = JSON.parse(row.authors_json);
      } catch {}
      const hierarchy = normalizeAudiobookHierarchy(row.title, authors[0] ?? "", row.series_title);

      const oldProv = row.hierarchy_provenance ?? "none";
      const newProv = hierarchy.hierarchyProvenance;

      const oldPrec = PROVENANCE_PRECEDENCE[oldProv as keyof typeof PROVENANCE_PRECEDENCE] ?? 0;
      const newPrec = PROVENANCE_PRECEDENCE[newProv as keyof typeof PROVENANCE_PRECEDENCE] ?? 0;

      let shouldUpdate = false;
      let conflict = false;

      if (newPrec > oldPrec) {
        shouldUpdate = true;
      } else if (newPrec === oldPrec && newPrec > 0) {
        const sameParent = row.parent_series_title === (hierarchy.parentSeriesTitle ?? null);
        const sameSub = row.subseries_title === (hierarchy.subseriesTitle ?? null);
        const sameClass = row.related_work_classification === (hierarchy.relatedWorkClassification ?? null);
        if (!sameParent || !sameSub || !sameClass) {
          conflict = true;
        }
      }

      if (conflict) {
        result.hierarchyDetails.push({
          id: row.id,
          title: row.title,
          parentSeriesTitle: hierarchy.parentSeriesTitle,
          subseriesTitle: hierarchy.subseriesTitle,
          relatedWorkClassification: hierarchy.relatedWorkClassification,
          status: "conflicted",
          reason: `conflict_equal_authority: ${oldProv} vs ${newProv}`
        });
        result.errors.push({
          entity: "book",
          id: String(row.id),
          code: "HIERARCHY_CONFLICT"
        });
      } else if (shouldUpdate) {
        result.matched++;
        result.hierarchyDetails.push({
          id: row.id,
          title: row.title,
          parentSeriesTitle: hierarchy.parentSeriesTitle,
          subseriesTitle: hierarchy.subseriesTitle,
          relatedWorkClassification: hierarchy.relatedWorkClassification,
          status: "proposed",
          reason: `update: ${oldProv} -> ${newProv}`
        });
        if (apply) {
          const now = nowIso();
          this.db.prepare(`
            UPDATE audiobook_books SET
              parent_series_title = ?,
              subseries_title = ?,
              related_work_classification = ?,
              hierarchy_provenance = ?,
              updated_at = ?
            WHERE id = ?
          `).run(
            hierarchy.parentSeriesTitle ?? null,
            hierarchy.subseriesTitle ?? null,
            hierarchy.relatedWorkClassification ?? null,
            hierarchy.hierarchyProvenance,
            now,
            row.id
          );
        }
      } else {
        if (hierarchy.hierarchyProvenance === "none") {
          result.hierarchyDetails.push({
            id: row.id,
            title: row.title,
            status: "skipped",
            reason: "no_hierarchy_resolved"
          });
        } else {
          result.linked++;
          result.hierarchyDetails.push({
            id: row.id,
            title: row.title,
            parentSeriesTitle: row.parent_series_title,
            subseriesTitle: row.subseries_title,
            relatedWorkClassification: row.related_work_classification,
            status: "unchanged",
            reason: "already_correct"
          });
        }
      }

      if (apply) {
        this.setCursor("hierarchy", String(row.id));
      }
    }
  }

  private getCursor(kind: "local" | "enrich" | "hierarchy"): string {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(`audiobook_backfill_cursor_${kind}`) as { value: string } | undefined;
    return row?.value ?? "";
  }

  private setCursor(kind: "local" | "enrich" | "hierarchy", value: string): void {
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(`audiobook_backfill_cursor_${kind}`, value, nowIso());
  }

  private createBackup(): void {
    const source = path.resolve(this.sqlitePath);
    if (!fs.existsSync(source)) throw new Error("AUDIOBOOK_BACKFILL_DATABASE_NOT_FOUND");
    const backupDir = path.join(path.dirname(source), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const destination = path.join(backupDir, `pre-audiobook-backfill-${timestamp}.sqlite`);
    const escaped = destination.replace(/'/g, "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
    if (!fs.existsSync(destination) || fs.statSync(destination).size === 0) {
      throw new Error("AUDIOBOOK_BACKFILL_BACKUP_FAILED");
    }
  }
}