export type ReadinessStatus = "healthy" | "disabled" | "unconfigured" | "unverified";

export interface ReadinessSubsystem {
  status: ReadinessStatus;
  configured: boolean;
  message: string;
}

export interface HealthResponse {
  ok: boolean;
  service: "plex-cowatch-service";
  uptimeSeconds: number;
  readiness: {
    database: ReadinessSubsystem;
    plex: ReadinessSubsystem;
    tautulli: ReadinessSubsystem;
    discord: ReadinessSubsystem;
    watcher: ReadinessSubsystem;
    plexMutation: ReadinessSubsystem;
  };
  watcher: ReadinessSubsystem & {
    enabled: boolean;
    lastPollAt?: string;
    lastDetectedWatchAt?: string;
  };
  discord: ReadinessSubsystem & {
    connected: boolean;
    lastInteractionAt?: string;
  };
  database: ReadinessSubsystem & {
    ok: boolean;
  };
  plex: ReadinessSubsystem;
  tautulli: ReadinessSubsystem;
  plexMutation: ReadinessSubsystem;
  pendingPrompts: number;
  failedSyncs: number;
}
