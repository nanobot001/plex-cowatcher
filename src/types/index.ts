export type JsonRecord = Record<string, unknown>;

export interface ConfiguredUser {
  id?: number;
  displayName: string;
  plexUsername: string;
  plexUserId?: string;
  plexPin?: string;
  discordUserId?: string;
  isSourceUser?: boolean;
  isTypicalCowatcher?: boolean;
  enabled?: boolean;
}

export interface WatchEvent {
  id?: number;
  sourceUserId: number;
  tautulliRowId?: string;
  ratingKey: string;
  grandparentRatingKey?: string;
  parentRatingKey?: string;
  plexGuid?: string;
  mediaType: "movie" | "episode" | string;
  libraryName?: string;
  title: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  watchedAt: string;
  promptStatus?: "pending" | "resolved" | "dismissed" | "none";
}

export interface PlexUser {
  id: string;
  username: string;
  displayName: string;
}

export interface PlexMetadata {
  ratingKey: string;
  title: string;
  mediaType: string;
  guid?: string;
}

export interface PlexRichMetadata {
  ratingKey: string;
  guid?: string;
  mediaType: string;
  title: string;
  duration?: number;
  librarySectionID?: string;
  librarySectionTitle?: string;
  genres: string[];
  grandparentRatingKey?: string;
  grandparentGuid?: string;
  grandparentTitle?: string;
  parentRatingKey?: string;
  parentGuid?: string;
  parentTitle?: string;
  thumb?: string;
  art?: string;
  parentThumb?: string;
  grandparentThumb?: string;
  parentArt?: string;
  grandparentArt?: string;
  leafCount?: number;
  /** Trusted local data. Never expose through public-read tool responses. */
  filePath?: string;
}

export type AudiobookProvenance = "audnexus" | "google_books" | "folder_path" | "manual";
export type AudiobookEnrichmentStatus = "enriched" | "partial" | "pending";

export interface AudiobookBook {
  id?: number;
  folderKey: string;
  asin?: string;
  isbn?: string;
  googleBooksId?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  narrators: string[];
  seriesTitle?: string;
  seriesIndex?: number;
  year?: number;
  description?: string;
  coverUrl?: string;
  genres: string[];
  language?: string;
  totalDurationSeconds?: number;
  chapterCount?: number;
  sourceProvenance: AudiobookProvenance;
  enrichmentStatus: AudiobookEnrichmentStatus;
  parentSeriesTitle?: string;
  subseriesTitle?: string;
  relatedWorkClassification?: string;
  hierarchyProvenance?: string;
}

export interface WatchedState {
  watched: boolean;
  source: "plex" | "mock";
}

export type PlexSyncStatus =
  | "marked_watched"
  | "already_watched"
  | "mocked"
  | "missing_permission"
  | "target_unavailable"
  | "no_matching_media"
  | "plex_failure"
  | "timeout"
  | "unsupported_mutation"
  | "failed";

export interface MarkWatchedResult {
  ok: boolean;
  status: PlexSyncStatus;
  errorCode?: string;
  error?: string;
  details?: JsonRecord;
}

export interface RecentHistoryParams {
  user?: string;
  days?: number;
  length?: number;
  start?: number;
  section_id?: string;
  search?: string;
}

export interface TautulliHistoryRow {
  rowId?: string;
  user: string;
  ratingKey: string;
  grandparentRatingKey?: string;
  parentRatingKey?: string;
  plexGuid?: string;
  mediaType: string;
  libraryName?: string;
  title: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  watchedAt: string;
  watchedAtProvenance?: "source" | "fallback";
  percentComplete?: number;
  percentCompleteProvenance?: "source" | "unknown";
  viewOffset?: number;
  duration?: number;
  completed?: boolean;
}

export interface PlaybackObservation {
  id?: number;
  userId: number;
  tautulliRowId?: string;
  ratingKey: string;
  grandparentRatingKey?: string;
  parentRatingKey?: string;
  plexGuid?: string;
  mediaType: string;
  libraryName?: string;
  title: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  watchedAt: string;
  watchedAtProvenance?: string;
  percentComplete?: number;
  percentCompleteProvenance?: string;
  viewOffset?: number;
  duration?: number;
  completed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceResult<T = JsonRecord> {
  ok: boolean;
  data?: T;
  errorCode?: string;
  message?: string;
  details?: JsonRecord;
  retryable?: boolean;
}
