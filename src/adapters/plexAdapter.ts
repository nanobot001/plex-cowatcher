import type { MarkWatchedResult, PlexHistoricalMovieState, PlexMetadata, PlexRichMetadata, PlexUser, WatchedState } from "../types/index.js";
import { appConfig } from "../utils/config.js";

export interface PlexAdapter {
  listUsers(): Promise<PlexUser[]>;
  getMetadataByRatingKey(ratingKey: string, plexGuid?: string): Promise<PlexMetadata>;
  getRichMetadataByRatingKey(ratingKey: string, plexGuid?: string): Promise<PlexRichMetadata>;
  getWatchedState(userId: string, ratingKey: string, plexGuid?: string): Promise<WatchedState>;
  markWatched(userId: string, ratingKey: string, plexGuid?: string): Promise<MarkWatchedResult>;
  listLibraries(): Promise<Array<{ key: string; title: string; type: string }>>;
  listUserMovieStates?(userId: string): Promise<PlexHistoricalMovieState[]>;
  resolveActiveRatingKey?(originalRatingKey: string, plexGuid?: string): Promise<string>;
  listShows(libraryKey: string): Promise<string[]>;
  listLibraryTracks(libraryKey: string): Promise<PlexRichMetadata[]>;
}

export class PlexAdapterError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly status: MarkWatchedResult["status"] = "plex_failure",
    public readonly retryable = false,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export class MockPlexAdapter implements PlexAdapter {
  async listUsers(): Promise<PlexUser[]> {
    return [];
  }

  async getMetadataByRatingKey(ratingKey: string, _plexGuid?: string): Promise<PlexMetadata> {
    return { ratingKey, title: `Mock metadata ${ratingKey}`, mediaType: "unknown" };
  }

  async getRichMetadataByRatingKey(ratingKey: string, _plexGuid?: string): Promise<PlexRichMetadata> {
    const posterDataUrl = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="600" height="900" rx="32" fill="url(#g)"/><rect x="48" y="48" width="504" height="804" rx="28" fill="#111827" stroke="#334155" stroke-width="6"/><circle cx="300" cy="420" r="170" fill="#f59e0b" opacity="0.15"/><path d="M250 310 L250 530 L420 420 Z" fill="#f59e0b"/></svg>`);
    if (ratingKey === "mock-track-1") {
      return {
        ratingKey: "mock-track-1",
        mediaType: "track",
        title: "Part 1",
        duration: 1200000,
        librarySectionID: "5",
        librarySectionTitle: "Audiobooks",
        grandparentRatingKey: "author-1",
        grandparentGuid: "local://author-1",
        grandparentTitle: "Terry Pratchett",
        parentRatingKey: "book-1",
        parentGuid: "local://book-1",
        parentTitle: "Guards! Guards!",
        thumb: posterDataUrl,
        genres: [],
        filePath: "F:\\Media\\Audio\\Audiobooks\\Terry Pratchett   Narrated by\\2023 - Guards! Guards!\\01.mp3"
      };
    }
    if (ratingKey.startsWith("show-")) {
      return {
        ratingKey,
        mediaType: "show",
        title: "Mock Show",
        genres: ["Comedy", "Drama"],
        leafCount: 24,
        librarySectionID: "2",
        librarySectionTitle: "TV Shows",
        thumb: posterDataUrl,
        art: posterDataUrl
      };
    }
    if (ratingKey.startsWith("episode-")) {
      return {
        ratingKey,
        mediaType: "episode",
        title: "Mock Episode",
        genres: [],
        duration: 1200000,
        librarySectionID: "2",
        librarySectionTitle: "TV Shows",
        grandparentRatingKey: "show-1",
        grandparentTitle: "Mock Show",
        parentRatingKey: "season-1",
        thumb: posterDataUrl,
        grandparentThumb: posterDataUrl
      };
    }
    return {
      ratingKey,
      mediaType: "movie",
      title: "Mock Movie",
      genres: ["Action", "Sci-Fi"],
      duration: 7200000,
      librarySectionID: "1",
      librarySectionTitle: "Movies",
      thumb: posterDataUrl,
      art: posterDataUrl
    };
  }

  async getWatchedState(_userId: string, _ratingKey: string, _plexGuid?: string): Promise<WatchedState> {
    return { watched: false, source: "mock" };
  }

  async markWatched(_userId: string, _ratingKey: string, _plexGuid?: string): Promise<MarkWatchedResult> {
    return { ok: true, status: "mocked" };
  }

  async listLibraries(): Promise<Array<{ key: string; title: string; type: string }>> {
    return [
      { key: "1", title: "Movies", type: "movie" },
      { key: "2", title: "TV Shows", type: "show" },
      { key: "3", title: "Anime", type: "show" },
      { key: "4", title: "Classic TV", type: "show" },
      { key: "5", title: "Audiobooks", type: "artist" }
    ];
  }

  async listUserMovieStates(_userId: string): Promise<PlexHistoricalMovieState[]> {
    return [];
  }

  async listShows(libraryKey: string): Promise<string[]> {
    if (libraryKey === "2") {
      return ["The Office", "Breaking Bad", "Parks and Recreation"];
    }
    if (libraryKey === "3") {
      return ["Death Note", "Attack on Titan", "Fullmetal Alchemist"];
    }
    if (libraryKey === "4") {
      return ["I Love Lucy", "The Twilight Zone", "M*A*S*H"];
    }
    return [];
  }

  async listLibraryTracks(libraryKey: string): Promise<PlexRichMetadata[]> {
    return [
      {
        ratingKey: "mock-track-1",
        mediaType: "track",
        title: "Part 1",
        duration: 1200000,
        librarySectionID: libraryKey,
        librarySectionTitle: "Audiobooks",
        grandparentRatingKey: "author-1",
        grandparentGuid: "local://author-1",
        grandparentTitle: "Terry Pratchett",
        parentRatingKey: "book-1",
        parentGuid: "local://book-1",
        parentTitle: "Guards! Guards!",
        thumb: "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#111827"/><text x="50%" y="50%" fill="#f59e0b" font-size="48" text-anchor="middle">Audiobook</text></svg>`),
        genres: [],
        filePath: "F:\\Media\\Audio\\Audiobooks\\Terry Pratchett   Narrated by\\2023 - Guards! Guards!\\01.mp3"
      }
    ];
  }
}

