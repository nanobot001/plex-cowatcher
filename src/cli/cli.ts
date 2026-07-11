#!/usr/bin/env node
import fs from "node:fs";
import { openMigratedDatabase } from "../db/database.js";
import { createPlexAdapter } from "../adapters/plexAdapter.js";
import { createTautulliAdapter } from "../adapters/tautulliAdapter.js";
import { DiscordBot } from "../discord/bot.js";
import { AuditService } from "../service/auditService.js";
import { CowatchService } from "../service/cowatchService.js";
import { HealthService } from "../service/healthService.js";
import { HistoryCopyService } from "../service/historyCopyService.js";
import { SyncService } from "../service/syncService.js";
import { UserService } from "../service/userService.js";
import { appConfig } from "../utils/config.js";
import { parseDays } from "../utils/time.js";

const db = openMigratedDatabase();
const command = process.argv[2] ?? "help";
const args = process.argv.slice(3);

function arg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, args.includes("--pretty") ? 2 : 0));
}

async function main(): Promise<void> {
  const users = new UserService(db);
  if (command !== "audiobook-backfill") {
    users.syncConfiguredUsers();
  }
  const plex = createPlexAdapter();
  const tautulli = createTautulliAdapter();
  const sync = new SyncService(plex);
  const cowatch = new CowatchService(db, sync);
  const historyCopy = new HistoryCopyService(db, tautulli, sync, plex);

  switch (command) {
    case "health":
      print(new HealthService(db).getHealth());
      break;
    case "ingest":
      {
        const { IngestionService } = await import("../service/ingestionService.js");
        const { MetadataService } = await import("../service/metadataService.js");
        const ingestion = new IngestionService(db, tautulli, new MetadataService(db, plex));
        const result = await ingestion.pollRecentHistory(arg("length") ? Number(arg("length")) : 100);
        print({ ok: true, ...result });
      }
      break;
    case "refresh-catalog":
      {
        const { MetadataService } = await import("../service/metadataService.js");
        const metadataService = new MetadataService(db, plex);
        const ratingKey = arg("rating-key") || arg("show");
        if (!ratingKey) {
          print({ ok: false, message: "Provide --rating-key or --show" });
          break;
        }
        const result = await metadataService.refreshMetadata(ratingKey);
        const { filePath: _privatePath, ...publicMetadata } = result ?? {};
        print({ ok: true, metadata: publicMetadata });
      }
      break;
    case "watch-history":
      {
        const { QueryService } = await import("../service/queryService.js");
        const queryService = new QueryService(db);
        try {
          const results = queryService.queryHistory({
            user: arg("user"),
            ratingKey: arg("rating-key"),
            showRatingKey: arg("show"),
            mediaType: arg("media-type"),
            genre: arg("genre"),
            localDay: arg("local-day"),
            dateFrom: arg("date-from"),
            dateTo: arg("date-to"),
            timezone: arg("timezone"),
            completed: arg("completed"),
            limit: arg("limit"),
            offset: arg("offset")
          });
          print({ ok: true, history: results });
        } catch (error) {
          print({ ok: false, message: error instanceof Error ? error.message : String(error) });
        }
      }
      break;
    case "watch-summary":
      {
        const { SummaryService } = await import("../service/summaryService.js");
        const summaryService = new SummaryService(db, plex);
        try {
          const result = summaryService.getWatchSummary({
            user: arg("user"),
            showRatingKey: arg("show"),
            localDay: arg("local-day"),
            dateFrom: arg("date-from"),
            dateTo: arg("date-to"),
            timezone: arg("timezone"),
            days: arg("days")
          });
          print({ ok: true, ...result });
        } catch (error) {
          print({ ok: false, message: error instanceof Error ? error.message : String(error) });
        }
      }
      break;
    case "viewing-sessions":
      {
        const { SessionService } = await import("../service/sessionService.js");
        const sessionService = new SessionService(db);
        try {
          const results = sessionService.getViewingSessions({
            user: arg("user"),
            dateFrom: arg("date-from"),
            dateTo: arg("date-to"),
            timezone: arg("timezone"),
            days: arg("days"),
            inactivityGapHours: arg("inactivity-gap")
          });
          print({ ok: true, sessions: results });
        } catch (error) {
          print({ ok: false, message: error instanceof Error ? error.message : String(error) });
        }
      }
      break;
    case "cowatching":
      {
        const { CowatchingIntelligenceService } = await import("../service/cowatchingIntelligenceService.js");
        const service = new CowatchingIntelligenceService(db);
        try {
          const results = service.getCowatchingEvents({
            days: arg("days"),
            dateFrom: arg("date-from"),
            dateTo: arg("date-to"),
            timezone: arg("timezone"),
            maxStartGapMinutes: arg("max-start-gap")
          });
          print({ ok: true, events: results });
        } catch (error) {
          print({ ok: false, message: error instanceof Error ? error.message : String(error) });
        }
      }
      break;
    case "audiobook-backfill":
      {
        const { AudiobookBackfillService } = await import("../service/audiobookBackfillService.js");
        const mode = arg("mode") ?? "all";
        if (!(["local", "enrich", "all", "hierarchy"] as string[]).includes(mode)) {
          print({ ok: false, tool: "project.audiobook_backfill", timestamp: new Date().toISOString(), error: { code: "INVALID_MODE", message: "Use --mode local, enrich, hierarchy, or all.", retryable: false, severity: "error" } });
          break;
        }
        try {
          const data = await new AudiobookBackfillService(db, plex).run({
            mode: mode as "local" | "enrich" | "all" | "hierarchy",
            apply: args.includes("--apply"),
            confirm: args.includes("--confirm"),
            resume: args.includes("--resume"),
            batchSize: arg("batch-size") ? Number(arg("batch-size")) : undefined
          });
          print({ ok: data.ok, tool: "project.audiobook_backfill", timestamp: new Date().toISOString(), data });
        } catch (error) {
          print({ ok: false, tool: "project.audiobook_backfill", timestamp: new Date().toISOString(), error: { code: error instanceof Error ? error.message : "AUDIOBOOK_BACKFILL_FAILED", message: "Audiobook backfill could not run.", retryable: false, severity: "error" } });
          process.exitCode = 1;
        }
      }
      break;
    case "backfill":
      {
        const { IngestionService } = await import("../service/ingestionService.js");
        const ingestion = new IngestionService(db, tautulli);
        let targetId: number | undefined;
        const username = arg("user");
        if (username) {
          const userRecord = users.findByUsername(username);
          if (!userRecord) {
            print({ ok: false, message: `User ${username} not found or not enabled` });
            break;
          }
          targetId = userRecord.id;
        }
        const result = await ingestion.backfillHistory(targetId, arg("page-size") ? Number(arg("page-size")) : 200);
        print({ ok: true, ...result });
      }
      break;
    case "sync-users":
      {
        try {
          const [plexUsers, tautulliUsers] = await Promise.all([
            plex.listUsers().catch(() => []),
            tautulli.getUsers().catch(() => [])
          ]);
          users.syncConfiguredUsers(undefined, plexUsers, tautulliUsers);
          print({ ok: true, message: "Users successfully synchronized with Plex and Tautulli" });
        } catch (error) {
          print({ ok: false, message: error instanceof Error ? error.message : String(error) });
        }
      }
      break;
    case "users":
      print({ ok: true, users: users.listConfigured() });
      break;
    case "recent":
      print({ ok: true, watches: db.prepare("SELECT * FROM watch_events ORDER BY watched_at DESC LIMIT ?").all(parseDays(arg("days"), 7) * 20) });
      break;
    case "pending":
      print({ ok: true, prompts: db.prepare("SELECT * FROM watch_events WHERE prompt_status = 'pending' ORDER BY watched_at DESC").all() });
      break;
    case "preview-copy":
      print(await historyCopy.previewCopy({
        sourceUser: arg("source") ?? "",
        targetUsers: [arg("target") ?? ""].filter(Boolean),
        filters: {
          showTitle: arg("show"),
          seasonNumber: arg("season") ? Number(arg("season")) : undefined,
          libraryName: arg("library"),
          mediaType: arg("media-type"),
          dateFrom: arg("date-from"),
          dateTo: arg("date-to"),
          skipAlreadyWatched: true
        },
        dryRun: true,
        actor: "cli"
      }));
      break;
    case "apply-copy":
      print(await historyCopy.applyCopy(Number(arg("job")), true, undefined, "cli"));
      break;
    case "audit":
      print({ ok: true, audit: new AuditService(db).list(parseDays(arg("days"), 7)) });
      break;
    case "retry-failed":
      new AuditService(db).record("retry_failed_syncs", "cli", "not_implemented", {});
      print({ ok: true, data: { retried: 0, note: "Retry queue scaffolded; live retry implementation waits for Plex verification." } });
      break;
    case "verify-plex-watched-state":
      {
        const targetPlexUserId = arg("target-plex-user-id") ?? "";
        const ratingKey = arg("rating-key") ?? "";
        if (!targetPlexUserId || !ratingKey) {
          print({
            ok: false,
            errorCode: "VERIFY_PLEX_INPUT_REQUIRED",
            message: "Provide --target-plex-user-id and --rating-key for Plex watched-state verification."
          });
          break;
        }

        const result = {
          mutationMode: appConfig.PLEX_MUTATION_MODE,
          targetPlexUserId,
          ratingKey,
          users: null as unknown,
          metadata: null as unknown,
          watchedState: null as unknown,
          markWatched: args.includes("--mark-watched") ? null as unknown : { ok: true, status: "not_requested" }
        };

        try {
          result.users = await plex.listUsers();
          result.metadata = await plex.getMetadataByRatingKey(ratingKey);
          result.watchedState = await plex.getWatchedState(targetPlexUserId, ratingKey);
          if (args.includes("--mark-watched")) {
            result.markWatched = await plex.markWatched(targetPlexUserId, ratingKey);
          }
          print({ ok: true, data: result });
        } catch (error) {
          print({
            ok: false,
            errorCode: "VERIFY_PLEX_WATCHED_STATE_FAILED",
            message: error instanceof Error ? error.message : String(error),
            data: result
          });
        }
      }
      break;
    case "test-discord-prompt":
      if (!appConfig.DISCORD_ENABLED || !appConfig.DISCORD_BOT_TOKEN || !appConfig.DISCORD_CHANNEL_ID) {
        print({ ok: false, errorCode: "DISCORD_UNCONFIGURED", message: "Set DISCORD_ENABLED=true, DISCORD_BOT_TOKEN, and DISCORD_CHANNEL_ID before sending a test prompt." });
        break;
      }
      {
        const requestedWatchEventId = arg("watch-event-id") ? Number(arg("watch-event-id")) : undefined;
        const candidate = requestedWatchEventId
          ? cowatch.listPendingPromptCandidates(100).find((item) => item.watchEventId === requestedWatchEventId)
          : cowatch.listPendingPromptCandidates(1)[0];
        if (!candidate) {
          print({ ok: false, errorCode: "NO_PENDING_DISCORD_PROMPT", message: "No pending watch event was found for a Discord test prompt." });
          break;
        }

        const bot = new DiscordBot(cowatch);
        await bot.start();
        const result = await bot.sendPromptCandidate(candidate);
        await bot.stop();
        print({ ok: true, data: result });
      }
      break;
    case "scan-audiobooks":
      {
        const libraryName = arg("library") ?? "Audiobooks";
        const { AudiobookScannerService } = await import("../service/audiobookScannerService.js");
        const scanner = new AudiobookScannerService(db, plex);
        try {
          const result = await scanner.scanLibrary(libraryName);
          print(result);
        } catch (error) {
          print({
            ok: false,
            errorCode: "SCAN_AUDIOBOOKS_FAILED",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
      break;
    case "import-audiobook-chapters":
      {
        const filePath = args[0];
        if (!filePath) {
          print({
            ok: false,
            tool: "project.audiobook_import_chapters",
            timestamp: new Date().toISOString(),
            error: {
              code: "MISSING_FILE_PATH",
              message: "Provide a JSON file path as the first argument.",
              retryable: false,
              severity: "error"
            }
          });
          break;
        }

        try {
          if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
          }
          const content = fs.readFileSync(filePath, "utf8");
          const json = JSON.parse(content);

          const { AudiobookCatalogService } = await import("../service/audiobookService.js");
          const catalogService = new AudiobookCatalogService(db);
          const apply = args.includes("--apply");
          const result = catalogService.importChapters(json, { apply });
          print({
            ok: true,
            tool: "project.audiobook_import_chapters",
            timestamp: new Date().toISOString(),
            data: result
          });
        } catch (error) {
          print({
            ok: false,
            tool: "project.audiobook_import_chapters",
            timestamp: new Date().toISOString(),
            error: {
              code: "IMPORT_AUDIOBOOK_CHAPTERS_FAILED",
              message: error instanceof Error ? error.message : String(error),
              retryable: false,
              severity: "error"
            }
          });
        }
      }
      break;
    default:
      print({ ok: true, commands: ["health", "users", "recent", "pending", "preview-copy", "apply-copy", "audiobook-backfill", "scan-audiobooks", "import-audiobook-chapters", "audit", "retry-failed", "verify-plex-watched-state", "test-discord-prompt"] });
  }
}

main()
  .catch((error) => {
    print({ ok: false, errorCode: "CLI_ERROR", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(() => db.close());
