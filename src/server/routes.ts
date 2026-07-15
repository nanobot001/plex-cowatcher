import express, { type Router } from "express";
import type { Db } from "../db/database.js";
import { createPlexAdapter, type PlexAdapter } from "../adapters/plexAdapter.js";
import { createTautulliAdapter } from "../adapters/tautulliAdapter.js";
import { AuditService } from "../service/auditService.js";
import { CowatchService } from "../service/cowatchService.js";
import { HealthService } from "../service/healthService.js";
import { HistoryCopyService } from "../service/historyCopyService.js";
import { SyncService } from "../service/syncService.js";
import { UserService } from "../service/userService.js";
import { QueryService } from "../service/queryService.js";
import { SummaryService } from "../service/summaryService.js";
import { SessionService } from "../service/sessionService.js";
import { CowatchingIntelligenceService } from "../service/cowatchingIntelligenceService.js";
import { DashboardService } from "../service/dashboardService.js";
import { DashboardPreferenceService } from "../service/dashboardPreferenceService.js";
import { CowatchAdjudicationService, type CowatchDecision } from "../service/cowatchAdjudicationService.js";
import { AudiobookDiscoveryService } from "../service/audiobookDiscoveryService.js";
import { ArtworkResolver, type ArtworkVariant } from "../service/artworkService.js";
import { appConfig } from "../utils/config.js";
import { parseDays } from "../utils/time.js";

export type RouterOptions = {
  skipStartupUserSync?: boolean;
  discordReviewAvailable?: boolean;
};

