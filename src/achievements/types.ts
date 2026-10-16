/**
 * Achievements Engine v1 Types and Contract Definitions.
 *
 * Designed for portable use across the local service, dashboard prototype,
 * and future standalone badge/trophy client applications.
 */

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface EpisodeReplayDetail {
  ratingKey: string;
  episodeKey: string;
  title: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  playCount: number;
  replayCount: number;
  firstWatchedAt: string | null;
  lastWatchedAt: string | null;
}

export interface NextTierProgress {
  currentTier: BadgeTier;
  nextTier: BadgeTier | null;
  nextTierName: string | null;
  rewatchedCount: number;
  targetCount: number;
  remainingCount: number;
  percentComplete: number;
}

export interface BadgeFlavorStats {
  totalHours?: number;
  totalPlays?: number;
  completedItems?: number;
  rewatchCount?: number;
  topTitle?: string;
  runnerUpTitle?: string;
  runnerUpHours?: number;
  runnerUpPlays?: number;
  availableOnPlex?: number | null;
  missingOffServerCount?: number | null;
  airedEpisodesCount?: number | null;
  nextAirAt?: string | null;
  isCaughtUpOnPlex?: boolean;
  seriesStatus?: string | null;
  latestWatchedAt?: string | null;
  firstCompletedAt?: string | null;
  firstCompletedEpisodeTitle?: string | null;
  firstCompletedEpisodeSeason?: number | null;
  firstCompletedEpisodeNumber?: number | null;
  nextTierProgress?: NextTierProgress | null;
  episodeReplayDetails?: EpisodeReplayDetail[];
}

export interface BadgeDescriptor {
  badgeKey: string;
  tier: BadgeTier;
  title: string;
  description: string;
  iconHint?: string;
  posterUrl?: string | null;
  stats?: BadgeFlavorStats;
}

export type ShowcaseFacet =
  | 'trophy_shelf'
  | 'taste_affinity'
  | 'obsession_spotlight'
  | 'cowatch_bond';

export type AchievementFamily =
  | 'first_watch'
  | 'watch_count'
  | 'rewatch'
  | 'confirmed_cowatch'
  | 'completion'
  | 'obsession_spotlight';

export type AchievementUnit =
  | 'movie'
  | 'episode'
  | 'audiobook_book'
  | 'play'
  | 'session'
  | 'day'
  | 'hour';

export interface AchievementScope {
  category?: 'movie' | 'tv' | 'anime' | 'classic_tv' | 'audiobook';
  genre?: string;
  seriesId?: string;
  librarySection?: string;
}

export interface AchievementRule {
  ruleId: string;
  version: number;
  family: AchievementFamily;
  unit: AchievementUnit;
  threshold: number;
  scope?: AchievementScope;
  evidenceRequirements?: {
    requiresConfirmedCoWatch?: boolean;
    requiresKnownDenominator?: boolean;
  };
  facet?: ShowcaseFacet;
  badge: BadgeDescriptor;
}

export type AchievementResultState =
  | 'earned'
  | 'in_progress'
  | 'not_earned'
  | 'blocked'
  | 'unknown';

export interface SupportingEvidenceRef {
  kind:
    | 'playback_observation'
    | 'archive_watch_event'
    | 'cowatch_confirmation'
    | 'cowatch_adjudication';
  id: number;
  eventTime?: string | null;
  title?: string;
}

export interface AchievementProgress {
  current: number;
  target: number;
  unit: AchievementUnit;
}

export interface AchievementResult {
  userId: number;
  ruleId: string;
  version: number;
  facet?: ShowcaseFacet;
  badge: BadgeDescriptor;
  state: AchievementResultState;
  progress: AchievementProgress;
  earnedAt: string | null;
  supportingEvidence: SupportingEvidenceRef[];
  reason?: string;
}

export interface EvidenceWatermark {
  maxObservationId: number;
  maxArchiveEventId: number;
  maxConfirmationId: number;
  maxAdjudicationId: number;
}

export interface EvaluationContext {
  timezone: string;
  nowIso?: string;
}

export interface AchievementEvaluationPayload {
  contractVersion: number;
  watermark: EvidenceWatermark;
  timezone: string;
  evaluatedAt: string;
  results: AchievementResult[];
}

export interface CanonicalPlay {
  id: number;
  sourceKind:
    | 'playback_observation'
    | 'archive_watch_event'
    | 'cowatch_confirmation'
    | 'cowatch_adjudication';
  userId: number;
  ratingKey: string;
  grandparentRatingKey?: string | null;
  mediaType: string;
  category: 'movie' | 'tv' | 'anime' | 'classic_tv' | 'audiobook';
  title: string;
  showTitle?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  genres?: string[];
  watchedAt: string | null;
  completed: boolean;
  durationSeconds?: number | null;
  viewOffsetSeconds?: number | null;
  percentComplete?: number | null;
}

export interface ConfirmedCoWatch {
  sourceKind: 'cowatch_confirmation' | 'cowatch_adjudication';
  id: number;
  userId: number;
  cowatcherUserId: number;
  ratingKey: string;
  watchedAt: string | null;
  title?: string;
}

export interface ShowProgressEvidence {
  grandparentRatingKey: string;
  showTitle: string;
  category: 'tv' | 'anime' | 'classic_tv';
  totalEpisodes: number | null;
  availableOnPlex?: number | null;
  missingOffServerCount?: number | null;
  airedEpisodesCount?: number | null;
  nextAirAt?: string | null;
  isCaughtUpOnPlex?: boolean;
  seriesStatus?: string | null;
  completedEpisodeKeys: Set<string>;
  allCompletedPlays: CanonicalPlay[];
  replaysByEpisode: Map<string, number>;
  posterUrl: string | null;
  lastCompletedWatchedAt: string | null;
  latestWatchedAt?: string | null;
  firstCompletedEpisodeTitle?: string | null;
  firstCompletedEpisodeSeason?: number | null;
  firstCompletedEpisodeNumber?: number | null;
  episodeReplayDetails?: EpisodeReplayDetail[];
}

export interface SubjectEvidence {
  userId: number;
  username: string;
  displayName: string;
  plays: CanonicalPlay[];
  replaysByRatingKey: Map<string, number>;
  replayEvidenceByRatingKey?: Map<string, SupportingEvidenceRef[]>;
  confirmedCoWatches: ConfirmedCoWatch[];
  completedAudiobookCount: number;
  showProgress?: Map<string, ShowProgressEvidence>;
  hasInferredCoWatchOnly?: boolean;
  hasUnknownDenominator?: boolean;
}
