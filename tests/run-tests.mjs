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
import { AppError, errorResult } from "../dist/utils/errors.js";

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
      percentComplete: 95,
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