export class HttpPlexAdapter extends MockPlexAdapter {
  private userTokensCache = new Map<string, string>();

  async getAccessTokenForUser(userId: string): Promise<string> {
    if (userId === "1" || userId === "tonyhung") {
      return appConfig.PLEX_TOKEN;
    }

    if (this.userTokensCache.has(userId)) {
      return this.userTokensCache.get(userId)!;
    }

    if (!appConfig.PLEX_TOKEN) {
      throw new PlexAdapterError("PLEX_TOKEN_MISSING", "Plex token is not configured.", "missing_permission");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let homeUsersXml = "";
    try {
      const url = new URL("https://plex.tv/api/v2/home/users");
      url.searchParams.set("X-Plex-Token", appConfig.PLEX_TOKEN);
      url.searchParams.set("X-Plex-Client-Identifier", "plex-cowatch-sync");
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new PlexAdapterError("PLEX_HOME_USERS_FAILED", `Failed to fetch home users from plex.tv (HTTP ${response.status})`, "plex_failure");
      }
      homeUsersXml = await response.text();
    } catch (error) {
      if (error instanceof PlexAdapterError) throw error;
      throw new PlexAdapterError("PLEX_HOME_USERS_FAILED", error instanceof Error ? error.message : "Failed to fetch home users.", "plex_failure");
    } finally {
      clearTimeout(timeout);
    }

    const userMatch = homeUsersXml.match(new RegExp(`<user\\b[^>]*\\bid="${userId}"[^>]*>`)) || 
                      homeUsersXml.match(new RegExp(`<user\\b[^>]*\\bkey="${userId}"[^>]*>`));
    if (!userMatch) {
      const adminMatch = homeUsersXml.match(/<user\b[^>]*\badmin="1"[^>]*>/);
      if (adminMatch) {
        const adminId = attr(adminMatch[0], "id") ?? attr(adminMatch[0], "key");
        if (adminId === userId) {
          this.userTokensCache.set(userId, appConfig.PLEX_TOKEN);
          return appConfig.PLEX_TOKEN;
        }
      }
      throw new PlexAdapterError("PLEX_USER_NOT_FOUND", `User ID ${userId} not found in Plex Home.`, "target_unavailable");
    }

    const userTag = userMatch[0];
    const isAdmin = attr(userTag, "admin") === "1";
    if (isAdmin) {
      this.userTokensCache.set(userId, appConfig.PLEX_TOKEN);
      return appConfig.PLEX_TOKEN;
    }

    const uuid = attr(userTag, "uuid");
    if (!uuid) {
      throw new PlexAdapterError("PLEX_USER_UUID_MISSING", `User ${userId} does not have a UUID.`, "target_unavailable");
    }

    const switchController = new AbortController();
    const switchTimeout = setTimeout(() => switchController.abort(), 10000);
    let switchXml = "";
    try {
      const url = new URL(`https://plex.tv/api/v2/home/users/${uuid}/switch`);
      url.searchParams.set("X-Plex-Token", appConfig.PLEX_TOKEN);
      url.searchParams.set("X-Plex-Client-Identifier", "plex-cowatch-sync");
      const response = await fetch(url, { method: "POST", signal: switchController.signal });
      if (!response.ok) {
        throw new PlexAdapterError("PLEX_USER_SWITCH_FAILED", `Failed to switch to user ${userId} on plex.tv (HTTP ${response.status})`, "plex_failure");
      }
      switchXml = await response.text();
    } catch (error) {
      if (error instanceof PlexAdapterError) throw error;
      throw new PlexAdapterError("PLEX_USER_SWITCH_FAILED", error instanceof Error ? error.message : "Failed to switch user.", "plex_failure");
    } finally {
      clearTimeout(switchTimeout);
    }

    const switchUserTag = switchXml.match(/<user\b[^>]*>/)?.[0];
    if (!switchUserTag) {
      throw new PlexAdapterError("PLEX_USER_SWITCH_FAILED", "Failed to parse switch user response.", "plex_failure");
    }
    const authToken = attr(switchUserTag, "authToken");
    if (!authToken) {
      throw new PlexAdapterError("PLEX_USER_SWITCH_FAILED", "User switch response did not return authToken.", "plex_failure");
    }

    const resController = new AbortController();
    const resTimeout = setTimeout(() => resController.abort(), 10000);
    let resourcesXml = "";
    try {
      const url = new URL("https://plex.tv/api/v2/resources");
      url.searchParams.set("X-Plex-Token", authToken);
      url.searchParams.set("X-Plex-Client-Identifier", "plex-cowatch-sync");
      url.searchParams.set("includeHttps", "1");
      const response = await fetch(url, { signal: resController.signal });
      if (!response.ok) {
        throw new PlexAdapterError("PLEX_RESOURCES_FAILED", `Failed to fetch resources for user ${userId} from plex.tv (HTTP ${response.status})`, "plex_failure");
      }
      resourcesXml = await response.text();
    } catch (error) {
      if (error instanceof PlexAdapterError) throw error;
      throw new PlexAdapterError("PLEX_RESOURCES_FAILED", error instanceof Error ? error.message : "Failed to fetch resources.", "plex_failure");
    } finally {
      clearTimeout(resTimeout);
    }

    const resourceMatches = resourcesXml.match(/<resource\b[^>]*\bprovides="server"[^>]*>/g) ?? [];
    if (resourceMatches.length === 0) {
      throw new PlexAdapterError("PLEX_SERVER_NOT_SHARED", `No shared Plex server found for user ${userId}.`, "target_unavailable");
    }

    const serverResourceTag = resourceMatches[0]!;
    const serverAccessToken = attr(serverResourceTag, "accessToken");
    if (!serverAccessToken) {
      throw new PlexAdapterError("PLEX_SERVER_NOT_SHARED", `Shared Plex server for user ${userId} does not have an accessToken.`, "target_unavailable");
    }

    this.userTokensCache.set(userId, serverAccessToken);
    return serverAccessToken;
  }

