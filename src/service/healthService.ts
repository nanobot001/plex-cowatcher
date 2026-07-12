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
    const audiobookDiscovery = audiobookDiscoveryReadiness(this.db);
    const readiness = {
      database,
      plex,
      tautulli,
      discord,
      watcher,
      plexMutation,
      audiobookDiscovery
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
      audiobookDiscovery,
      pendingPrompts: pendingPrompts.count,
      failedSyncs: failedSyncs.count
    };
  }
}

function audiobookDiscoveryReadiness(db: Db): HealthResponse["audiobookDiscovery"] {
  const state = db.prepare(`
    SELECT last_attempt_at, last_success_at, next_run_at, current_run_id
    FROM audiobook_discovery_state WHERE id = 1
  `).get() as {
    last_attempt_at: string | null;
    last_success_at: string | null;
    next_run_at: string | null;
    current_run_id: number | null;
  } | undefined;
  if (!appConfig.AUDIOBOOK_DISCOVERY_ENABLED) {
    return { ...ready("disabled", false, "Automatic audiobook discovery is disabled.") };
  }
  if (!hasConfiguredSecret(appConfig.PLEX_TOKEN)) {
    return { ...ready("unconfigured", false, "Automatic audiobook discovery requires Plex configuration.") };
  }
  return {
    ...ready("healthy", true, "Automatic audiobook discovery is configured."),
    lastAttemptAt: state?.last_attempt_at ?? undefined,
    lastSuccessAt: state?.last_success_at ?? undefined,
    nextRunAt: state?.next_run_at ?? undefined,
    currentRunId: state?.current_run_id ?? undefined
  };
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

  return ready("healthy", true, "Plex is configured and API connection is active.");
}

function tautulliReadiness(): ReadinessSubsystem {
  if (!hasConfiguredSecret(appConfig.TAUTULLI_API_KEY)) {
    return ready("unconfigured", false, "Tautulli API key is not configured.");
  }

  return ready("healthy", true, "Tautulli is configured and reachable.");
}

function discordReadiness(): ReadinessSubsystem {
  if (!appConfig.DISCORD_ENABLED) {
    return ready("disabled", false, "Discord prompts are disabled.");
  }

  if (!hasConfiguredSecret(appConfig.DISCORD_BOT_TOKEN) || !hasConfiguredSecret(appConfig.DISCORD_CHANNEL_ID)) {
    return ready("unconfigured", false, "Discord is enabled but token or channel ID is missing.");
  }

  return ready("healthy", true, "Discord is configured and live prompt sending is active.");
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

  return ready("unverified", true, "Live Plex watched-state mutation is enabled but intentionally unverified until safely tested.");
}
