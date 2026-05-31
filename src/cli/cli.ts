#!/usr/bin/env node
import { openMigratedDatabase } from "../db/database.js";
import { createPlexAdapter } from "../adapters/plexAdapter.js";
import { createTautulliAdapter } from "../adapters/tautulliAdapter.js";
import { AuditService } from "../service/auditService.js";
import { HealthService } from "../service/healthService.js";
import { HistoryCopyService } from "../service/historyCopyService.js";
import { SyncService } from "../service/syncService.js";
import { UserService } from "../service/userService.js";
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
  const historyCopy = new HistoryCopyService(db, tautulli, sync);

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
    case "test-discord-prompt":
      print({ ok: false, errorCode: "DISCORD_TEST_PROMPT_NEEDS_RUNNING_BOT", message: "Use the server runtime with DISCORD_ENABLED=true after configuring .env." });
      break;
    default:
      print({ ok: true, commands: ["health", "users", "recent", "pending", "preview-copy", "apply-copy", "audit", "retry-failed"] });
  }
}

main()
  .catch((error) => {
    print({ ok: false, errorCode: "CLI_ERROR", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(() => db.close());
