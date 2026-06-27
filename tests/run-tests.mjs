import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openMigratedDatabase } from "../dist/db/database.js";
import { normalizeTautulliHistoryRow } from "../dist/adapters/tautulliAdapter.js";
import { countsAsCompleted } from "../dist/watcher/watcher.js";
import { WatcherService } from "../dist/watcher/watcher.js";
import { isDuplicateWithinWindow, watchEventKey } from "../dist/watcher/dedupe.js";
import { UserService } from "../dist/service/userService.js";
import { CowatchService } from "../dist/service/cowatchService.js";
import { SyncService } from "../dist/service/syncService.js";
import { PlexAdapterError, MockPlexAdapter } from "../dist/adapters/plexAdapter.js";
import { AppError, errorResult } from "../dist/utils/errors.js";
import { HistoryCopyService } from "../dist/service/historyCopyService.js";
import { IngestionService } from "../dist/service/ingestionService.js";
import { MetadataService } from "../dist/service/metadataService.js";
import { QueryService } from "../dist/service/queryService.js";
import { SummaryService } from "../dist/service/summaryService.js";
import { SessionService } from "../dist/service/sessionService.js";
import { CowatchingIntelligenceService } from "../dist/service/cowatchingIntelligenceService.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("watch completion accepts explicit completed rows", () => {
  assert.equal(countsAsCompleted({ completed: true }), true);
});

test("watch completion uses percent threshold", () => {
  assert.equal(countsAsCompleted({ percentComplete: 91 }, 90), true);
  assert.equal(countsAsCompleted({ percentComplete: 42 }, 90), false);
});

test("watch completion uses view offset and duration when percent is missing", () => {
  assert.equal(countsAsCompleted({ viewOffset: 90, duration: 100 }, 90), true);
});

test("Tautulli history rows normalize movie fields", () => {
  assert.deepEqual(
    normalizeTautulliHistoryRow({
      row_id: 123,
      user: "Tony",
      rating_key: "movie-1",
      media_type: "movie",
      section_name: "Movies",
      title: "The Movie",
      date: 1780000000,
      percent_complete: "95",
      watched_status: 1
    }),
    {
      rowId: "123",
      user: "Tony",
      ratingKey: "movie-1",
      grandparentRatingKey: undefined,
      parentRatingKey: undefined,
      plexGuid: undefined,
      mediaType: "movie",
      libraryName: "Movies",
      title: "The Movie",
      showTitle: undefined,
      seasonNumber: undefined,
      episodeNumber: undefined,
      watchedAt: "2026-05-28T20:26:40.000Z",
      watchedAtProvenance: "source",
      percentComplete: 95,
      percentCompleteProvenance: "source",
      viewOffset: undefined,
      duration: undefined,
      completed: true
    }
  );
});

test("Tautulli history rows normalize episode fields", () => {
  const row = normalizeTautulliHistoryRow({
    user: "Tony",
    rating_key: "episode-1",
    grandparent_rating_key: "show-1",
    parent_rating_key: "season-1",
    media_type: "episode",
    title: "Episode Title",
    grandparent_title: "Show Title",
    parent_media_index: "2",
    media_index: "7",
    view_offset: "900",
    duration: "1000"
  });

  assert.equal(row.mediaType, "episode");
  assert.equal(row.showTitle, "Show Title");
  assert.equal(row.seasonNumber, 2);
  assert.equal(row.episodeNumber, 7);
  assert.equal(row.viewOffset, 900);
  assert.equal(row.duration, 1000);
});

test("dedupe builds stable keys", () => {
  assert.equal(watchEventKey({ sourceUserId: 1, ratingKey: "abc", watchedAt: "2026-05-30T20:00:00Z" }), "1:abc:2026-05-30T20:00:00Z");
});

test("dedupe detects nearby timestamps", () => {
  assert.equal(isDuplicateWithinWindow("2026-05-30T20:00:00Z", "2026-05-30T20:05:00Z", 10), true);
  assert.equal(isDuplicateWithinWindow("2026-05-30T20:00:00Z", "2026-05-30T20:30:00Z", 10), false);
});

test("API error formatting returns machine-readable app errors", () => {
  assert.deepEqual(
    errorResult(new AppError("PLEX_MARK_WATCHED_FAILED", "Could not mark watched", { ratingKey: "1" }, true)),
    {
      ok: false,
      errorCode: "PLEX_MARK_WATCHED_FAILED",
      message: "Could not mark watched",
      details: { ratingKey: "1" },
      retryable: true
    }
  );
});

function withTestDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plex-cowatcher-test-"));
  const dbPath = path.join(dir, "state.sqlite");
  const db = openMigratedDatabase(dbPath);
  const cleanup = () => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };

  try {
    const result = fn(db);
    if (result && typeof result.then === "function") {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function seedUsers(db) {
  new UserService(db).syncConfiguredUsers([
    { plexUsername: "Tony", displayName: "Tony", isSourceUser: true, isTypicalCowatcher: false, enabled: true },
    { plexUsername: "Disabled", displayName: "Disabled", isSourceUser: true, isTypicalCowatcher: false, enabled: false },
    { plexUsername: "Viewer", plexUserId: "viewer-plex", displayName: "Viewer", isSourceUser: false, isTypicalCowatcher: true, enabled: true }
  ]);
}

function insertCompletedWatch(db) {
  const watcher = new WatcherService(db);
  return watcher.insertWatchEvent({
    rowId: "row-1",
    user: "Tony",
    ratingKey: "movie-1",
    mediaType: "movie",
    title: "The Movie",
    watchedAt: "2026-05-30T20:00:00.000Z",
    completed: true
  });
}

function cowatchService(db, plexOverrides = {}) {
  const plex = {
    listUsers: async () => [],
    getMetadataByRatingKey: async (ratingKey) => ({ ratingKey, title: "The Movie", mediaType: "movie" }),
    getWatchedState: async () => ({ watched: false, source: "mock" }),
    markWatched: async () => ({ ok: true, status: "mocked" }),
    ...plexOverrides
  };
  return new CowatchService(db, new SyncService(plex));
}

test("completed source-user watch creates one watch_events row", () => {
  withTestDb((db) => {
    seedUsers(db);
    const watcher = new WatcherService(db);
    const insertedId = watcher.insertWatchEvent({
      rowId: "row-1",
      user: "Tony",
      ratingKey: "movie-1",
      mediaType: "movie",
      title: "The Movie",
      watchedAt: "2026-05-30T20:00:00.000Z",
      percentComplete: 95
    });

    assert.equal(typeof insertedId, "number");
    const count = db.prepare("SELECT COUNT(*) AS count FROM watch_events").get().count;
    assert.equal(count, 1);
  });
});

test("re-polling exact and nearby duplicate watches does not create duplicates", () => {
  withTestDb((db) => {
    seedUsers(db);
    const watcher = new WatcherService(db);
    const first = watcher.insertWatchEvent({
      rowId: "row-1",
      user: "Tony",
      ratingKey: "movie-1",
      mediaType: "movie",
      title: "The Movie",
      watchedAt: "2026-05-30T20:00:00.000Z",
      completed: true
    });
    const exact = watcher.insertWatchEvent({
      rowId: "row-1",
      user: "Tony",
      ratingKey: "movie-1",
      mediaType: "movie",
      title: "The Movie",
      watchedAt: "2026-05-30T20:00:00.000Z",
      completed: true
    });
    const nearby = watcher.insertWatchEvent({
      rowId: "row-2",
      user: "Tony",
      ratingKey: "movie-1",
      mediaType: "movie",
      title: "The Movie",
      watchedAt: "2026-05-30T20:04:00.000Z",
      completed: true
    });

    assert.equal(typeof first, "number");
    assert.equal(exact, undefined);
    assert.equal(nearby, undefined);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM watch_events").get().count, 1);
  });
});

test("incomplete, unknown, disabled, and non-source users are ignored", () => {
  withTestDb((db) => {
    seedUsers(db);
    const watcher = new WatcherService(db);
    const rows = [
      { user: "Tony", ratingKey: "movie-1", mediaType: "movie", title: "Incomplete", watchedAt: "2026-05-30T20:00:00.000Z", percentComplete: 20 },
      { user: "Unknown", ratingKey: "movie-2", mediaType: "movie", title: "Unknown", watchedAt: "2026-05-30T20:00:00.000Z", completed: true },
      { user: "Disabled", ratingKey: "movie-3", mediaType: "movie", title: "Disabled", watchedAt: "2026-05-30T20:00:00.000Z", completed: true },
      { user: "Viewer", ratingKey: "movie-4", mediaType: "movie", title: "Viewer", watchedAt: "2026-05-30T20:00:00.000Z", completed: true }
    ];

    for (const row of rows) watcher.insertWatchEvent(row);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM watch_events").get().count, 0);
  });
});

test("polling Tautulli recent history inserts completed movie and episode rows", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const tautulli = {
      getUsers: async () => [],
      getActivity: async () => ({ streamCount: 0 }),
      getMetadata: async (ratingKey) => ({ ratingKey, title: "" }),
      getRecentHistory: async ({ user }) => [
        { user, ratingKey: "movie-1", mediaType: "movie", title: "The Movie", watchedAt: "2026-05-30T20:00:00.000Z", percentComplete: 95 },
        { user, ratingKey: "episode-1", mediaType: "episode", title: "Episode", showTitle: "Show", seasonNumber: 1, episodeNumber: 2, watchedAt: "2026-05-30T21:00:00.000Z", viewOffset: 950, duration: 1000 }
      ]
    };
    const watcher = new WatcherService(db, tautulli);
    const result = await watcher.pollRecentHistory();

    assert.deepEqual(result, { inserted: 2, skipped: 0 });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM watch_events WHERE media_type = 'movie'").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM watch_events WHERE media_type = 'episode'").get().count, 1);
  });
});

