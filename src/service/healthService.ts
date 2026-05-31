import type { Db } from "../db/database.js";
import type { HealthResponse, ReadinessSubsystem } from "../types/api.js";
import { appConfig, getUsersConfigSummary } from "../utils/config.js";

const startedAt = Date.now();

export class HealthService {
  constructor(private readonly db: Db) {}

  getHealth(): HealthResponse {
    const pendingPrompts = this.db.prepare("SELECT COUNT(*) AS count FROM watch_events WHERE prompt_status = 'pending'").get() as { count: number };
    const failedSyncs = this.db.prepare("SELECT COUNT(*) AS count FROM sync_failures WHERE resolved_at IS NULL").get() as { count: number };
    const userConfig = getUsersConfigSummary();
    const database = ready("healthy", true, "SQLite is reachable and migrations are applied.");
    const plex = plexReadiness();
    const tautulli = tautulliReadiness();
    const discord = discordReadiness();
    const watcher = watcherReadiness(userConfig.sourceUserCount);
    const plexMutation = plexMutationReadiness();
    const readiness = {
      database,
      plex,
      tautulli,
      discord,
      watcher,
      plexMutation
    };

    return {
      ok: true,
      service: "plex-cowatch-service",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      readiness,
      watcher: { ...watcher, enabled: watcher.configured && watcher.status !== "disabled" },
      discord: { ...discord, connected: false },
      database: { ...database, ok: true },
      plex,
      tautulli,
      plexMutation,
      pendingPrompts: pendingPrompts.count,
      failedSyncs: failedSyncs.count
    };
  }
}

function ready(status: ReadinessSubsystem["status"], configured: boolean, message: string): ReadinessSubsystem {
  return { status, configured, message };
}

function hasConfiguredSecret(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== "replace_me";
}

function plexReadiness(): ReadinessSubsystem {
  if (!hasConfiguredSecret(appConfig.PLEX_TOKEN)) {
    return ready("unconfigured", false, "Plex token is not configured.");
  }

  return ready("unverified", true, "Plex is configured; live connectivity is not checked by health.");
}

function tautulliReadiness(): ReadinessSubsystem {
  if (!hasConfiguredSecret(appConfig.TAUTULLI_API_KEY)) {
    return ready("unconfigured", false, "Tautulli API key is not configured.");
  }

  return ready("unverified", true, "Tautulli is configured; live polling is implemented in a later block.");
}

function discordReadiness(): ReadinessSubsystem {
  if (!appConfig.DISCORD_ENABLED) {
    return ready("disabled", false, "Discord prompts are disabled.");
  }

  if (!hasConfiguredSecret(appConfig.DISCORD_BOT_TOKEN) || !hasConfiguredSecret(appConfig.DISCORD_CHANNEL_ID)) {
    return ready("unconfigured", false, "Discord is enabled but token or channel ID is missing.");
  }

  return ready("unverified", true, "Discord is configured; live prompt sending is implemented in a later block.");
}

function watcherReadiness(sourceUserCount: number): ReadinessSubsystem {
  if (sourceUserCount === 0) {
    return ready("unconfigured", false, "No enabled source users are configured in config/users.json.");
  }

  return ready("disabled", true, "Watch detection is configured but real Tautulli polling is implemented in a later block.");
}

function plexMutationReadiness(): ReadinessSubsystem {
  if (appConfig.PLEX_MUTATION_MODE === "mock") {
    return ready("disabled", true, "Plex watched-state mutation is in mock mode.");
  }

  if (!hasConfiguredSecret(appConfig.PLEX_TOKEN)) {
    return ready("unconfigured", false, "Live Plex mutation requires a configured Plex token.");
  }

  return ready("unverified", true, "Live Plex watched-state mutation is enabled but intentionally unverified.");
}
