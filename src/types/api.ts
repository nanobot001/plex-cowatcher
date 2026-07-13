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
    audiobookDiscovery: ReadinessSubsystem;
    audiobookProof: ReadinessSubsystem;
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
  audiobookDiscovery: ReadinessSubsystem & {
    lastAttemptAt?: string;
    lastSuccessAt?: string;
    nextRunAt?: string;
    currentRunId?: number;
  };
  audiobookProof: ReadinessSubsystem & {
    pending: number;
    retryWait: number;
    failedTerminal: number;
    nextRunAt?: string;
    lastCompletedAt?: string;
    leaseActive: boolean;
  };
  pendingPrompts: number;
  failedSyncs: number;
}

export type DashboardLayout = "overview" | "timeline" | "explorer" | "people" | "progress";
export type DashboardCategory = "movie" | "tv" | "classic_tv" | "anime" | "audiobook";

export type ProgressUnit = "episode" | "movie" | "track" | "chapter" | "book" | "unknown";
export type ProgressSource = "plex" | "audiobook_tool" | "unknown";
export type ProgressNodeState = "watched" | "partial" | "repeated" | "unknown" | "source_uncertain";
export type ProgressNodeStateSource = "verified_offset" | "book_completion" | "track_file" | "source_uncertain" | "none";

export interface ProgressWatcherEvidence {
  displayName: string;
  state: ProgressNodeState;
  latestObservedAt: string | null;
  watchCount: number;
  stateSource?: ProgressNodeStateSource;
  partialPosition?: number;
}

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

export type DashboardPersonStatus = "active" | "disabled" | "no_activity";

export interface DashboardPersonSummary {
  id: number;
  plex_username: string;
  display_name: string;
  status: DashboardPersonStatus;
  enabled: number;
  is_source_user: number;
  plays: number;
  minutes: number;
  completed: number;
  inProgress: number;
  completionRate: number | null;
  activeDays: number;
  recent: DashboardActivityItem[];
  mix: Array<{ category: DashboardCategory; label: string; count: number }>;
  heatmap: Array<{ date: string; plays: number; minutes: number; observedMinutes: number; attributedMinutes: number; confirmedTogetherSessions: number }>;
  possibleDuplicates: string[];
  technicalAccount: { plexUsername: string };
}

export interface DashboardPeopleResponse {
  people: DashboardPersonSummary[];
  active: DashboardPersonSummary[];
  secondary: DashboardPersonSummary[];
  window: { start: string; end: string; label: string; defaulted: boolean };
  timingMs: number;
}

export interface DashboardCowatchPairing {
  id: string;
  people: Array<{ id: number; username: string; displayName: string }>;
  sessionCount: number;
  knownSharedMinutes: number;
  unknownDurationSessions: number;
  provenance: { confirmed: number; inferred: number; adjudicated: number };
  titles: Array<{ ratingKey: string; title: string; category: DashboardCategory; sessions: number; latestWatchedAt: string }>;
  latestWatchedAt: string;
}

export interface DashboardCowatchReviewCandidate {
  candidateId: string;
  ratingKey: string;
  title: string;
  showTitle: string | null;
  category: DashboardCategory;
  watchedAt: string;
  source: { userId: number; displayName: string };
  target: { userId: number; displayName: string };
  decision: "yes" | "no" | "not_sure" | "clear" | null;
  effectiveRelationship: "together" | "likely_together" | "suppressed";
  latestAdjudicationId: number | null;
  discordPromptStatus: "pending" | "sent" | "resolved" | "failed" | "cancelled" | null;
}

export interface DashboardOperationItem {
  kind: "unresolved_prompt" | "discord_delivery_failed" | "plex_sync_failed" | "cowatch_review_prompt";
  watchEventId?: number;
  title: string;
  detail: string;
  status: string;
  watchedAt?: string;
  ratingKey?: string;
  user?: string | null;
  route?: { layout: DashboardLayout; filters: Record<string, unknown> };
}