  async fetchAsUser(
    userId: string,
    pathname: string,
    queryParams: Record<string, string> = {},
    options: RequestInit = {}
  ): Promise<Response> {
    const token = await this.getAccessTokenForUser(userId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL(pathname, appConfig.PLEX_BASE_URL);
      url.searchParams.set("X-Plex-Token", token);
      for (const [key, value] of Object.entries(queryParams)) {
        url.searchParams.set(key, value);
      }
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PlexAdapterError("PLEX_TIMEOUT", "Plex request timed out.", "timeout", true);
      }
      throw new PlexAdapterError("PLEX_REQUEST_FAILED", error instanceof Error ? error.message : "Plex request failed.", "plex_failure", true);
    } finally {
      clearTimeout(timeout);
    }
  }

  async listUsers(): Promise<PlexUser[]> {
    if (!appConfig.PLEX_TOKEN) {
      throw new PlexAdapterError("PLEX_TOKEN_MISSING", "Plex token is not configured.", "missing_permission");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = new URL("https://plex.tv/api/v2/home/users");
      url.searchParams.set("X-Plex-Token", appConfig.PLEX_TOKEN);
      url.searchParams.set("X-Plex-Client-Identifier", "plex-cowatch-sync");
      const response = await fetch(url, { signal: controller.signal });
      
      if (!response.ok) {
        // Fallback to local accounts if home users endpoint fails (e.g., no Plex Home)
        const fallbackResponse = await plexFetch("/accounts");
        if (!fallbackResponse.ok) {
          throw plexErrorFromResponse(fallbackResponse, "PLEX_USER_LIST_FAILED", "Plex user listing failed.");
        }
        return parsePlexUsers(await fallbackResponse.text());
      }
      return parsePlexUsers(await response.text());
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PlexAdapterError("PLEX_TIMEOUT", "Plex request timed out.", "timeout", true);
      }
      throw new PlexAdapterError("PLEX_REQUEST_FAILED", error instanceof Error ? error.message : "Plex request failed.", "plex_failure", true);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getMetadataByRatingKey(ratingKey: string, plexGuid?: string): Promise<PlexMetadata> {
    if (!appConfig.PLEX_TOKEN) {
      throw new PlexAdapterError("PLEX_TOKEN_MISSING", "Plex token is not configured.", "missing_permission", false, { ratingKey });
    }

    let activeKey = ratingKey;
    let response = await plexFetch(`/library/metadata/${encodeURIComponent(activeKey)}`);
    if (!response.ok && response.status === 404 && plexGuid) {
      activeKey = await this.resolveActiveRatingKey(ratingKey, plexGuid);
      if (activeKey !== ratingKey) {
        response = await plexFetch(`/library/metadata/${encodeURIComponent(activeKey)}`);
      }
    }

    if (!response.ok) throw plexErrorFromResponse(response, "PLEX_METADATA_LOOKUP_FAILED", "Plex metadata lookup failed.", { ratingKey: activeKey });

    const xml = await response.text();
    const tag = firstMediaTag(xml);
    if (!tag) {
      throw new PlexAdapterError("PLEX_NO_MATCHING_MEDIA", "No matching Plex media was found for the rating key.", "no_matching_media", false, { ratingKey: activeKey });
    }

    return {
      ratingKey: activeKey,
      title: attr(tag, "title") ?? attr(tag, "grandparentTitle") ?? activeKey,
      mediaType: attr(tag, "type") ?? "unknown",
      guid: attr(tag, "guid")
    };
  }

  async getWatchedState(userId: string, ratingKey: string, plexGuid?: string): Promise<WatchedState> {
    if (!userId) {
      throw new PlexAdapterError("PLEX_TARGET_UNAVAILABLE", "Target Plex user is unavailable.", "target_unavailable", false, { ratingKey });
    }

    let activeKey = ratingKey;
    let response = await this.fetchAsUser(userId, `/library/metadata/${encodeURIComponent(activeKey)}`);
    if (!response.ok && response.status === 404 && plexGuid) {
      activeKey = await this.resolveActiveRatingKey(ratingKey, plexGuid);
      if (activeKey !== ratingKey) {
        response = await this.fetchAsUser(userId, `/library/metadata/${encodeURIComponent(activeKey)}`);
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        let adminExists = false;
        let libraryName: string | undefined;
        try {
          const adminResponse = await plexFetch(`/library/metadata/${encodeURIComponent(activeKey)}`);
          if (adminResponse.ok) {
            const adminXml = await adminResponse.text();
            const mediaTag = firstMediaTag(adminXml);
            if (mediaTag) {
              adminExists = true;
              libraryName = attr(mediaTag, "librarySectionTitle");
            }
          }
        } catch (e) {
          // ignore
        }

        if (adminExists) {
          throw new PlexAdapterError(
            "PLEX_RESTRICTED_MEDIA",
            `Target user does not have access to this item${libraryName ? ` (library: ${libraryName})` : ""}.`,
            "no_matching_media",
            false,
            { userId, ratingKey: activeKey, libraryName }
          );
        } else {
          throw new PlexAdapterError(
            "PLEX_NO_MATCHING_MEDIA",
            "No matching Plex media was found for the rating key.",
            "no_matching_media",
            false,
            { userId, ratingKey: activeKey }
          );
        }
      }
      throw plexErrorFromResponse(response, "PLEX_WATCHED_STATE_FAILED", "Plex watched-state check failed.", { userId, ratingKey: activeKey });
    }

    const tag = firstMediaTag(await response.text());
    if (!tag) {
      throw new PlexAdapterError("PLEX_NO_MATCHING_MEDIA", "No matching Plex media was found for the rating key.", "no_matching_media", false, { userId, ratingKey: activeKey });
    }

    const watched = Boolean(attr(tag, "viewedAt")) || Number(attr(tag, "viewCount") ?? "0") > 0;
    return { watched, source: "plex" };
  }

  async markWatched(userId: string, ratingKey: string, plexGuid?: string): Promise<MarkWatchedResult> {
    if (appConfig.PLEX_MUTATION_MODE !== "live") {
      return { ok: true, status: "mocked" };
    }

    if (!userId) {
      throw new PlexAdapterError("PLEX_TARGET_UNAVAILABLE", "Target Plex user is unavailable.", "target_unavailable", false, { ratingKey });
    }

    let activeKey = ratingKey;
    try {
      let response = await this.fetchAsUser(userId, "/:/scrobble", {
        identifier: "com.plexapp.plugins.library",
        key: activeKey
      });

      if (!response.ok && response.status === 404 && plexGuid) {
        activeKey = await this.resolveActiveRatingKey(ratingKey, plexGuid);
        if (activeKey !== ratingKey) {
          response = await this.fetchAsUser(userId, "/:/scrobble", {
            identifier: "com.plexapp.plugins.library",
            key: activeKey
          });
        }
      }

      if (!response.ok) {
        throw plexErrorFromResponse(response, "PLEX_MARK_WATCHED_FAILED", "Plex mark-watched failed.", { userId, ratingKey: activeKey });
      }

      return { ok: true, status: "marked_watched" };
    } catch (error) {
      if (error instanceof PlexAdapterError) {
        return {
          ok: false,
          status: error.status,
          errorCode: error.errorCode,
          error: error.message,
          details: error.details
        };
      }
      return {
        ok: false,
        status: "plex_failure",
        errorCode: "PLEX_SYNC_FAILED",
        error: error instanceof Error ? error.message : "Plex sync failed."
      };
    }
  }

  async getRichMetadataByRatingKey(ratingKey: string, plexGuid?: string): Promise<PlexRichMetadata> {
    if (!appConfig.PLEX_TOKEN) {
      throw new PlexAdapterError("PLEX_TOKEN_MISSING", "Plex token is not configured.", "missing_permission", false, { ratingKey });
    }

    let activeKey = ratingKey;
    let response = await plexFetch(`/library/metadata/${encodeURIComponent(activeKey)}`);
    if (!response.ok && response.status === 404 && plexGuid) {
      activeKey = await this.resolveActiveRatingKey(ratingKey, plexGuid);
      if (activeKey !== ratingKey) {
        response = await plexFetch(`/library/metadata/${encodeURIComponent(activeKey)}`);
      }
    }

    if (!response.ok) throw plexErrorFromResponse(response, "PLEX_METADATA_LOOKUP_FAILED", "Plex metadata lookup failed.", { ratingKey: activeKey });

    const xml = await response.text();
    const tag = firstMediaTag(xml);
    if (!tag) {
      throw new PlexAdapterError("PLEX_NO_MATCHING_MEDIA", "No matching Plex media was found for the rating key.", "no_matching_media", false, { ratingKey: activeKey });
    }

    const mediaType = attr(tag, "type") ?? "unknown";
    const genres = parseGenres(xml);

    const metadata: PlexRichMetadata = {
      ratingKey: activeKey,
      guid: attr(tag, "guid"),
      mediaType,
      title: attr(tag, "title") ?? attr(tag, "grandparentTitle") ?? activeKey,
      duration: attr(tag, "duration") ? Number(attr(tag, "duration")) : undefined,
      librarySectionID: attr(tag, "librarySectionID"),
      librarySectionTitle: attr(tag, "librarySectionTitle"),
      genres,
      grandparentRatingKey: attr(tag, "grandparentRatingKey"),
      grandparentGuid: attr(tag, "grandparentGuid"),
      grandparentTitle: attr(tag, "grandparentTitle"),
      parentRatingKey: attr(tag, "parentRatingKey"),
      parentGuid: attr(tag, "parentGuid"),
      parentTitle: attr(tag, "parentTitle"),
      thumb: attr(tag, "thumb"),
      art: attr(tag, "art"),
      parentThumb: attr(tag, "parentThumb"),
      grandparentThumb: attr(tag, "grandparentThumb"),
      parentArt: attr(tag, "parentArt"),
      grandparentArt: attr(tag, "grandparentArt"),
      filePath: parsePartFilePath(xml)
    };

    if (mediaType === "show") {
      metadata.leafCount = attr(tag, "leafCount") ? Number(attr(tag, "leafCount")) : undefined;
    }

    return metadata;
  }

  async resolveActiveRatingKey(originalRatingKey: string, plexGuid?: string): Promise<string> {
    if (!plexGuid) return originalRatingKey;
    try {
      const response = await plexFetch(`/library/all?guid=${encodeURIComponent(plexGuid)}`);
      if (response.ok) {
        const xml = await response.text();
        const tag = firstMediaTag(xml);
        if (tag) {
          const resolvedKey = attr(tag, "ratingKey");
          if (resolvedKey && resolvedKey !== originalRatingKey) {
            console.log(`[PlexAdapter] Resolved stale ratingKey ${originalRatingKey} to active ratingKey ${resolvedKey} using GUID ${plexGuid}`);
            return resolvedKey;
          }
        }
      }
    } catch (e) {
      console.warn(`[PlexAdapter] Failed to resolve active ratingKey for GUID ${plexGuid}:`, e);
    }
    return originalRatingKey;
  }

  async listLibraries(): Promise<Array<{ key: string; title: string; type: string }>> {
    if (!appConfig.PLEX_TOKEN) {
      throw new PlexAdapterError("PLEX_TOKEN_MISSING", "Plex token is not configured.", "missing_permission", false);
    }
    const response = await plexFetch("/library/sections");
    if (!response.ok) {
      throw plexErrorFromResponse(response, "PLEX_LIBRARIES_FAILED", "Failed to retrieve Plex libraries.");
    }
    const xml = await response.text();
    const directories: Array<{ key: string; title: string; type: string }> = [];
    const directoryTags = xml.match(/<Directory\b[^>]*>/g) ?? [];
    for (const tag of directoryTags) {
      const key = attr(tag, "key");
      const title = attr(tag, "title");
      const type = attr(tag, "type");
      if (key && title && type) {
        directories.push({ key, title, type });
      }
    }
    return directories;
  }

  async listUserMovieStates(userId: string): Promise<PlexHistoricalMovieState[]> {
    const librariesResponse = await this.fetchAsUser(userId, "/library/sections");
    if (!librariesResponse.ok) {
      throw plexErrorFromResponse(librariesResponse, "PLEX_USER_LIBRARIES_FAILED", "Failed to retrieve Plex libraries for the user.");
    }
    const librariesXml = await librariesResponse.text();
    const movieLibraries = (librariesXml.match(/<Directory\b[^>]*>/g) ?? [])
      .map((tag) => ({
        key: attr(tag, "key"),
        title: attr(tag, "title"),
        type: attr(tag, "type")
      }))
      .filter((library): library is { key: string; title: string; type: string } => library.type === "movie" && Boolean(library.key && library.title));

    const movies: PlexHistoricalMovieState[] = [];
    for (const library of movieLibraries) {
      const response = await this.fetchAsUser(userId, `/library/sections/${encodeURIComponent(library.key)}/all`, { type: "1" });
      if (!response.ok) {
        throw plexErrorFromResponse(response, "PLEX_USER_MOVIES_FAILED", "Failed to retrieve Plex movies for the user.");
      }
      const xml = await response.text();
      const tags = xml.match(/<(?:Video|Movie)\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        const ratingKey = attr(tag, "ratingKey");
        if (!ratingKey) continue;
        const rawLastViewedAt = attr(tag, "lastViewedAt") ?? attr(tag, "viewedAt");
        const lastViewedAt = rawLastViewedAt && /^\d+$/.test(rawLastViewedAt)
          ? new Date(Number(rawLastViewedAt) * 1000).toISOString()
          : rawLastViewedAt || undefined;
        const rawViewCount = attr(tag, "viewCount");
        const viewCount = rawViewCount == null || rawViewCount === "" ? undefined : Number(rawViewCount);
        movies.push({
          ratingKey,
          guid: attr(tag, "guid") || undefined,
          title: attr(tag, "title") ?? ratingKey,
          mediaType: "movie",
          librarySectionID: attr(tag, "librarySectionID") ?? library.key,
          librarySectionTitle: attr(tag, "librarySectionTitle") ?? library.title,
          viewCount: Number.isFinite(viewCount) ? viewCount : undefined,
          lastViewedAt
        });
      }
    }
    return movies;
  }

  async listShows(libraryKey: string): Promise<string[]> {
    if (!appConfig.PLEX_TOKEN) {
      throw new PlexAdapterError("PLEX_TOKEN_MISSING", "Plex token is not configured.", "missing_permission", false);
    }
    const response = await plexFetch(`/library/sections/${encodeURIComponent(libraryKey)}/all?type=2`);
    if (!response.ok) {
      throw plexErrorFromResponse(response, "PLEX_SHOWS_FAILED", "Failed to retrieve Plex shows.");
    }
    const xml = await response.text();
    const showsSet = new Set<string>();
    const directoryTags = xml.match(/<Directory\b[^>]*>/g) ?? [];
    for (const tag of directoryTags) {
      const title = attr(tag, "title");
      if (title) {
        showsSet.add(title);
      }
    }
    return Array.from(showsSet).sort();
  }

  async listLibraryTracks(libraryKey: string): Promise<PlexRichMetadata[]> {
    if (!appConfig.PLEX_TOKEN) {
      throw new PlexAdapterError("PLEX_TOKEN_MISSING", "Plex token is not configured.", "missing_permission", false);
    }
    const response = await plexFetch(`/library/sections/${encodeURIComponent(libraryKey)}/all?type=10`);
    if (!response.ok) {
      throw plexErrorFromResponse(response, "PLEX_LIBRARY_TRACKS_FAILED", "Failed to retrieve tracks from Plex library.");
    }
    const xml = await response.text();
    const trackMatches = xml.match(/<Track\b[^>]*>([\s\S]*?)<\/Track>/g) ?? 
                         xml.match(/<Track\b[^>]*\/>/g) ?? [];
    const tracks: PlexRichMetadata[] = [];
    for (const match of trackMatches) {
      const tag = match.match(/<Track\b[^>]*>/)?.[0] ?? match;
      const ratingKey = attr(tag, "ratingKey");
      if (!ratingKey) continue;

      const genres = parseGenres(match);
      const filePath = parsePartFilePath(match);

      tracks.push({
        ratingKey,
        guid: attr(tag, "guid"),
        mediaType: "track",
        title: attr(tag, "title") ?? ratingKey,
        duration: attr(tag, "duration") ? Number(attr(tag, "duration")) : undefined,
        librarySectionID: libraryKey,
        librarySectionTitle: attr(tag, "librarySectionTitle"),
        genres,
        grandparentRatingKey: attr(tag, "grandparentRatingKey"),
        grandparentGuid: attr(tag, "grandparentGuid"),
        grandparentTitle: attr(tag, "grandparentTitle"),
        parentRatingKey: attr(tag, "parentRatingKey"),
        parentGuid: attr(tag, "parentGuid"),
        parentTitle: attr(tag, "parentTitle"),
        filePath
      });
    }
    return tracks;
  }
}