test("pending watch events are listed as Discord prompt candidates", () => {
  withTestDb((db) => {
    seedUsers(db);
    const watchEventId = insertCompletedWatch(db);
    const candidates = cowatchService(db).listPendingPromptCandidates();

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].watchEventId, watchEventId);
    assert.equal(candidates[0].sourceUser, "Tony");
    assert.equal(candidates[0].title, "The Movie");
  });
});

test("recording a sent Discord prompt is idempotent", () => {
  withTestDb((db) => {
    seedUsers(db);
    const watchEventId = insertCompletedWatch(db);
    const service = cowatchService(db);

    assert.deepEqual(service.recordPromptSent(watchEventId, "channel-1", "message-1"), { ok: true, sent: true });
    assert.deepEqual(service.recordPromptSent(watchEventId, "channel-1", "message-2"), { ok: true, sent: false });
    const row = db.prepare("SELECT prompt_status, discord_prompt_message_id FROM watch_events WHERE id = ?").get(watchEventId);
    assert.equal(row.prompt_status, "prompted");
    assert.equal(row.discord_prompt_message_id, "message-1");
  });
});

test("no-one resolution dismisses sync work without cowatch confirmations", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const watchEventId = insertCompletedWatch(db);
    const result = await cowatchService(db).resolvePrompt({
      watchEventId,
      selectedTargetUserIds: [],
      actor: "discord-user",
      method: "discord_prompt",
      resolution: "none"
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.status, "none");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cowatch_confirmations").get().count, 0);
  });
});

test("selected Discord users create idempotent cowatch confirmations", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const watchEventId = insertCompletedWatch(db);
    const viewer = db.prepare("SELECT id FROM users WHERE plex_username = 'Viewer'").get();
    const service = cowatchService(db);

    const first = await service.resolvePrompt({
      watchEventId,
      selectedTargetUserIds: [viewer.id, viewer.id],
      actor: "discord-user",
      method: "discord_prompt",
      resolution: "selected"
    });
    const second = await service.resolvePrompt({
      watchEventId,
      selectedTargetUserIds: [viewer.id],
      actor: "discord-user",
      method: "discord_prompt",
      resolution: "selected"
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM cowatch_confirmations").get().count, 1);
    const confirmation = db.prepare("SELECT status, plex_sync_status FROM cowatch_confirmations").get();
    assert.equal(confirmation.status, "confirmed");
    assert.equal(confirmation.plex_sync_status, "mocked");
  });
});

test("Plex adapter errors become structured sync failures", async () => {
  const service = new SyncService({
    listUsers: async () => [],
    getMetadataByRatingKey: async (ratingKey) => ({ ratingKey, title: "Missing", mediaType: "movie" }),
    getWatchedState: async () => {
      throw new PlexAdapterError("PLEX_NO_MATCHING_MEDIA", "No matching media", "no_matching_media", false, { ratingKey: "missing-1" });
    },
    markWatched: async () => ({ ok: true, status: "marked_watched" })
  });

  assert.deepEqual(await service.markWatchedIfNeeded("viewer-plex", "missing-1"), {
    ok: false,
    status: "no_matching_media",
    errorCode: "PLEX_NO_MATCHING_MEDIA",
    error: "No matching media",
    details: { ratingKey: "missing-1" }
  });
});