export interface DashboardActivityItem {
  id: number; userId: number; username: string; displayName: string; ratingKey: string;
  title: string; showTitle?: string; mediaType: string; category: DashboardCategory;
  categoryLabel: string; categoryDerived: boolean; libraryName?: string; watchedAt: string;
  sessionStartAt?: string; sessionEndAt?: string;
  duration?: number; viewOffset?: number; percentComplete?: number; completed: boolean; artworkUrl: string;
  grandparentRatingKey?: string; parentRatingKey?: string; audiobookId?: number; audiobookTitle?: string;
  parentTitle?: string; grandparentTitle?: string;
  seasonNumber?: number; episodeNumber?: number;
  displayTitle?: string;
  displayNames?: string[];
  confirmedUserIds?: number[];
  evidence: Record<string, unknown>;
}

export interface DashboardMediaItem extends DashboardActivityItem {
  groupKey: string;
  groupRatingKey: string;
  latestWatchedAt: string;
  plays: number;
  distinctItems: number;
  people: number[];
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
  isCompleted?: boolean;
  isPaused?: boolean;
  relationship?: string;
  cowatchEventId?: string | null;
  item?: DashboardActivityItem;
}

export interface DashboardProgressPersonContext {
  userId: number;
  plexUsername: string;
  displayName: string;
  plays: number;
  completedPlays: number;
  partials: number;
  distinctItems: number;
  distinctCompleted: number;
  latestWatchedAt: string;
}

export interface DashboardProgressGroup {
  groupKey: string;
  title: string;
  category: DashboardCategory;
  artworkUrl: string;
  latestWatchedAt: string;
  progressUnit?: ProgressUnit;
  progressUnitLabel?: string;
  progressSource?: ProgressSource;
  progressSourceVerified?: boolean;
  hasVerifiedChapters?: boolean;
  totalKnown: boolean;
  totalItems: number | null;
  distinctItems: number;
  distinctCompleted: number;
  plays: number;
  completedPlays: number;
  partials: number;
  observedMinutes: number;
  people: DashboardProgressPersonContext[];
  seasons: Record<number, number[]> | null;
  hierarchy: {
    parentSeries: string | null;
    subseries: string | null;
    series: string | null;
    book: string | null;
  } | null;
}

export interface DashboardProgressBucket {
  items: DashboardProgressGroup[];
  total: number;
  limit: number;
  offset: number;
}

export interface DashboardProgressResponse {
  recentlyActive: DashboardProgressBucket;
  continue: DashboardProgressBucket;
  recentlyCompleted: DashboardProgressBucket;
  timingMs: number;
  progress: any[];
  recentlyCompletedCompat: any[];
}

export interface ProgressEpisodeNode {
  ratingKey: string;
  title: string;
  episodeNumber: number | null;
  duration: number;
  watchedStates: Record<string, ProgressNodeState>;
  watcherEvidence: ProgressWatcherEvidence[];
}

export interface ProgressSeasonNode {
  seasonName: string;
  seasonNumber: number;
  episodes: ProgressEpisodeNode[];
}

export interface ProgressChapterNode {
  ratingKey: string;
  title: string;
  chapterIndex?: number;
  startOffsetMs?: number;
  endOffsetMs?: number;
  duration: number;
  watchedStates: Record<string, ProgressNodeState>;
  watcherEvidence: ProgressWatcherEvidence[];
  stateSources?: Record<string, ProgressNodeStateSource>;
  partialPositions?: Record<string, number>;
  sourceType?: ProgressSource;
  sourceStatus?: string;
  sourceConfidence?: number;
  sourceRefreshedAt?: string;
  nodeKind?: "chapter" | "track";
}

export interface ProgressHierarchyExpansion {
  groupKey: string;
  category: DashboardCategory;
  title: string;
  artworkUrl: string;
  progressUnit?: ProgressUnit;
  progressUnitLabel?: string;
  progressSource?: ProgressSource;
  progressSourceVerified?: boolean;
  hasVerifiedChapters?: boolean;
  totalKnown: boolean;
  totalItems: number | null;
  distinctItems: number;
  distinctCompleted: number;
  people: Array<{ displayName: string }>;
  hierarchy:
    | { type: "tv"; showTitle: string; seasons: ProgressSeasonNode[] }
    | { type: "audiobook"; parentSeries: string | null; subseries: string | null; series: string | null; bookTitle: string; chapters: ProgressChapterNode[] }
    | { type: "movie" }
    | null;
  timingMs: number;
}