export function buildRouter(
  db: Db,
  plex: PlexAdapter = createPlexAdapter(),
  options: RouterOptions = {}
): Router {
  const router = express.Router();
  const tautulli = createTautulliAdapter();
  const sync = new SyncService(plex);
  const audit = new AuditService(db);
  const health = new HealthService(db);
  const users = new UserService(db);
  const cowatch = new CowatchService(db, sync);
  const historyCopy = new HistoryCopyService(db, tautulli, sync, plex);
  const queryService = new QueryService(db);
  const summaryService = new SummaryService(db, plex);
  const sessionService = new SessionService(db);
  const cowatchingIntelligenceService = new CowatchingIntelligenceService(db);
  const dashboardPreferences = new DashboardPreferenceService(db);
  const dashboardService = new DashboardService(db);
  const cowatchAdjudications = new CowatchAdjudicationService(db);
  const audiobookDiscovery = new AudiobookDiscoveryService(db, plex);
  const handleDashboardReadError = (error: unknown, res: express.Response, next: express.NextFunction) => {
    if (error instanceof Error && error.message.startsWith("Validation Error:")) {
      res.status(400).json({ ok: false, errorCode: "VALIDATION_ERROR", message: error.message });
      return;
    }
    next(error);
  };
  const sendDetailWorkspaceResult = (result: { ok: boolean; errorCode?: string }, res: express.Response) => {
    if (result.ok) return res.json(result);
    const status = result.errorCode === "DETAIL_NOT_FOUND" ? 404 : result.errorCode === "DETAIL_AMBIGUOUS" ? 409 : 400;
    return res.status(status).json({ ok: false, errorCode: result.errorCode, message: "Detail workspace could not be resolved." });
  };
  const artworkResolver = new ArtworkResolver(db, plex);
  const discordReviewAvailable = options.discordReviewAvailable ?? appConfig.DISCORD_ENABLED;

  if (!options.skipStartupUserSync) {
    users.syncConfiguredUsers();
    (async () => {
      try {
        const [plexUsers, tautulliUsers] = await Promise.all([
          plex.listUsers().catch(() => []),
          tautulli.getUsers().catch(() => [])
        ]);
        users.syncConfiguredUsers(undefined, plexUsers, tautulliUsers);
      } catch (error) {
        console.warn("Failed to sync users with Plex/Tautulli at startup:", error instanceof Error ? error.message : error);
      }
    })();
  }

  router.get("/api/health", (_req, res) => res.json(health.getHealth()));
  router.get("/api/status", (_req, res) => res.json(health.getHealth()));

  router.get("/api/settings", (_req, res) => {
    try {
      const rows = db.prepare("SELECT key, value FROM app_settings").all() as { key: string, value: string }[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      res.json({ ok: true, settings });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.put("/api/settings", express.json(), (req, res) => {
    try {
      const updates = req.body;
      const stmt = db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)");
      const now = new Date().toISOString();
      try {
        db.exec('BEGIN IMMEDIATE');
        for (const [key, value] of Object.entries(updates)) {
          if (typeof value === 'string') {
            stmt.run(key, value, now);
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.get("/api/settings/users", (_req, res) => {
    try {
      const rows = dashboardPreferences.listUsers();
      res.json({ ok: true, users: rows });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.get("/api/dashboard/users", (_req, res) => {
    try {
      const rows = dashboardPreferences.listVisibleUsers();
      res.json({ ok: true, users: rows });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.post("/api/settings/users", express.json(), (req, res) => {
    try {
      const { users: updatedUsers } = req.body;
      if (!Array.isArray(updatedUsers)) {
        return res.status(400).json({ ok: false, message: "Invalid users payload." });
      }
      dashboardPreferences.saveUsers(
        updatedUsers.map((u: { id: number; alias?: string | null; shown?: boolean }) => ({
          id: Number(u.id),
          alias: typeof u.alias === "string" && u.alias.trim() ? u.alias.trim() : null,
          shown: u.shown === true
        }))
      );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  router.get("/api/dashboard/overview", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getOverview(req.query) }); }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/timeline", (req, res, next) => {
    try {
      res.json({ ok: true, data: dashboardService.getTimeline(req.query) });
    }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/media", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getMedia(req.query) }); }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/people", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getPeople(req.query) }); }
    catch (e) { handleDashboardReadError(e, res, next); }
  });
  router.get("/api/dashboard/progress", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getProgress(req.query) }); }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/progress/expand/:groupKey", (req, res, next) => {
    try {
      const result = dashboardService.getProgressExpansion(decodeURIComponent(req.params.groupKey));
      res.json({ ok: true, data: result });
    }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/continue-watching", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getContinueWatching(req.query) }); }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/continue-consuming", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getContinueConsuming(req.query) }); }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/cowatch-patterns", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getCowatchPatterns() }); }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/cowatch-pairings", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getCowatchPairings(req.query) }); }
    catch (e) { handleDashboardReadError(e, res, next); }
  });
  router.get("/api/dashboard/operations", (_req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getOperations() }); }
    catch (e) { next(e); }
  });
  router.get("/api/dashboard/cowatch-reviews", (req, res, next) => {
    try { res.json({ ok: true, data: { ...dashboardService.getCowatchReviews(req.query), discordAvailable: discordReviewAvailable } }); }
    catch (e) { handleDashboardReadError(e, res, next); }
  });
  router.post("/api/dashboard/cowatch-reviews/:candidateId/ask-discord", express.json(), (req, res, next) => {
    try {
      if (!discordReviewAvailable) return res.status(409).json({ ok: false, errorCode: "DISCORD_REVIEW_UNAVAILABLE", message: "Discord review is not configured" });
      const result = cowatchAdjudications.requestDiscordReview({
        candidateId: req.params.candidateId,
        actorKind: "web",
        requestId: String(req.body.requestId ?? ""),
        apply: req.body.apply === true,
        confirm: req.body.confirm === true
      });
      const status = result.ok ? 200 : result.errorCode === "COWATCH_CANDIDATE_NOT_FOUND" ? 404 : result.errorCode === "COWATCH_CANDIDATE_HIDDEN" ? 409 : 400;
      res.status(status).json(result);
    } catch (e) { next(e); }
  });
  router.post("/api/dashboard/cowatch-reviews/:candidateId/decision", express.json(), async (req, res, next) => {
    try {
      const decision = req.body.decision as CowatchDecision;
      if (!["yes", "no", "not_sure", "clear"].includes(decision)) {
        return res.status(400).json({ ok: false, errorCode: "DECISION_INVALID", message: "Decision must be yes, no, not_sure, or clear" });
      }
      const result = await cowatchAdjudications.decide({
        candidateId: req.params.candidateId,
        decision,
        actorKind: "web",
        method: "browser",
        requestId: String(req.body.requestId ?? ""),
        apply: req.body.apply === true,
        confirm: req.body.confirm === true
      });
      const status = result.ok ? 200 : result.errorCode === "COWATCH_CANDIDATE_NOT_FOUND" ? 404 : 400;
      res.status(status).json(result);
    } catch (e) { next(e); }
  });
  router.get("/api/dashboard/detail-workspace/:detailKey/hierarchy", (req, res, next) => {
    try {
      const selector = decodeURIComponent(req.params.detailKey);
      return sendDetailWorkspaceResult(dashboardService.getDetailWorkspaceHierarchy(selector), res);
    } catch (e) { next(e); }
  });
  router.get("/api/dashboard/detail-workspace/:detailKey", (req, res, next) => {
    try {
      const selector = decodeURIComponent(req.params.detailKey);
      return sendDetailWorkspaceResult(dashboardService.getDetailWorkspace(selector), res);
    } catch (e) { next(e); }
  });
  router.get("/api/dashboard/detail/:ratingKey", (req, res, next) => {
    try { res.json({ ok: true, data: dashboardService.getDetail(req.params.ratingKey) }); }
    catch (e) { next(e); }
  });
  router.get("/api/artwork/:key", async (req, res, next) => {
    try {
      const variant = req.query.variant === "backdrop" ? "backdrop" : "poster";
      const requestedRevision = typeof req.query.v === "string" && /^[a-f0-9]{12,64}$/i.test(req.query.v)
        ? req.query.v
        : null;
      await serveArtwork(req.params.key, res, variant, requestedRevision);
    } catch (error) {
      next(error);
    }
  });
  router.get("/api/dashboard/prompts", (_req, res) => {
    const rows = db.prepare("SELECT * FROM watch_events WHERE prompt_status IN ('pending','prompted','failed') ORDER BY watched_at DESC LIMIT 50").all();
    res.json(rows);
  });
  router.post("/api/dashboard/prompts/:id/:action", express.json(), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const action = req.params.action;
      if (action === "dismiss") {
        const result = cowatch.dismissPrompt(id, req.body.confirm === true, "web");
        res.status(result.ok ? 200 : result.errorCode === "WATCH_EVENT_NOT_FOUND" ? 404 : result.errorCode === "PROMPT_NOT_DISMISSIBLE" ? 409 : 400).json(result);
      } else if (action === "reprompt") {
        const result = cowatch.reprompt(id, req.body.confirm === true, "web");
        res.status(result.ok ? 200 : result.errorCode === "WATCH_EVENT_NOT_FOUND" ? 404 : result.errorCode === "PROMPT_NOT_REPROMPTABLE" ? 409 : 400).json(result);
      } else {
        res.status(400).json({ ok: false, message: "Invalid action" });
      }
    } catch (e) { next(e); }
  });
  router.get("/api/dashboard/export.csv", (req, res, next) => {
    try {
      const { items } = dashboardService.getActivity({ ...req.query, limit: 10000 });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="history.csv"');
      res.write("watched_at,person,category,library,title,progress,duration_minutes,status\n");
      for (const item of items) {
        res.write([
          item.watchedAt,
          item.displayName,
          item.categoryLabel,
          item.libraryName ?? "",
          item.title,
          item.percentComplete ?? "",
          Math.round((item.duration ?? 0) / 60000),
          item.completed ? "completed" : "in_progress"
        ].map(s => `"${String(s).replace(/"/g, '""')}"`).join(",") + "\n");
      }
      res.end();
    } catch (e) { next(e); }
  });

  router.get("/api/users", (_req, res) => res.json({ ok: true, users: users.listConfigured() }));
  router.get("/api/users/plex", async (_req, res, next) => {
    try {
      res.json({ ok: true, users: await plex.listUsers() });
    } catch (error) {
      next(error);
    }
  });
  router.get("/api/libraries", async (_req, res, next) => {
    try {
      res.json({ ok: true, libraries: await plex.listLibraries() });
    } catch (error) {
      next(error);
    }
  });
  router.get("/api/shows", async (req, res, next) => {
    try {
      const libraryKey = String(req.query.libraryKey || "");
      if (!libraryKey) {
        return res.status(400).json({ ok: false, message: "Missing libraryKey query parameter." });
      }
      res.json({ ok: true, shows: await plex.listShows(libraryKey) });
    } catch (error) {
      next(error);
    }
  });
  router.post("/api/users/refresh", async (_req, res, next) => {
    try {
      let plexUsers: any[] = [];
      try {
        plexUsers = await plex.listUsers();
      } catch (err) {
        console.warn("Failed to fetch Plex users during refresh:", err);
      }
      users.syncConfiguredUsers(undefined, plexUsers);
      audit.record("refresh_user_cache", "api", "ok", {});
      res.json({ ok: true, users: users.listConfigured() });
    } catch (error) {
      next(error);
    }
  });
  router.get("/api/watches/recent", (req, res) => {
    const days = parseDays(req.query.days, 7);
    const rows = db.prepare("SELECT * FROM watch_events WHERE watched_at >= datetime('now', ?) ORDER BY watched_at DESC LIMIT 100").all(`-${days} days`);
    res.json({ ok: true, watches: rows });
  });
  router.get("/api/prompts/pending", (_req, res) => {
    const rows = db.prepare("SELECT * FROM watch_events WHERE prompt_status = 'pending' ORDER BY watched_at DESC").all();
    res.json({ ok: true, prompts: rows });
  });
  router.post("/api/prompts/create", (req, res) => res.json(cowatch.createPrompt(Number(req.body.watchEventId), "api")));
  router.post("/api/prompts/resolve", async (req, res) => {
    res.json(await cowatch.resolvePrompt({
      watchEventId: Number(req.body.watchEventId),
      selectedTargetUserIds: (req.body.selectedTargetUserIds ?? []).map(Number),
      actor: "api",
      method: "browser"
    }));
  });
  router.post("/api/history-copy/preview", async (req, res) => {
    const targetUsers = Array.isArray(req.body.targetUsers) ? req.body.targetUsers : String(req.body.targetUsers ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    res.json(await historyCopy.previewCopy({ ...req.body, targetUsers, actor: "api", dryRun: true }));
  });
  router.post("/api/history-copy/apply", async (req, res) => {
    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds.map(Number) : undefined;
    res.json(await historyCopy.applyCopy(Number(req.body.jobId), req.body.confirm === true || req.body.confirm === "true", itemIds, "api"));
  });
  router.get("/api/history-copy/jobs/:id", (req, res) => {
    const job = db.prepare("SELECT * FROM copy_jobs WHERE id = ?").get(Number(req.params.id));
    const items = db.prepare("SELECT * FROM copy_job_items WHERE copy_job_id = ?").all(Number(req.params.id));
    res.json({ ok: Boolean(job), job, items });
  });
  router.get("/api/audit", (req, res) => res.json({ ok: true, audit: audit.list(parseDays(req.query.days, 7)) }));
  router.get("/api/errors/recent", (_req, res) => res.json({ ok: true, errors: db.prepare("SELECT * FROM sync_failures WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100").all() }));
  router.post("/api/sync/retry-failed", (_req, res) => {
    audit.record("retry_failed_syncs", "api", "not_implemented", { reason: "Adapter-backed retry queue scaffolded for MVP" });
    res.json({ ok: true, data: { retried: 0, note: "Retry queue scaffolded; live retry implementation waits for Plex verification." } });
  });

  router.get("/api/watch-history", (req, res, next) => {
    try {
      const results = queryService.queryHistory(req.query);
      res.json({ ok: true, history: results });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Validation Error:")) {
        res.status(400).json({ ok: false, errorCode: "VALIDATION_ERROR", message: error.message });
      } else {
        next(error);
      }
    }
  });

  router.get("/api/watch-summary", (req, res, next) => {
    try {
      const result = summaryService.getWatchSummary(req.query);
      res.json({ ok: true, ...result });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Validation Error:")) {
        res.status(400).json({ ok: false, errorCode: "VALIDATION_ERROR", message: error.message });
      } else {
        next(error);
      }
    }
  });

  router.get("/api/viewing-sessions", (req, res, next) => {
    try {
      const results = sessionService.getViewingSessions(req.query);
      res.json({ ok: true, sessions: results });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Validation Error:")) {
        res.status(400).json({ ok: false, errorCode: "VALIDATION_ERROR", message: error.message });
      } else {
        next(error);
      }
    }
  });

  router.get("/api/cowatching", (req, res, next) => {
    try {
      const results = cowatchingIntelligenceService.getCowatchingEvents(req.query);
      res.json({ ok: true, events: results });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Validation Error:")) {
        res.status(400).json({ ok: false, errorCode: "VALIDATION_ERROR", message: error.message });
      } else {
        next(error);
      }
    }
  });

  router.post("/webhooks/plex", (req, res) => {
    const contentType = req.headers["content-type"] ?? "";
    
    if (contentType.includes("multipart/form-data")) {
      let rawBody = "";
      req.on("data", (chunk) => {
        rawBody += chunk.toString();
      });
      req.on("end", async () => {
        try {
          let payload: any;
          const match = rawBody.match(/Content-Disposition:\s*form-data;\s*name="payload"[\r\n]+[\r\n]+([\s\S]*?)[\r\n]+---+/i);
          if (match && match[1]) {
            payload = JSON.parse(match[1].trim());
          } else {
            payload = JSON.parse(rawBody);
          }
          await processWebhookPayload(payload);
          if (!res.headersSent) {
            res.status(202).json({ ok: true, message: "Webhook accepted for background processing" });
          }
        } catch (err) {
          console.error("[Webhook] Failed to parse Plex webhook multipart payload:", err);
          if (!res.headersSent) {
            res.status(400).json({ ok: false, errorCode: "WEBHOOK_PARSE_FAILED", message: "Failed to parse webhook" });
          }
        }
      });
    } else {
      try {
        const payload = typeof req.body.payload === "string" ? JSON.parse(req.body.payload) : req.body;
        void processWebhookPayload(payload).catch((err) => {
          console.error("[Webhook] Background webhook processing failed:", err);
        });
        res.status(202).json({ ok: true, message: "Webhook accepted for background processing" });
      } catch (err) {
        res.status(400).json({ ok: false, errorCode: "WEBHOOK_PARSE_FAILED", message: "Failed to parse webhook" });
      }
    }

    async function processWebhookPayload(payload: any) {
      if (!payload) return;
      const event = payload.event;
      const metadata = payload.Metadata;
      if (!metadata) return;

      const libraryTitle = metadata.librarySectionTitle ?? "";
      const isAudiobook = libraryTitle.toLowerCase().includes("audiobook") ||
                          metadata.type === "track" && (metadata.guid?.includes("audnexus") || metadata.guid?.includes("audiobook"));

      if (!isAudiobook) return;

      if (event === "library.new" || event === "media.play") {
        const ratingKey = metadata.ratingKey;
        if (!ratingKey) return;

        await audiobookDiscovery.run("webhook-item", {
          library: libraryTitle || appConfig.AUDIOBOOK_LIBRARY,
          ratingKey,
          plexGuid: metadata.guid
        });
      }
    }
  });

  async function serveArtwork(
    rawKey: string,
    res: express.Response,
    variant: ArtworkVariant = "poster",
    requestedRevision: string | null = null
  ): Promise<void> {
    const decodedKey = decodeURIComponent(rawKey);
    if (!decodedKey || decodedKey.length > 512 || decodedKey.includes("\0")) {
      res.status(400).end();
      return;
    }

    let resolution = await artworkResolver.resolve(decodedKey, variant);
    if (!resolution) {
      res.status(404).end();
      return;
    }

    if (requestedRevision !== resolution.revision) {
      redirectToArtworkRevision(decodedKey, variant, resolution.revision, res);
      return;
    }

    let fetched = await fetchArtworkSource(resolution.source, variant);
    if (!fetched.ok && resolution.outcome === "local_cover") {
      resolution = await artworkResolver.resolve(decodedKey, variant, { skipLocalCover: true });
      if (resolution && requestedRevision !== resolution.revision) {
        redirectToArtworkRevision(decodedKey, variant, resolution.revision, res);
        return;
      }
      if (resolution) fetched = await fetchArtworkSource(resolution.source, variant);
    }

    if (!fetched.ok) {
      res.status(fetched.status).end();
      return;
    }

    res.setHeader("Content-Type", fetched.contentType);
    res.setHeader("Cache-Control", "private, max-age=604800, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(fetched.body);
  }

  function normalizeArtworkSource(source: string, variant: ArtworkVariant = "poster"): string {
    if (/^data:/i.test(source) || /^https?:\/\//i.test(source)) {
      return source;
    }
    const transcodeUrl = new URL("/photo/:/transcode", appConfig.PLEX_BASE_URL);
    transcodeUrl.searchParams.set("width", variant === "backdrop" ? "1440" : "300");
    transcodeUrl.searchParams.set("height", variant === "backdrop" ? "630" : "450");
    transcodeUrl.searchParams.set("minSize", "1");
    transcodeUrl.searchParams.set("upscale", "1");
    transcodeUrl.searchParams.set("url", source);
    if (appConfig.PLEX_TOKEN) {
      transcodeUrl.searchParams.set("X-Plex-Token", appConfig.PLEX_TOKEN);
    }
    return transcodeUrl.toString();
  }

  function redirectToArtworkRevision(
    artworkKey: string,
    variant: ArtworkVariant,
    revision: string,
    res: express.Response
  ): void {
    const location = `/api/artwork/${encodeURIComponent(artworkKey)}?variant=${variant}&v=${revision}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", location);
    res.status(307).end();
  }

  async function fetchArtworkSource(
    sourceUrl: string,
    variant: ArtworkVariant = "poster"
  ): Promise<{ ok: true; contentType: string; body: Buffer } | { ok: false; status: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      let currentUrl = normalizeArtworkSource(sourceUrl, variant);
      for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
        if (!isSafeArtworkFetchUrl(currentUrl)) return { ok: false, status: 404 };
        const response = await fetch(currentUrl, { signal: controller.signal, redirect: "manual" });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location || redirectCount === 3) return { ok: false, status: 502 };
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
        if (!response.ok) return { ok: false, status: response.status === 404 ? 404 : 502 };
        const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
        if (!contentType.startsWith("image/")) return { ok: false, status: 502 };
        const declaredLength = Number(response.headers.get("content-length") ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > 10 * 1024 * 1024) return { ok: false, status: 502 };
        const body = await readBoundedBody(response, 10 * 1024 * 1024);
        if (!body) return { ok: false, status: 502 };
        return { ok: true, contentType, body };
      }
      return { ok: false, status: 502 };
    } catch {
      return { ok: false, status: 502 };
    } finally {
      clearTimeout(timeout);
    }
  }

  function isSafeArtworkFetchUrl(sourceUrl: string): boolean {
    if (/^data:image\//i.test(sourceUrl)) return sourceUrl.length <= 14 * 1024 * 1024;
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      return false;
    }
    const plexOrigin = new URL(appConfig.PLEX_BASE_URL).origin;
    if (parsed.origin === plexOrigin) return parsed.protocol === "http:" || parsed.protocol === "https:";
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^(?:127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return false;
    return true;
  }

  async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer | null> {
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  }

  return router;
}