test("prompt resolution reports missing target Plex user as a structured result", async () => {
  await withTestDb(async (db) => {
    new UserService(db).syncConfiguredUsers([
      { plexUsername: "Tony", displayName: "Tony", isSourceUser: true, isTypicalCowatcher: false, enabled: true },
      { plexUsername: "NoPlex", displayName: "No Plex", isSourceUser: false, isTypicalCowatcher: true, enabled: true }
    ]);
    const watchEventId = insertCompletedWatch(db);
    const target = db.prepare("SELECT id FROM users WHERE plex_username = 'NoPlex'").get();
    const result = await cowatchService(db).resolvePrompt({
      watchEventId,
      selectedTargetUserIds: [target.id],
      actor: "cli",
      method: "cli",
      resolution: "selected"
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.data.results[0], {
      targetUserId: target.id,
      status: "failed",
      plexSyncStatus: "target_unavailable",
      errorCode: "PLEX_TARGET_UNAVAILABLE",
      error: "Target user missing Plex user id"
    });
  });
});

test("HistoryCopyService previewCopy filters, deduplicates, and applies correctly", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const viewer = db.prepare("SELECT id FROM users WHERE plex_username = 'Viewer'").get();

    const mockTautulli = {
      getRecentHistory: async () => [
        { rowId: "1", user: "Tony", ratingKey: "movie-1", mediaType: "movie", libraryName: "Movies", title: "Iron Man", watchedAt: "2026-06-01T12:00:00Z" },
        { rowId: "2", user: "Tony", ratingKey: "episode-1", mediaType: "episode", libraryName: "TV Shows", title: "Pilot", showTitle: "The Office", seasonNumber: 1, episodeNumber: 1, watchedAt: "2026-06-02T12:00:00Z" },
        { rowId: "3", user: "Tony", ratingKey: "movie-2", mediaType: "movie", libraryName: "Movies", title: "Avatar", watchedAt: "2026-06-03T12:00:00Z" }
      ]
    };

    const mockPlex = {
      getWatchedState: async (userId, ratingKey) => {
        if (ratingKey === "movie-2") {
          return { watched: true };
        }
        return { watched: false };
      }
    };

    let scrobbleCalled = [];
    const mockSync = {
      markWatchedIfNeeded: async (plexUserId, ratingKey) => {
        scrobbleCalled.push({ plexUserId, ratingKey });
        return { ok: true, status: "marked_watched" };
      }
    };

    const service = new HistoryCopyService(db, mockTautulli, mockSync, mockPlex);

    const res = await service.previewCopy({
      sourceUser: "Tony",
      targetUsers: ["Viewer"],
      filters: {},
      actor: "test"
    });

    assert.equal(res.ok, true);
    assert.equal(res.data.summary.itemsToCopy, 3);
    assert.equal(res.data.summary.eligible, 2);
    assert.equal(res.data.summary.alreadyWatched, 1);
    assert.equal(res.data.summary.alreadyCopied, 0);

    const job = db.prepare("SELECT * FROM copy_jobs WHERE id = ?").get(res.data.jobId);
    assert.equal(job.status, "previewed");
    assert.equal(job.preview_count, 3);

    const applyRes = await service.applyCopy(res.data.jobId, true, undefined, "test");
    assert.equal(applyRes.ok, true);
    assert.equal(applyRes.data.copied, 2);
    assert.equal(applyRes.data.skipped, 0);
    assert.equal(applyRes.data.failed, 0);

    assert.equal(scrobbleCalled.length, 2);
    const keys = scrobbleCalled.map(x => x.ratingKey);
    assert.ok(keys.includes("movie-1"));
    assert.ok(keys.includes("episode-1"));

    const jobAfter = db.prepare("SELECT * FROM copy_jobs WHERE id = ?").get(res.data.jobId);
    assert.equal(jobAfter.status, "applied");
    assert.equal(jobAfter.copied_count, 2);

    const resFiltered = await service.previewCopy({
      sourceUser: "Tony",
      targetUsers: ["Viewer"],
      filters: {
        showTitle: "Office",
        mediaType: "episode"
      },
      actor: "test"
    });

    assert.equal(resFiltered.ok, true);
    assert.equal(resFiltered.data.summary.itemsToCopy, 1);
    assert.equal(resFiltered.data.items[0].title, "Pilot");
  });
});

test("HistoryCopyService applyCopy respects selective itemIds list", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const viewer = db.prepare("SELECT id FROM users WHERE plex_username = 'Viewer'").get();

    const mockTautulli = {
      getRecentHistory: async () => [
        { rowId: "1", user: "Tony", ratingKey: "movie-1", mediaType: "movie", libraryName: "Movies", title: "Iron Man", watchedAt: "2026-06-01T12:00:00Z" },
        { rowId: "2", user: "Tony", ratingKey: "movie-2", mediaType: "movie", libraryName: "Movies", title: "Avatar", watchedAt: "2026-06-03T12:00:00Z" }
      ]
    };

    const mockPlex = {
      getWatchedState: async () => ({ watched: false })
    };

    let scrobbleCalled = [];
    const mockSync = {
      markWatchedIfNeeded: async (plexUserId, ratingKey) => {
        scrobbleCalled.push({ plexUserId, ratingKey });
        return { ok: true, status: "marked_watched" };
      }
    };

    const service = new HistoryCopyService(db, mockTautulli, mockSync, mockPlex);

    const res = await service.previewCopy({
      sourceUser: "Tony",
      targetUsers: ["Viewer"],
      filters: {},
      actor: "test"
    });

    assert.equal(res.ok, true);
    assert.equal(res.data.items.length, 2);

    const item1 = res.data.items.find(x => x.ratingKey === "movie-1");
    const item2 = res.data.items.find(x => x.ratingKey === "movie-2");
    assert.ok(item1.id);
    assert.ok(item2.id);

    const applyRes = await service.applyCopy(res.data.jobId, true, [item1.id], "test");
    assert.equal(applyRes.ok, true);
    assert.equal(applyRes.data.copied, 1);
    assert.equal(applyRes.data.skipped, 1);

    assert.equal(scrobbleCalled.length, 1);
    assert.equal(scrobbleCalled[0].ratingKey, "movie-1");

    const deselectedItem = db.prepare("SELECT * FROM copy_job_items WHERE id = ?").get(item2.id);
    assert.equal(deselectedItem.status, "skipped");
    assert.equal(deselectedItem.reason, "deselected");
  });
});

