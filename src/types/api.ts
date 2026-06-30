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

export type DashboardLayout = "overview" | "timeline" | "explorer" | "people" | "progress";
export type DashboardCategory = "movie" | "tv" | "classic_tv" | "anime" | "audiobook";

export interface DashboardFilters {
  dateFrom?: string;
  dateTo?: string;
  user?: string;
  category?: DashboardCategory;
  library?: string;
  completed?: boolean;
  search?: string;
}

export interface DashboardUserSetting {
  id: number;
  plexUsername: string;
  alias: string | null;
  shown: boolean;
}

export interface DashboardActivityItem {
  id: number; userId: number; username: string; displayName: string; ratingKey: string;
  title: string; showTitle?: string; mediaType: string; category: DashboardCategory;
  categoryLabel: string; categoryDerived: boolean; libraryName?: string; watchedAt: string;
  duration?: number; percentComplete?: number; completed: boolean; artworkUrl: string;
  grandparentRatingKey?: string; parentRatingKey?: string; audiobookId?: number; audiobookTitle?: string;
  seasonNumber?: number; episodeNumber?: number;
  displayTitle?: string;
  evidence: Record<string, unknown>;
}

export interface DashboardTimelineSession {
  id: string;
  userId: number;
  displayName: string;
  date: string;
  startTime: string;
  endTime: string;
  itemCount: number;
  category?: DashboardCategory;
}
