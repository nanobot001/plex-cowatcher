import express from "express";
import path from "node:path";
import { openMigratedDatabase } from "../db/database.js";
import { appConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";
import { registerWebRoutes } from "../web/index.js";
import { buildRouter } from "./routes.js";

export function createApp() {
  const db = openMigratedDatabase();
  const app = express();
  app.locals.db = db;
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/static", express.static(path.resolve("src/web/static")));
  registerWebRoutes(app);
  app.use(buildRouter(db));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log("error", { action: "http_error", message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, errorCode: "HTTP_ERROR", message: error instanceof Error ? error.message : "HTTP error" });
  });
  return app;
}

if (process.argv[1]?.endsWith("app.js") || process.argv[1]?.endsWith("app.ts")) {
  const app = createApp();
  app.listen(appConfig.APP_PORT, appConfig.APP_HOST, () => {
    log("info", {
      action: "server_start",
      message: `Plex Co-Watch Sync listening at http://${appConfig.APP_HOST}:${appConfig.APP_PORT}`
    });
  });
}
