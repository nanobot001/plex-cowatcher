#!/usr/bin/env node
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
  users.syncConfiguredUsers();
  const plex = createPlexAdapter();
  const tautulli = createTautulliAdapter();
  const sync = new SyncService(plex);
  const cowatch = new CowatchService(db, sync);
  const historyCopy = new HistoryCopyService(db, tautulli, sync, plex);

  switch (command) {
    case "health":
      print(new HealthService(db).getHealth());
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
      print(await historyCopy.applyCopy(Number(arg("job")), true, "cli"));
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
    default:
      print({ ok: true, commands: ["health", "users", "recent", "pending", "preview-copy", "apply-copy", "audit", "retry-failed", "verify-plex-watched-state", "test-discord-prompt"] });
  }
}

main()
  .catch((error) => {
    print({ ok: false, errorCode: "CLI_ERROR", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(() => db.close());
