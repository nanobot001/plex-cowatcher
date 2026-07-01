import express from "express";
import path from "node:path";
import { createPlexAdapter, type PlexAdapter } from "../adapters/plexAdapter.js";
import { createTautulliAdapter } from "../adapters/tautulliAdapter.js";
import { openMigratedDatabase } from "../db/database.js";
import { DiscordBot } from "../discord/bot.js";
import { CowatchService } from "../service/cowatchService.js";
import { SyncService } from "../service/syncService.js";
import { appConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import { WatcherService } from "../watcher/watcher.js";
import { registerWebRoutes } from "../web/index.js";
import { buildRouter, type RouterOptions } from "./routes.js";

export type CreateAppOptions = RouterOptions;

export function createApp(
  db = openMigratedDatabase(),
  plex: PlexAdapter = createPlexAdapter(),
  options: CreateAppOptions = {}
) {
  const app = express();
  app.locals.db = db;
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/static", express.static(path.resolve("src/web/static")));
  registerWebRoutes(app);
  app.use(buildRouter(db, plex, options));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log("error", { action: "http_error", message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, errorCode: "HTTP_ERROR", message: error instanceof Error ? error.message : "HTTP error" });
  });
  return app;
}

console.log("process.argv in app.ts:", process.argv);
const isMain = process.argv[1]?.endsWith("app.js") || process.argv[1]?.endsWith("app.ts") || process.env.pm_id !== undefined;
if (isMain) {
  const app = createApp();
  app.listen(appConfig.APP_PORT, appConfig.APP_HOST, () => {
    log("info", {
      action: "server_start",
      message: `Plex Co-Watch Sync listening at http://${appConfig.APP_HOST}:${appConfig.APP_PORT}`
    });
  });
  void startWatcherRuntime(app.locals.db);
  void startDiscordRuntime(app.locals.db);
}

async function startDiscordRuntime(db: ReturnType<typeof openMigratedDatabase>): Promise<void> {
  if (!appConfig.DISCORD_ENABLED) return;

  const sync = new SyncService(createPlexAdapter());
  const cowatch = new CowatchService(db, sync);
  const bot = new DiscordBot(cowatch);

  try {
    await bot.start();
    const sendPending = async () => {
      const result = await bot.sendPendingPrompts();
      if (result.sent > 0 || result.failed > 0) {
        log("info", { action: "discord_send_pending_prompts", message: "Processed pending Discord prompts", ...result });
      }
    };
    await sendPending();
    setInterval(() => void sendPending(), Math.max(10, appConfig.PROMPT_DELAY_SECONDS) * 1000);
  } catch (error) {
    log("error", {
      action: "discord_start",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function startWatcherRuntime(db: ReturnType<typeof openMigratedDatabase>): Promise<void> {
  if (!appConfig.TAUTULLI_API_KEY) return;
  
  const { IngestionService } = await import("../service/ingestionService.js");
  const { MetadataService } = await import("../service/metadataService.js");
  const { createPlexAdapter } = await import("../adapters/plexAdapter.js");
  
  const plex = createPlexAdapter();
  const tautulli = createTautulliAdapter();
  const metadata = new MetadataService(db, plex);
  const ingestion = new IngestionService(db, tautulli, metadata);
  
  const poll = async () => {
    try {
      const { inserted } = await ingestion.pollRecentHistory();
      if (inserted > 0) {
        log("info", { action: "watcher_poll", message: `Ingested ${inserted} new playback observations from Tautulli` });
      }
    } catch (error) {
      log("error", { action: "watcher_poll_error", message: error instanceof Error ? error.message : String(error) });
    }
  };
  
  await poll();
  setInterval(() => void poll(), Math.max(10, appConfig.POLL_INTERVAL_SECONDS) * 1000);
}
