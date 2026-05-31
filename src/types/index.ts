export type JsonRecord = Record<string, unknown>;

export interface ConfiguredUser {
  id?: number;
  displayName: string;
  plexUsername: string;
  plexUserId?: string;
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

export interface WatchedState {
  watched: boolean;
  source: "plex" | "mock";
}

export interface MarkWatchedResult {
  ok: boolean;
  status: "marked_watched" | "already_watched" | "mocked" | "failed";
  error?: string;
}

export interface RecentHistoryParams {
  user?: string;
  days?: number;
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
  percentComplete?: number;
  viewOffset?: number;
  duration?: number;
  completed?: boolean;
}

export interface ServiceResult<T = JsonRecord> {
  ok: boolean;
  data?: T;
  errorCode?: string;
  message?: string;
  details?: JsonRecord;
  retryable?: boolean;
}