export function createPlexAdapter(): PlexAdapter {
  return appConfig.PLEX_TOKEN ? new HttpPlexAdapter() : new MockPlexAdapter();
}

async function plexFetch(pathname: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const url = new URL(pathname, appConfig.PLEX_BASE_URL);
    url.searchParams.set("X-Plex-Token", appConfig.PLEX_TOKEN);
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new PlexAdapterError("PLEX_TIMEOUT", "Plex request timed out.", "timeout", true);
    }
    throw new PlexAdapterError("PLEX_REQUEST_FAILED", error instanceof Error ? error.message : "Plex request failed.", "plex_failure", true);
  } finally {
    clearTimeout(timeout);
  }
}

function plexErrorFromResponse(response: Response, fallbackCode: string, fallbackMessage: string, details: Record<string, unknown> = {}): PlexAdapterError {
  if (response.status === 401 || response.status === 403) {
    return new PlexAdapterError("PLEX_MISSING_PERMISSION", "Plex token is missing permission for the requested operation.", "missing_permission", false, details);
  }

  if (response.status === 404 && details.ratingKey !== undefined) {
    return new PlexAdapterError("PLEX_NO_MATCHING_MEDIA", "No matching Plex media was found for the rating key.", "no_matching_media", false, details);
  }

  return new PlexAdapterError(fallbackCode, `${fallbackMessage} HTTP ${response.status}.`, "plex_failure", response.status >= 500, details);
}