test("HistoryCopyService resolves stale rating keys using plexGuid when checking watched state and applying", () => {
  return withTestDb(async (db) => {
    seedUsers(db);
    const mockTautulli = {
      getRecentHistory: async () => [
        {
          rowId: "1",
          user: "Tony",
          ratingKey: "stale-key",
          plexGuid: "plex://movie/123",
          mediaType: "movie",
          title: "Stale Movie",
          watchedAt: "2026-05-30T20:00:00Z",
          completed: true
        }
      ]
    };

    let watchedStateCalled = [];
    const mockPlex = {
      getWatchedState: async (userId, ratingKey, plexGuid) => {
        watchedStateCalled.push({ userId, ratingKey, plexGuid });
        return { watched: false };
      }
    };

    let scrobbleCalled = [];
    const mockSync = {
      markWatchedIfNeeded: async (plexUserId, ratingKey, plexGuid) => {
        scrobbleCalled.push({ plexUserId, ratingKey, plexGuid });
        return { ok: true, status: "marked_watched" };
      }
    };

    const service = new HistoryCopyService(db, mockTautulli, mockSync, mockPlex);

    const res = await service.previewCopy({
      sourceUser: "Tony",
      targetUsers: ["Viewer"],
      filters: {},
      actor: "test"
    });

    assert.equal(res.ok, true);
    assert.deepEqual(watchedStateCalled, [
      { userId: "viewer-plex", ratingKey: "stale-key", plexGuid: "plex://movie/123" }
    ]);

    const applyRes = await service.applyCopy(res.data.jobId, true, undefined, "test");
    assert.equal(applyRes.ok, true);
    assert.deepEqual(scrobbleCalled, [
      { plexUserId: "viewer-plex", ratingKey: "stale-key", plexGuid: "plex://movie/123" }
    ]);
  });
});

test("PlexAdapter listLibraries and listShows mock implementations", async () => {
  const adapter = new MockPlexAdapter();
  const libraries = await adapter.listLibraries();
  assert.equal(libraries.length, 4);
  assert.equal(libraries[0].title, "Movies");
  assert.equal(libraries[1].type, "show");

  const shows = await adapter.listShows("2");
  assert.deepEqual(shows, ["The Office", "Breaking Bad", "Parks and Recreation"]);
});

test("IngestionService polls recent history and writes to playback_observations and watch_events", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const tautulli = {
      getUsers: async () => [],
      getActivity: async () => ({ streamCount: 0 }),
      getMetadata: async (ratingKey) => ({ ratingKey, title: "" }),
      getRecentHistory: async ({ user }) => {
        if (user === "Tony") {
          return [
            { user, ratingKey: "movie-1", mediaType: "movie", title: "The Movie", watchedAt: "2026-05-30T20:00:00.000Z", percentComplete: 95 }
          ];
        } else if (user === "Viewer") {
          return [
            { user, ratingKey: "episode-1", mediaType: "episode", title: "Episode", showTitle: "Show", seasonNumber: 1, episodeNumber: 2, watchedAt: "2026-05-30T21:00:00.000Z", percentComplete: 50 }
          ];
        }
        return [];
      }
    };

    const ingestion = new IngestionService(db, tautulli);
    const result = await ingestion.pollRecentHistory();

    assert.equal(result.inserted, 2);
    
    const obs = db.prepare("SELECT * FROM playback_observations").all();
    assert.equal(obs.length, 2);
    
    const tonyObs = obs.find(o => o.rating_key === "movie-1");
    const viewerObs = obs.find(o => o.rating_key === "episode-1");
    assert.ok(tonyObs);
    assert.ok(viewerObs);
    assert.equal(tonyObs.completed, 1);
    assert.equal(viewerObs.completed, 0);

    const events = db.prepare("SELECT * FROM watch_events").all();
    assert.equal(events.length, 1);
    assert.equal(events[0].rating_key, "movie-1");
  });
});

