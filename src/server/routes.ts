import express, { type Router } from "express";
import type { Db } from "../db/database.js";
import { createPlexAdapter } from "../adapters/plexAdapter.js";
import { createTautulliAdapter } from "../adapters/tautulliAdapter.js";
import { AuditService } from "../service/auditService.js";
import { CowatchService } from "../service/cowatchService.js";
import { HealthService } from "../service/healthService.js";
import { HistoryCopyService } from "../service/historyCopyService.js";
import { SyncService } from "../service/syncService.js";
import { UserService } from "../service/userService.js";
import { parseDays } from "../utils/time.js";

export function buildRouter(db: Db): Router {
  const router = express.Router();
  const plex = createPlexAdapter();
  const tautulli = createTautulliAdapter();
  const sync = new SyncService(plex);
  const audit = new AuditService(db);
  const health = new HealthService(db);
  const users = new UserService(db);
  const cowatch = new CowatchService(db, sync);
  const historyCopy = new HistoryCopyService(db, tautulli, sync, plex);

  users.syncConfiguredUsers();
  (async () => {
    try {
      const plexUsers = await plex.listUsers();
      users.syncConfiguredUsers(undefined, plexUsers);
    } catch (error) {
      console.warn("Failed to sync users with Plex at startup:", error instanceof Error ? error.message : error);
    }
  })();

  router.get("/api/health", (_req, res) => res.json(health.getHealth()));
  router.get("/api/status", (_req, res) => res.json(health.getHealth()));
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
    res.json(await historyCopy.applyCopy(Number(req.body.jobId), req.body.confirm === true || req.body.confirm === "true", "api"));
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

  return router;
}