function parsePlexUsers(xml: string): PlexUser[] {
  const users: PlexUser[] = [];
  const accountTags = xml.match(/<(?:Account|User)\b[^>]*>/ig) ?? [];
  for (const tag of accountTags) {
    const id = attr(tag, "id") ?? attr(tag, "key");
    const username = attr(tag, "username") ?? attr(tag, "title") ?? attr(tag, "name");
    if (!id || !username) continue;
    users.push({ id, username, displayName: attr(tag, "title") ?? username });
  }
  return users;
}

function parseGenres(xml: string): string[] {
  const matches = xml.match(/<Genre\b[^>]*\btag="([^"]*)"/g) ?? [];
  return matches.map(m => {
    const val = m.match(/tag="([^"]*)"/)?.[1] ?? "";
    return unescapeXml(val);
  }).filter(Boolean);
}

function firstMediaTag(xml: string): string | undefined {
  return xml.match(/<(?:Video|Directory|Track)\b[^>]*>/)?.[0];
}

export function parsePartFilePath(xml: string): string | undefined {
  const partTag = xml.match(/<Part\b[^>]*>/i)?.[0];
  return partTag ? attr(partTag, "file") : undefined;
}

function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function attr(tag: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}="([^"]*)"`);
  const match = tag.match(pattern)?.[1];
  return match ? unescapeXml(match) : undefined;
}