test("IngestionService backfillHistory paginated is idempotent", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    
    let callCount = 0;
    const tautulli = {
      getUsers: async () => [],
      getActivity: async () => ({ streamCount: 0 }),
      getMetadata: async (ratingKey) => ({ ratingKey, title: "" }),
      getRecentHistory: async ({ user, start, length }) => {
        callCount++;
        if (start === 0) {
          return [
            { user, ratingKey: "movie-1", mediaType: "movie", title: "The Movie", watchedAt: "2026-05-30T20:00:00.000Z", percentComplete: 95 }
          ];
        }
        return [];
      }
    };

    const ingestion = new IngestionService(db, tautulli);
    
    const result = await ingestion.backfillHistory(1, 10);
    assert.equal(result.inserted, 1);
    assert.equal(callCount, 2);

    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM playback_observations").get().count, 1);

    const result2 = await ingestion.backfillHistory(1, 10);
    assert.equal(result2.inserted, 0);
    assert.equal(result2.skipped, 1);
  });
});

test("MetadataService retrieves and caches Plex metadata, handling fallbacks", async () => {
  await withTestDb(async (db) => {
    const plex = {
      getUsers: async () => [],
      getWatchedState: async () => ({ watched: false, source: "mock" }),
      markWatched: async () => ({ ok: true, status: "mocked" }),
      listLibraries: async () => [],
      listShows: async () => [],
      getRichMetadataByRatingKey: async (ratingKey) => {
        if (ratingKey === "movie-1") {
          return {
            ratingKey,
            mediaType: "movie",
            title: "Movie One",
            genres: ["Drama"],
            duration: 6000000,
            librarySectionID: "1",
            librarySectionTitle: "Movies"
          };
        }
        throw new Error("Plex lookup failed");
      }
    };

    const metadata = new MetadataService(db, plex);
    
    const entry = await metadata.getMetadata("movie-1");
    assert.ok(entry);
    assert.equal(entry.title, "Movie One");
    assert.equal(entry.sourceProvenance, "plex");

    const entry2 = await metadata.getMetadata("movie-1");
    assert.ok(entry2);
    assert.equal(entry2.title, "Movie One");
    assert.equal(entry2.sourceProvenance, "plex");

    const entry3 = await metadata.getMetadata("movie-invalid");
    assert.ok(entry3);
    assert.equal(entry3.title, "Unknown Media (movie-invalid)");
    assert.equal(entry3.sourceProvenance, "fallback");
  });
});

test("MetadataService Smart Auto-Healing triggers refresh on count discrepancy", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    let fetchCount = 0;
    const plex = {
      getUsers: async () => [],
      getWatchedState: async () => ({ watched: false, source: "mock" }),
      markWatched: async () => ({ ok: true, status: "mocked" }),
      listLibraries: async () => [],
      listShows: async () => [],
      getRichMetadataByRatingKey: async (ratingKey) => {
        fetchCount++;
        return {
          ratingKey,
          mediaType: "show",
          title: "Airing Show",
          genres: [],
          leafCount: fetchCount === 1 ? 5 : 8,
          librarySectionID: "2",
          librarySectionTitle: "TV Shows"
        };
      }
    };

    const metadata = new MetadataService(db, plex);
    
    const show = await metadata.getMetadata("show-1");
    assert.equal(show.leafCount, 5);
    assert.equal(fetchCount, 1);

    for (let i = 1; i <= 6; i++) {
      db.prepare(`
        INSERT INTO playback_observations (
          user_id, rating_key, media_type, title, grandparent_rating_key, watched_at, completed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(1, `episode-${i}`, "episode", `Episode ${i}`, "show-1", `2026-05-30T20:0${i}:00Z`, 1);
    }

    await metadata.checkAndAutoHealShow("show-1");

    assert.equal(fetchCount, 2);
    const updatedShow = metadata.getCached("show-1");
    assert.equal(updatedShow.leafCount, 8);
  });
});

test("QueryService filters, orders, and paginates watch history deterministically", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    
    db.prepare(`
      INSERT INTO content_catalog (
        rating_key, media_type, title, genres_json, source_provenance, refreshed_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run("movie-1", "movie", "Drama Movie", JSON.stringify(["Drama"]), "plex");
    db.prepare(`
      INSERT INTO content_catalog (
        rating_key, media_type, title, genres_json, source_provenance, refreshed_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run("movie-2", "movie", "Sci-Fi Movie", JSON.stringify(["Sci-Fi"]), "plex");

    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, created_at, updated_at
      ) VALUES (1, 'movie-1', 'movie', 'Drama Movie', '2026-05-30T10:00:00.000Z', 1, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, created_at, updated_at
      ) VALUES (1, 'movie-2', 'movie', 'Sci-Fi Movie', '2026-05-30T12:00:00.000Z', 1, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, created_at, updated_at
      ) VALUES (1, 'movie-1', 'movie', 'Drama Movie', '2026-05-30T14:00:00.000Z', 0, datetime('now'), datetime('now'))
    `).run();

    const queryService = new QueryService(db);

    const completedResults = queryService.queryHistory({ user: "Tony", completed: true });
    assert.equal(completedResults.length, 2);
    assert.equal(completedResults[0].ratingKey, "movie-2");
    assert.equal(completedResults[1].ratingKey, "movie-1");

    const dramaResults = queryService.queryHistory({ user: "Tony", genre: "Drama" });
    assert.equal(dramaResults.length, 2);
    assert.equal(dramaResults[0].watchedAt, "2026-05-30T14:00:00.000Z");

    const paginatedResults = queryService.queryHistory({ user: "Tony", limit: 1, offset: 0 });
    assert.equal(paginatedResults.length, 1);
    assert.equal(paginatedResults[0].watchedAt, "2026-05-30T14:00:00.000Z");

    const paginatedResults2 = queryService.queryHistory({ user: "Tony", limit: 1, offset: 1 });
    assert.equal(paginatedResults2.length, 1);
    assert.equal(paginatedResults2[0].watchedAt, "2026-05-30T12:00:00.000Z");
  });
});

