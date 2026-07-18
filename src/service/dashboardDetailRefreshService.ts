import type { Db } from "../db/database.js";
import type { PlexAdapter } from "../adapters/plexAdapter.js";
import type { DashboardDetailIdentity, DashboardDetailWorkspaceResponse } from "../types/api.js";
import { AuditService } from "./auditService.js";
import { DashboardService } from "./dashboardService.js";
import { MetadataService } from "./metadataService.js";

type RefreshTarget = {
  ratingKey: string;
  plexGuid: string | null;
};

export type DashboardDetailRefreshResult =
  | { ok: true; data: { dryRun: true; detailKey: string; category: DashboardDetailIdentity["category"] } }
  | {
      ok: true;
      data: {
        dryRun: false;
        detailKey: string;
        category: DashboardDetailIdentity["category"];
        status: "refreshed" | "unchanged";
        metadataChanged: boolean;
        artworkChanged: boolean;
        artworkRevision: string;
        workspace: DashboardDetailWorkspaceResponse;
      };
    }
  | { ok: false; errorCode: string; retryable?: boolean; priorAvailable?: boolean };

export class DashboardDetailRefreshService {
  private readonly metadata: MetadataService;

  constructor(
    private readonly db: Db,
    private readonly dashboard: DashboardService,
    plex: PlexAdapter,
    private readonly audit: AuditService
  ) {
    this.metadata = new MetadataService(db, plex);
  }

  async refresh(
    selector: string,
    options: { apply: boolean; confirm: boolean; actor?: string }
  ): Promise<DashboardDetailRefreshResult> {
    const resolution = this.dashboard.resolveDetailIdentity(selector);
    if (!resolution.ok) return resolution;

    const identity = resolution.identity;
    const target = this.resolveTarget(identity);
    if (!target) return { ok: false, errorCode: "DETAIL_NOT_FOUND" };

    if (!options.apply) {
      return {
        ok: true,
        data: { dryRun: true, detailKey: identity.detailKey, category: identity.category }
      };
    }
    if (!options.confirm) {
      return { ok: false, errorCode: "CONFIRMATION_REQUIRED", retryable: false };
    }

    const before = this.dashboard.getDetailWorkspace(identity.detailKey);
    if (!before.ok) return before;

    const refreshed = await this.metadata.refreshMetadataExplicit(target.ratingKey, target.plexGuid ?? undefined);
    if (!refreshed.ok) {
      this.audit.record(
        "dashboard_detail_refresh",
        options.actor ?? "web",
        "failed",
        { detailKey: identity.detailKey, category: identity.category, priorAvailable: refreshed.priorAvailable },
        refreshed.errorCode
      );
      return {
        ok: false,
        errorCode: "DETAIL_REFRESH_FAILED",
        retryable: refreshed.retryable,
        priorAvailable: refreshed.priorAvailable
      };
    }

    const workspace = this.dashboard.getDetailWorkspace(identity.detailKey);
    if (!workspace.ok) {
      this.audit.record(
        "dashboard_detail_refresh",
        options.actor ?? "web",
        "failed",
        { detailKey: identity.detailKey, category: identity.category, reason: "workspace_unavailable_after_refresh" },
        "DETAIL_NOT_FOUND"
      );
      return { ok: false, errorCode: "DETAIL_NOT_FOUND" };
    }

    const artworkChanged = before.data.artworkRevision !== workspace.data.artworkRevision;
    const status = refreshed.changed ? "refreshed" : "unchanged";
    this.audit.record(
      "dashboard_detail_refresh",
      options.actor ?? "web",
      "ok",
      {
        detailKey: identity.detailKey,
        category: identity.category,
        status,
        metadataChanged: refreshed.changed,
        artworkChanged
      }
    );
    return {
      ok: true,
      data: {
        dryRun: false,
        detailKey: identity.detailKey,
        category: identity.category,
        status,
        metadataChanged: refreshed.changed,
        artworkChanged,
        artworkRevision: workspace.data.artworkRevision,
        workspace: workspace.data
      }
    };
  }

  private resolveTarget(identity: DashboardDetailIdentity): RefreshTarget | null {
    if (identity.kind === "movie") {
      const catalog = this.db.prepare(`
        SELECT rating_key, guid
        FROM content_catalog
        WHERE rating_key = ?
        LIMIT 1
      `).get(identity.ratingKey) as { rating_key: string; guid: string | null } | undefined;
      const observation = this.db.prepare(`
        SELECT plex_guid
        FROM playback_observations
        WHERE rating_key = ? AND plex_guid IS NOT NULL AND trim(plex_guid) <> ''
        ORDER BY watched_at DESC, id DESC
        LIMIT 1
      `).get(identity.ratingKey) as { plex_guid: string } | undefined;
      return {
        ratingKey: identity.ratingKey,
        plexGuid: catalog?.guid ?? observation?.plex_guid ?? null
      };
    }

    if (identity.kind === "series") {
      const rows = this.db.prepare(`
        SELECT rating_key, guid, grandparent_guid
        FROM content_catalog
        WHERE rating_key = ? OR grandparent_rating_key = ?
        ORDER BY CASE WHEN rating_key = ? THEN 0 ELSE 1 END, refreshed_at DESC, rating_key DESC
      `).all(identity.grandparentRatingKey, identity.grandparentRatingKey, identity.grandparentRatingKey) as Array<{
        rating_key: string;
        guid: string | null;
        grandparent_guid: string | null;
      }>;
      const observation = this.db.prepare(`
        SELECT plex_guid
        FROM playback_observations
        WHERE grandparent_rating_key = ? AND plex_guid IS NOT NULL AND trim(plex_guid) <> ''
        ORDER BY watched_at DESC, id DESC
        LIMIT 1
      `).get(identity.grandparentRatingKey) as { plex_guid: string } | undefined;
      const row = rows[0];
      return {
        ratingKey: identity.grandparentRatingKey,
        plexGuid: row?.guid ?? row?.grandparent_guid ?? observation?.plex_guid ?? null
      };
    }

    const row = this.db.prepare(`
      SELECT COALESCE(parent_rating_key, rating_key) AS rating_key,
             COALESCE(parent_guid, guid) AS guid
      FROM content_catalog
      WHERE audiobook_id = ?
      ORDER BY CASE WHEN parent_rating_key IS NOT NULL THEN 0 ELSE 1 END,
               refreshed_at DESC, rating_key DESC
      LIMIT 1
    `).get(identity.audiobookId) as { rating_key: string; guid: string | null } | undefined;
    if (!row?.rating_key) return null;
    return { ratingKey: row.rating_key, plexGuid: row.guid ?? null };
  }
}