test("QueryService filters by localDay with timezone offset", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, created_at, updated_at
      ) VALUES (1, 'movie-1', 'movie', 'Movie', '2026-05-30T03:00:00.000Z', 1, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, created_at, updated_at
      ) VALUES (1, 'movie-2', 'movie', 'Movie', '2026-05-30T05:00:00.000Z', 1, datetime('now'), datetime('now'))
    `).run();

    const queryService = new QueryService(db);

    const results = queryService.queryHistory({
      user: "Tony",
      localDay: "2026-05-30",
      timezone: "-04:00"
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].ratingKey, "movie-2");
  });
});

test("QueryService throws structured validation errors", () => {
  withTestDb((db) => {
    const queryService = new QueryService(db);
    assert.throws(() => {
      queryService.queryHistory({ localDay: "invalid-date" });
    }, /Validation Error/);
  });
});

test("SummaryService aggregates playback observations into watch progress summaries", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);

    const plex = {
      getRichMetadataByRatingKey: async (ratingKey) => {
        return {
          ratingKey,
          mediaType: "show",
          title: "Mock Show",
          genres: [],
          leafCount: 10
        };
      }
    };

    db.prepare(`
      INSERT INTO content_catalog (
        rating_key, media_type, title, leaf_count, source_provenance, refreshed_at
      ) VALUES ('show-1', 'show', 'Mock Show', 10, 'plex', datetime('now'))
    `).run();

    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, grandparent_rating_key, show_title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'episode-1', 'episode', 'Episode 1', 'show-1', 'Mock Show', '2026-05-30T10:00:00.000Z', 1, 1200, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, grandparent_rating_key, show_title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'episode-2', 'episode', 'Episode 2', 'show-1', 'Mock Show', '2026-05-30T11:00:00.000Z', 0, 600, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, grandparent_rating_key, show_title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'episode-1', 'episode', 'Episode 1', 'show-1', 'Mock Show', '2026-05-30T12:00:00.000Z', 1, 1200, datetime('now'), datetime('now'))
    `).run();

    const summaryService = new SummaryService(db, plex);

    const summary = summaryService.getWatchSummary({ user: "Tony" });

    assert.equal(summary.user, "Tony");
    assert.equal(summary.totalPlaybackTimeSeconds, 3000);
    assert.equal(summary.shows.length, 1);

    const showSummary = summary.shows[0];
    assert.equal(showSummary.showTitle, "Mock Show");
    assert.equal(showSummary.distinctEpisodesWatched, 2);
    assert.equal(showSummary.completedEpisodesWatched, 1);
    assert.equal(showSummary.totalAvailableEpisodes, 10);
    assert.equal(showSummary.progressPercent, 10);
    assert.equal(showSummary.totalPlaybackTimeSeconds, 3000);
    assert.equal(showSummary.latestWatch.title, "Episode 1");
  });
});

test("SessionService groups contiguous plays and splits on gaps", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);

    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'movie-1', 'movie', 'Movie 1', '2026-05-30T10:20:00.000Z', 1, 1200, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'movie-2', 'movie', 'Movie 2', '2026-05-30T10:45:00.000Z', 1, 1200, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'movie-1', 'movie', 'Movie 1', '2026-05-30T13:30:00.000Z', 1, 1800, datetime('now'), datetime('now'))
    `).run();

    const sessionService = new SessionService(db);

    const sessions = sessionService.getViewingSessions({ user: "Tony" });
    assert.equal(sessions.length, 2);

    const session1 = sessions[0];
    const session2 = sessions[1];

    assert.equal(session1.observations.length, 1);
    assert.equal(session1.observations[0].ratingKey, "movie-1");
    assert.equal(session1.playbackDurationSeconds, 1800);

    assert.equal(session2.observations.length, 2);
    assert.equal(session2.playbackDurationSeconds, 2400);
    assert.equal(session2.sessionDurationSeconds, 2700);

    const longGapSessions = sessionService.getViewingSessions({ user: "Tony", inactivityGapHours: 3 });
    assert.equal(longGapSessions.length, 1);
    assert.equal(longGapSessions[0].observations.length, 3);
  });
});

test("SessionService merges overlapping repeat plays", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);

    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:00:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (1, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:30:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run();

    const sessionService = new SessionService(db);
    const sessions = sessionService.getViewingSessions({ user: "Tony" });

    assert.equal(sessions.length, 1);
    const session = sessions[0];
    assert.equal(session.observations.length, 2);
    assert.equal(session.playbackDurationSeconds, 5400);
    assert.equal(session.sessionDurationSeconds, 5400);
  });
});

test("CowatchingIntelligenceService infers co-watching from overlapping play times", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);

    const tonyId = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get().id;
    const viewerId = db.prepare("SELECT id FROM users WHERE plex_username = 'Viewer'").get().id;

    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (?, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:00:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run(tonyId);

    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (?, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:03:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run(viewerId);

    const service = new CowatchingIntelligenceService(db);
    const events = service.getCowatchingEvents({ days: 100 });

    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.ratingKey, "movie-1");

    const tony = event.participants.find(p => p.userId === tonyId);
    const viewer = event.participants.find(p => p.userId === viewerId);

    assert.equal(tony.role, "source");
    assert.equal(tony.evidenceState, "observed");

    assert.equal(viewer.role, "target");
    assert.equal(viewer.evidenceState, "inferred");
    assert.ok(viewer.confidence > 0.8);
    assert.ok(viewer.reason.includes("Inferred co-watching"));
  });
});

test("CowatchingIntelligenceService respects explicit Discord confirmations", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);

    const tonyId = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get().id;
    const viewerId = db.prepare("SELECT id FROM users WHERE plex_username = 'Viewer'").get().id;

    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (?, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:00:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run(tonyId);

    db.prepare(`
      INSERT INTO watch_events (
        source_user_id, rating_key, media_type, title, watched_at, prompt_status, created_at, updated_at
      ) VALUES (?, 'movie-1', 'movie', 'Movie 1', '2026-05-30T10:00:00.000Z', 'prompted', datetime('now'), datetime('now'))
    `).run(tonyId);

    const watchEventId = db.prepare("SELECT last_insert_rowid() as id").get().id;

    db.prepare(`
      INSERT INTO cowatch_confirmations (
        watch_event_id, target_user_id, status, confirmation_method, created_at, updated_at
      ) VALUES (?, ?, 'confirmed', 'discord_prompt', datetime('now'), datetime('now'))
    `).run(watchEventId, viewerId);

    db.prepare(`
      INSERT INTO users (
        plex_username, plex_user_id, display_name, enabled, created_at, updated_at
      ) VALUES ('user3', 'user3-id', 'User 3', 1, datetime('now'), datetime('now'))
    `).run();
    const user3Id = db.prepare("SELECT last_insert_rowid() as id").get().id;

    db.prepare(`
      INSERT INTO cowatch_confirmations (
        watch_event_id, target_user_id, status, confirmation_method, created_at, updated_at
      ) VALUES (?, ?, 'dismissed', 'discord_prompt', datetime('now'), datetime('now'))
    `).run(watchEventId, user3Id);

    const service = new CowatchingIntelligenceService(db);
    const events = service.getCowatchingEvents({ days: 100 });

    assert.equal(events.length, 1);
    const event = events[0];

    const viewer = event.participants.find(p => p.userId === viewerId);
    const user3 = event.participants.find(p => p.userId === user3Id);

    assert.equal(viewer.evidenceState, "confirmed");
    assert.equal(viewer.confidence, 1.0);

    assert.equal(user3.evidenceState, "dismissed");
    assert.equal(user3.confidence, 0.0);
  });
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
    break;
  }
}

if (!process.exitCode) {
  console.log(`${passed}/${tests.length} tests passed`);
}
