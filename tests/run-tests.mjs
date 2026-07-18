import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { migrateDatabase, openMigratedDatabase } from "../dist/db/database.js";
import { normalizeTautulliHistoryRow } from "../dist/adapters/tautulliAdapter.js";
import { countsAsCompleted } from "../dist/watcher/watcher.js";
import { WatcherService } from "../dist/watcher/watcher.js";
import { isDuplicateWithinWindow, watchEventKey } from "../dist/watcher/dedupe.js";
import { UserService } from "../dist/service/userService.js";
import { CowatchService } from "../dist/service/cowatchService.js";
import { SyncService } from "../dist/service/syncService.js";
import { PlexAdapterError, MockPlexAdapter, parsePartFilePath } from "../dist/adapters/plexAdapter.js";
import { AppError, errorResult } from "../dist/utils/errors.js";
import { HistoryCopyService } from "../dist/service/historyCopyService.js";
import { IngestionService } from "../dist/service/ingestionService.js";
import { MetadataService } from "../dist/service/metadataService.js";
import { DashboardDetailRefreshService } from "../dist/service/dashboardDetailRefreshService.js";
import { QueryService } from "../dist/service/queryService.js";
import { SummaryService } from "../dist/service/summaryService.js";
import { SessionService } from "../dist/service/sessionService.js";
import { evaluateReplaySemantics } from "../dist/service/replaySemantics.js";
import { CowatchingIntelligenceService } from "../dist/service/cowatchingIntelligenceService.js";
import { AudiobookCatalogService, canonicalizeAudiobookSeriesTitle, isAudiobookMedia, parseAudiobookPath, parseAudnexusAsin, prepareAudiobookMetadata, normalizeAudiobookHierarchy } from "../dist/service/audiobookService.js";
import { AudiobookBackfillService } from "../dist/service/audiobookBackfillService.js";
import { AudiobookScannerService } from "../dist/service/audiobookScannerService.js";
import { AudiobookDiscoveryService } from "../dist/service/audiobookDiscoveryService.js";
import { reconcileLegacyDiscoveryOutbox } from "../dist/service/audiobookRevisionService.js";
import { AudiobookProofAdapter } from "../dist/service/audiobookProofAdapter.js";
import { AudiobookProofRuntime, AudiobookProofWorkerService } from "../dist/service/audiobookProofWorkerService.js";
import { HealthService } from "../dist/service/healthService.js";
import { DashboardService, deriveDashboardCategory } from "../dist/service/dashboardService.js";
import { AuditService } from "../dist/service/auditService.js";
import { MovieProfileAdapter } from "../dist/service/movieProfileAdapter.js";
import { MovieProfileService } from "../dist/service/movieProfileService.js";
import { DashboardPreferenceService } from "../dist/service/dashboardPreferenceService.js";
import { CowatchAdjudicationService } from "../dist/service/cowatchAdjudicationService.js";
import { buildCowatchReviewComponents, buildCowatchReviewEmbed } from "../dist/discord/prompts.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("replay semantics keep overlapping same-day observations in one session", () => {
  const observations = [
    { observedAt: "2026-07-16T10:30:00Z", localDate: "2026-07-16", completed: false, progressPercent: 30, startedAt: "2026-07-16T10:00:00Z", endedAt: "2026-07-16T10:30:00Z" },
    { observedAt: "2026-07-16T10:45:00Z", localDate: "2026-07-16", completed: false, progressPercent: 55, startedAt: "2026-07-16T10:20:00Z", endedAt: "2026-07-16T10:45:00Z" },
    { observedAt: "2026-07-16T11:00:00Z", localDate: "2026-07-16", completed: true, progressPercent: 100, startedAt: "2026-07-16T10:40:00Z", endedAt: "2026-07-16T11:00:00Z" }
  ];
  assert.deepEqual(evaluateReplaySemantics(observations), {
    observationCount: 3,
    sessionCount: 1,
    viewingDayCount: 1,
    replayCount: 0,
    replayReason: null,
    latestObservedAt: "2026-07-16T11:00:00Z"
  });
});

test("replay semantics require separate completed sessions", () => {
  const differentDays = evaluateReplaySemantics([
    { observedAt: "2026-07-15T12:00:00Z", localDate: "2026-07-15", completed: true, progressPercent: 100 },
    { observedAt: "2026-07-16T12:00:00Z", localDate: "2026-07-16", completed: true, progressPercent: 100 }
  ]);
  assert.equal(differentDays.sessionCount, 2);
  assert.equal(differentDays.viewingDayCount, 2);
  assert.equal(differentDays.replayCount, 1);
  assert.equal(differentDays.replayReason, "different_viewing_day");

  const sameDay = evaluateReplaySemantics([
    { observedAt: "2026-07-16T08:00:00Z", localDate: "2026-07-16", completed: true, progressPercent: 100 },
    { observedAt: "2026-07-16T14:00:00Z", localDate: "2026-07-16", completed: true, progressPercent: 100 }
  ]);
  assert.equal(sameDay.sessionCount, 2);
  assert.equal(sameDay.replayCount, 1);
  assert.equal(sameDay.replayReason, "same_day_completed_sessions");
});

test("replay semantics do not fabricate replays from partial or ambiguous gaps", () => {
  const partials = evaluateReplaySemantics([
    { observedAt: "2026-07-15T12:00:00Z", localDate: "2026-07-15", completed: false, progressPercent: 40 },
    { observedAt: "2026-07-16T12:00:00Z", localDate: "2026-07-16", completed: false, progressPercent: 80 }
  ]);
  assert.equal(partials.sessionCount, 2);
  assert.equal(partials.replayCount, 0);

  const oneSession = evaluateReplaySemantics([
    { observedAt: "2026-07-16T10:00:00Z", localDate: "2026-07-16", completed: true, progressPercent: 100 },
    { observedAt: "2026-07-16T10:30:00Z", localDate: "2026-07-16", completed: true, progressPercent: 100 }
  ]);
  assert.equal(oneSession.sessionCount, 1);
  assert.equal(oneSession.replayCount, 0);
});

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
    const result = fn(db, dbPath);
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
  assert.equal(libraries.length, 5);
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

test("IngestionService creates a source watch event when Tautulli returns a display name", async () => {
  await withTestDb(async (db) => {
    new UserService(db).syncConfiguredUsers([
      { plexUsername: "tonyhung", displayName: "Tony", isSourceUser: true, isTypicalCowatcher: false, enabled: true }
    ]);
    const tautulli = {
      getUsers: async () => [],
      getActivity: async () => ({ streamCount: 0 }),
      getMetadata: async (ratingKey) => ({ ratingKey, title: "" }),
      getRecentHistory: async ({ user }) => [{
        user: user === "tonyhung" ? "Tony" : user,
        ratingKey: "episode-display-name",
        mediaType: "episode",
        title: "Ted and Mary",
        watchedAt: new Date().toISOString(),
        percentComplete: 100
      }]
    };

    const result = await new IngestionService(db, tautulli).pollRecentHistory();

    assert.equal(result.inserted, 1);
    const event = db.prepare("SELECT rating_key, prompt_status FROM watch_events").get();
    assert.equal(event.rating_key, "episode-display-name");
    assert.equal(event.prompt_status, "pending");
  });
});


test("IngestionService promotes an existing completed playback observation into a watch event", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const watchedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, created_at, updated_at
      ) VALUES (1, 'movie-regression', 'movie', 'The Movie', ?, 1, datetime('now'), datetime('now'))
    `).run(watchedAt);

    const row = {
      user: "Tony",
      ratingKey: "movie-regression",
      mediaType: "movie",
      title: "The Movie",
      watchedAt,
      percentComplete: 95
    };

    const result = new IngestionService(db, {
      getUsers: async () => [],
      getActivity: async () => ({ streamCount: 0 }),
      getMetadata: async (ratingKey) => ({ ratingKey, title: "" }),
      getRecentHistory: async () => [row]
    }).ingestRow(1, row);

    assert.equal(result.inserted, false);
    assert.equal(typeof result.watchEventId, "number");
    const event = db.prepare("SELECT rating_key, prompt_status FROM watch_events").get();
    assert.equal(event.rating_key, "movie-regression");
    assert.equal(event.prompt_status, "pending");
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

test("dashboard detail refresh is title-scoped, confirmed, coalesced, and revision-stable", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (1,'refresh-movie','movie','Movies','Before Refresh',?,100,7200000,1,?,?)`).run(now, now, now);
    db.prepare(`INSERT INTO content_catalog
      (rating_key,guid,media_type,title,duration,library_title,genres_json,source_provenance,refreshed_at)
      VALUES ('refresh-movie','plex://movie/refresh','movie','Before Refresh',7200000,'Movies','[]','fixture',?)`).run(now);

    let calls = 0;
    let responseTitle = "After Refresh";
    let responsePoster = "data:image/svg+xml;utf8,REFRESH-ONE";
    const plex = {
      getUsers: async () => [],
      getWatchedState: async () => ({ watched: false, source: "mock" }),
      markWatched: async () => ({ ok: true, status: "mocked" }),
      listLibraries: async () => [],
      listShows: async () => [],
      getRichMetadataByRatingKey: async (ratingKey) => {
        calls++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          ratingKey,
          guid: "plex://movie/refresh",
          mediaType: "movie",
          title: responseTitle,
          duration: 7200000,
          librarySectionID: "1",
          librarySectionTitle: "Movies",
          genres: ["Drama"],
          thumb: responsePoster,
          art: responsePoster
        };
      }
    };
    const dashboard = new DashboardService(db);
    const refresh = new DashboardDetailRefreshService(db, dashboard, plex, new AuditService(db));

    const dryRun = await refresh.refresh("movie:refresh-movie", { apply: false, confirm: false });
    assert.equal(dryRun.ok, true);
    assert.equal(dryRun.data.dryRun, true);
    assert.equal(calls, 0);

    const denied = await refresh.refresh("movie:refresh-movie", { apply: true, confirm: false });
    assert.equal(denied.ok, false);
    assert.equal(denied.errorCode, "CONFIRMATION_REQUIRED");

    const [first, coalesced] = await Promise.all([
      refresh.refresh("movie:refresh-movie", { apply: true, confirm: true }),
      refresh.refresh("movie:refresh-movie", { apply: true, confirm: true })
    ]);
    assert.equal(first.ok, true);
    assert.equal(coalesced.ok, true);
    assert.equal(calls, 1);
    assert.equal(first.data.metadataChanged, true);
    assert.equal(first.data.artworkChanged, true);
    assert.equal(first.data.workspace.title, "After Refresh");
    const firstRevision = first.data.artworkRevision;

    const unchanged = await refresh.refresh("movie:refresh-movie", { apply: true, confirm: true });
    assert.equal(unchanged.ok, true);
    assert.equal(unchanged.data.status, "unchanged");
    assert.equal(unchanged.data.artworkChanged, false);
    assert.equal(unchanged.data.artworkRevision, firstRevision);
    assert.equal(calls, 2);

    responseTitle = "Changed Again";
    responsePoster = "data:image/svg+xml;utf8:REFRESH-TWO";
    const changedAgain = await refresh.refresh("movie:refresh-movie", { apply: true, confirm: true });
    assert.equal(changedAgain.ok, true);
    assert.equal(changedAgain.data.status, "refreshed");
    assert.equal(changedAgain.data.artworkChanged, true);
    assert.notEqual(changedAgain.data.artworkRevision, firstRevision);
    assert.ok(db.prepare("SELECT id FROM audit_log WHERE action = 'dashboard_detail_refresh' AND status = 'ok'").get());
  });
});

test("dashboard detail refresh preserves the usable workspace on Plex failure", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (1,'refresh-failure','movie','Movies','Stable Movie',?,100,7200000,1,?,?)`).run(now, now, now);
    db.prepare(`INSERT INTO content_catalog
      (rating_key,media_type,title,duration,library_title,genres_json,source_provenance,refreshed_at)
      VALUES ('refresh-failure','movie','Stable Movie',7200000,'Movies','[]','fixture',?)`).run(now);
    const plex = {
      getRichMetadataByRatingKey: async () => { throw new Error("private upstream failure"); }
    };
    const refresh = new DashboardDetailRefreshService(db, new DashboardService(db), plex, new AuditService(db));
    const result = await refresh.refresh("movie:refresh-failure", { apply: true, confirm: true });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "DETAIL_REFRESH_FAILED");
    assert.equal(result.priorAvailable, true);
    assert.equal(db.prepare("SELECT title FROM content_catalog WHERE rating_key = 'refresh-failure'").get().title, "Stable Movie");
    const audit = db.prepare("SELECT payload_json, error FROM audit_log WHERE action = 'dashboard_detail_refresh' ORDER BY id DESC LIMIT 1").get();
    assert.doesNotMatch(audit.payload_json, /private upstream failure|token|file/i);
    assert.equal(audit.error, "METADATA_REFRESH_FAILED");
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

test("CowatchingIntelligenceService handles non-qualifying overlap, missing timing, and three-person fixtures", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);

    const tonyId = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get().id;
    const viewerId = db.prepare("SELECT id FROM users WHERE plex_username = 'Viewer'").get().id;

    db.prepare(`
      INSERT INTO users (
        plex_username, plex_user_id, display_name, enabled, created_at, updated_at
      ) VALUES ('user3', 'user3-id', 'User 3', 1, datetime('now'), datetime('now'))
    `).run();
    const user3Id = db.prepare("SELECT last_insert_rowid() as id").get().id;

    // Tony watches at 11:00 (duration 3600 -> starts 10:00)
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (?, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:00:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run(tonyId);

    // Viewer watches at 11:30 (starts 10:30, gap = 30m > 15m) -> non-qualifying
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (?, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:30:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run(viewerId);

    // User 3 watches at 11:05 (duration 3600 -> starts 10:05, gap = 5m, overlap = 55m) -> qualifying!
    db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, title, watched_at, completed, duration, created_at, updated_at
      ) VALUES (?, 'movie-1', 'movie', 'Movie 1', '2026-05-30T11:05:00.000Z', 1, 3600, datetime('now'), datetime('now'))
    `).run(user3Id);

    const service = new CowatchingIntelligenceService(db);
    const events = service.getCowatchingEvents({ days: 100 });

    // There should be 1 event (Tony & User 3). Viewer is not qualifying so they shouldn't be in the participants list.
    assert.equal(events.length, 1);
    const event = events[0];
    
    const tony = event.participants.find(p => p.userId === tonyId);
    const viewer = event.participants.find(p => p.userId === viewerId);
    const user3 = event.participants.find(p => p.userId === user3Id);

    assert.ok(tony);
    assert.ok(user3);
    assert.ok(!viewer); // Viewer should be filtered out because they did not qualify

    assert.equal(user3.evidenceState, "inferred");
    assert.equal(user3.timingRelationship.startGapMinutes, 5);
  });
});

test("Plex audiobook metadata extracts and unescapes the first Part file path", () => {
  const xml = '<Track title="Chapter"><Media><Part file="F:\\Audiobooks\\Tom &amp; Jerry\\Book\\01.mp3" /></Media></Track>';
  assert.equal(parsePartFilePath(xml), "F:\\Audiobooks\\Tom & Jerry\\Book\\01.mp3");
  assert.equal(parsePartFilePath('<Track title="No media" />'), undefined);
});

test("audiobook path parsing handles author/book, series, separators, and malformed paths", () => {
  const series = parseAudiobookPath("F:\\Media\\Audiobooks\\Robert Jordan\\The Wheel of Time\\2021 - The Eye of the World\\pt01.mp3");
  assert.equal(series.author, "Robert Jordan");
  assert.equal(series.seriesTitle, "The Wheel of Time");
  assert.equal(series.bookTitle, "2021 - The Eye of the World");

  const standalone = parseAudiobookPath("/media/Audiobooks/James Clear/Atomic Habits/01.mp3");
  assert.equal(standalone.author, "James Clear");
  assert.equal(standalone.seriesTitle, undefined);
  assert.equal(parseAudiobookPath("/media/music/loose.mp3"), undefined);
});



test("Wheel of Time series labels normalize to one canonical title", async () => {
  await withTestDb(async (db) => {
    const catalog = new AudiobookCatalogService(db);
    const base = {
      mediaType: "track",
      duration: 1_200_000,
      librarySectionTitle: "Audiobooks",
      genres: []
    };
    catalog.ensureLocalBook({
      metadata: {
        ratingKey: "book-1",
        title: "Book 1",
        mediaType: "audiobook",
        parentTitle: "Book 1",
        grandparentTitle: "Wheel of Time"
      },
      identity: {
        folderKey: "key-1",
        author: "Robert Jordan",
        seriesTitle: "Wheel of Time",
        bookTitle: "Book 1",
        folderPathHint: "F:\Audiobooks\Robert Jordan\Wheel of Time\Book 1"
      }
    });
    catalog.ensureLocalBook({
      metadata: {
        ratingKey: "book-2",
        title: "Book 2",
        mediaType: "audiobook",
        parentTitle: "Book 2",
        grandparentTitle: "The Wheel of Time"
      },
      identity: {
        folderKey: "key-2",
        author: "Robert Jordan",
        seriesTitle: "The Wheel of Time",
        bookTitle: "Book 2",
        folderPathHint: "F:\Audiobooks\Robert Jordan\The Wheel of Time\Book 2"
      }
    });

    const rows = db.prepare("SELECT DISTINCT series_title FROM audiobook_books ORDER BY series_title").all();
    assert.deepEqual(rows.map((row) => row.series_title), ["Wheel of Time"]);
    assert.equal(canonicalizeAudiobookSeriesTitle("The Wheel of Time"), "Wheel of Time");
    assert.equal(canonicalizeAudiobookSeriesTitle("Wheel of Time"), "Wheel of Time");
  });
});
test("audiobook classification normalizes duration units and parses exact Audnexus ASINs", () => {
  assert.equal(isAudiobookMedia({ mediaType: "track", duration: 1_200_000 }), true);
  assert.equal(isAudiobookMedia({ mediaType: "track", duration: 240_000 }), false);
  assert.equal(isAudiobookMedia({ mediaType: "track", libraryName: "Audiobooks" }), true);
  assert.equal(isAudiobookMedia({ mediaType: "movie", duration: 7_200_000 }), false);
  assert.equal(parseAudnexusAsin("com.plexapp.agents.audnexus://B07286JWD3_ca/item"), "B07286JWD3");
  assert.equal(parseAudnexusAsin("local://123"), undefined);
});

test("MetadataService overrides audiobook hierarchy and reuses one canonical folder book", async () => {
  await withTestDb(async (db) => {
    const paths = {
      "track-1": "F:\\Media\\Audiobooks\\Robert Jordan\\Wheel of Time\\The Eye of the World\\01.mp3",
      "track-2": "F:\\Media\\Audiobooks\\Robert Jordan\\Wheel of Time\\The Eye of the World\\02.mp3"
    };
    const plex = {
      getRichMetadataByRatingKey: async (ratingKey) => ({
        ratingKey,
        guid: `local://${ratingKey}`,
        mediaType: "track",
        title: ratingKey,
        duration: 1_200_000,
        librarySectionTitle: "Audiobooks",
        genres: [],
        parentTitle: "Mega Album",
        grandparentTitle: "Various Artists",
        filePath: paths[ratingKey]
      })
    };
    const service = new MetadataService(db, plex);
    const first = await service.refreshMetadata("track-1");
    const second = await service.refreshMetadata("track-2");

    assert.equal(first.parentTitle, "The Eye of the World");
    assert.equal(first.grandparentTitle, "Wheel of Time");
    assert.equal(first.audiobookId, second.audiobookId);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_books").get().count, 1);
    assert.equal(db.prepare("SELECT file_path FROM content_catalog WHERE rating_key = 'track-1'").get().file_path, paths["track-1"]);
    const aggregates = db.prepare("SELECT chapter_count, total_duration_seconds FROM audiobook_books WHERE id = ?").get(first.audiobookId);
    assert.equal(aggregates.chapter_count, 2);
    assert.equal(aggregates.total_duration_seconds, 2400);
  });
});

test("audiobook enrichment accepts exact matches and rejects ambiguous Google results", async () => {
  await withTestDb(async (db) => {
    const prepared = prepareAudiobookMetadata({
      ratingKey: "local-1",
      mediaType: "track",
      title: "Part 1",
      duration: 1_200_000,
      librarySectionTitle: "Audiobooks",
      genres: [],
      filePath: "F:\\Audiobooks\\James Clear\\Atomic Habits\\01.mp3"
    });
    const exactFetch = async () => new Response(JSON.stringify({
      items: [{ id: "google-1", volumeInfo: { title: "Atomic Habits", authors: ["James Clear"], categories: ["Self-Help"], language: "en" } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
    const catalog = new AudiobookCatalogService(db, exactFetch);
    const id = catalog.ensureLocalBook(prepared);
    const exact = await catalog.enrichBook(id, true);
    assert.deepEqual(exact, { status: "enriched", provenance: "google_books" });
    assert.equal(db.prepare("SELECT google_books_id FROM audiobook_books WHERE id = ?").get(id).google_books_id, "google-1");

    const second = prepareAudiobookMetadata({ ...prepared.metadata, ratingKey: "local-2", filePath: "F:\\Audiobooks\\Someone Else\\Different Book\\01.mp3" });
    const secondId = catalog.ensureLocalBook(second);
    const ambiguous = await catalog.enrichBook(secondId, false);
    assert.equal(ambiguous.status, "pending");
  });
});

test("audiobook migration is repeatable and does not denormalize onto observations", () => {
  return withTestDb((db) => {
    migrateDatabase(db);
    migrateDatabase(db);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 5").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 7").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 13").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 14").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 15").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 16").get().count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 17").get().count, 1);
    const catalogColumns = db.prepare("PRAGMA table_info(content_catalog)").all().map((column) => column.name);
    const bookColumns = db.prepare("PRAGMA table_info(audiobook_books)").all().map((column) => column.name);
    const observationColumns = db.prepare("PRAGMA table_info(playback_observations)").all().map((column) => column.name);
    assert.equal(catalogColumns.includes("file_path"), true);
    assert.equal(catalogColumns.includes("audiobook_id"), true);
    assert.equal(catalogColumns.includes("last_seen_at"), true);
    assert.equal(bookColumns.includes("parent_series_title"), true);
    assert.equal(bookColumns.includes("subseries_title"), true);
    assert.equal(bookColumns.includes("related_work_classification"), true);
    assert.equal(bookColumns.includes("hierarchy_provenance"), true);
    assert.equal(bookColumns.includes("identity_status"), true);
    assert.equal(bookColumns.includes("current_media_revision"), true);
    assert.equal(bookColumns.includes("active_chapter_revision_id"), true);
    assert.ok(db.prepare("SELECT id FROM audiobook_discovery_state WHERE id = 1").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_discovery_outbox'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_media_revisions'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_chapter_revisions'").get());
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'audiobook_proof_jobs'").get());
    assert.equal(observationColumns.includes("audiobook_id"), false);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  });
});


test("audiobook backfill skips dead Plex references without failing the batch", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const userId = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get().id;
    db.prepare("INSERT INTO playback_observations (user_id, rating_key, plex_guid, media_type, library_name, title, watched_at, completed, duration, created_at, updated_at) VALUES (?, 'dead-1', 'plex://track/dead', 'track', 'Audiobooks', 'Dead Track', datetime('now'), 1, 1200000, datetime('now'), datetime('now'))").run(userId);

    const plex = {
      getRichMetadataByRatingKey: async () => {
        throw new PlexAdapterError("PLEX_NO_MATCHING_MEDIA", "No matching Plex media was found for the rating key.", "no_matching_media");
      }
    };
    const backfill = new AudiobookBackfillService(db, plex);
    const result = await backfill.run({ mode: "local" });

    assert.equal(result.ok, true);
    assert.equal(result.pending, 1);
    assert.equal(result.errors.length, 0);
    assert.equal(result.deadReferences.length, 1);
    assert.equal(result.deadReferences[0].reason, "no_matching_media");
  });
});test("audiobook backfill dry-run is pure and apply creates a backup and resumable state", async () => {
  await withTestDb(async (db, dbPath) => {
    seedUsers(db);
    const userId = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get().id;
    db.prepare(`INSERT INTO playback_observations (
      user_id, rating_key, plex_guid, media_type, library_name, title, watched_at, completed, duration, created_at, updated_at
    ) VALUES (?, 'audio-1', 'com.plexapp.agents.audnexus://B07286JWD3_ca/item', 'track', 'Music', 'Part 1', datetime('now'), 1, 1200000, datetime('now'), datetime('now'))`).run(userId);
    const plex = {
      getRichMetadataByRatingKey: async () => ({
        ratingKey: "audio-1",
        guid: "local://audio-1",
        mediaType: "track",
        title: "Part 1",
        duration: 1_200_000,
        librarySectionTitle: "Audiobooks",
        genres: [],
        filePath: "F:\\Audiobooks\\Author\\Series\\Book\\01.mp3"
      })
    };
    const backfill = new AudiobookBackfillService(db, plex, dbPath);
    const preview = await backfill.run({ mode: "local", batchSize: 10 });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.matched, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM content_catalog").get().count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_log WHERE action LIKE 'audiobook_backfill_%'").get().count, 0);

    const applied = await backfill.run({ mode: "local", apply: true, confirm: true, batchSize: 10 });
    assert.equal(applied.backupCreated, true);
    assert.equal(applied.linked, 1);
    assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'audiobook_backfill_cursor_local'").get().value, "audio-1");
    assert.equal(fs.readdirSync(path.join(path.dirname(dbPath), "backups")).length, 1);
  });
});

test("audiobook hierarchy normalizer correctly maps Discworld, Mistborn, and Wheel of Time", () => {
  // Discworld
  const watch = normalizeAudiobookHierarchy("Guards! Guards!", "Terry Pratchett");
  assert.equal(watch.parentSeriesTitle, "Discworld");
  assert.equal(watch.subseriesTitle, "Ankh-Morpork City Watch");
  assert.equal(watch.hierarchyProvenance, "mapping");

  const death = normalizeAudiobookHierarchy("Mort (Audiobook)", "Terry Pratchett");
  assert.equal(death.parentSeriesTitle, "Discworld");
  assert.equal(death.subseriesTitle, "Death");

  const standaloneDiscworld = normalizeAudiobookHierarchy("Small Gods", "Terry Pratchett");
  assert.equal(standaloneDiscworld.parentSeriesTitle, "Discworld");
  assert.equal(standaloneDiscworld.subseriesTitle, undefined);

  // Mistborn
  const era1 = normalizeAudiobookHierarchy("The Final Empire", "Brandon Sanderson");
  assert.equal(era1.parentSeriesTitle, "Mistborn");
  assert.equal(era1.subseriesTitle, "Era 1");
  assert.equal(era1.relatedWorkClassification, undefined);

  const era2 = normalizeAudiobookHierarchy("The Alloy of Law", "Brandon Sanderson");
  assert.equal(era2.parentSeriesTitle, "Mistborn");
  assert.equal(era2.subseriesTitle, "Wax and Wayne");

  const companion = normalizeAudiobookHierarchy("Mistborn: Secret History", "Brandon Sanderson");
  assert.equal(companion.parentSeriesTitle, "Mistborn");
  assert.equal(companion.subseriesTitle, undefined);
  assert.equal(companion.relatedWorkClassification, "companion");

  // Wheel of Time
  const wot = normalizeAudiobookHierarchy("The Eye of the World", "Robert Jordan", "The Wheel of Time");
  assert.equal(wot.parentSeriesTitle, "Wheel of Time");
  assert.equal(wot.subseriesTitle, undefined);

  // Conservative Pattern Fallback
  const pattern = normalizeAudiobookHierarchy("Some Random Book", "Some Author", "My Cool Series");
  assert.equal(pattern.parentSeriesTitle, "My Cool Series");
  assert.equal(pattern.hierarchyProvenance, "pattern");

  // Unset
  const none = normalizeAudiobookHierarchy("Some Random Book", "Some Author");
  assert.equal(none.hierarchyProvenance, "none");
});

test("audiobook hierarchy backfill dry-run proposes changes and apply writes transactionally", async () => {
  await withTestDb(async (db, dbPath) => {
    migrateDatabase(db);
    seedUsers(db);

    const now = new Date().toISOString();
    // Seed books with hierarchy_provenance = 'none'
    db.prepare(`
      INSERT INTO audiobook_books (folder_key, title, authors_json, narrators_json, series_title, genres_json, source_provenance, enrichment_status, created_at, updated_at)
      VALUES 
        ('disc-1', 'Guards! Guards!', '["Terry Pratchett"]', '[]', 'Discworld', '[]', 'folder_path', 'pending', ?, ?),
        ('mist-1', 'The Final Empire', '["Brandon Sanderson"]', '[]', 'Mistborn', '[]', 'folder_path', 'pending', ?, ?),
        ('wot-1', 'The Eye of the World', '["Robert Jordan"]', '[]', 'Wheel of Time', '[]', 'folder_path', 'pending', ?, ?)
    `).run(now, now, now, now, now, now);

    const plex = {};
    const backfill = new AudiobookBackfillService(db, plex, dbPath);

    // Dry Run
    const preview = await backfill.run({ mode: "hierarchy" });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.matched, 3); // 3 proposed
    assert.equal(preview.linked, 0);   // 0 unchanged
    assert.equal(preview.hierarchyDetails.length, 3);
    assert.equal(preview.hierarchyDetails.every(d => d.status === "proposed"), true);

    // Ensure DB is not updated
    const countNone = db.prepare("SELECT COUNT(*) as count FROM audiobook_books WHERE hierarchy_provenance IS NULL OR hierarchy_provenance = 'none'").get().count;
    assert.equal(countNone, 3);

    // Apply Run
    const applied = await backfill.run({ mode: "hierarchy", apply: true, confirm: true });
    assert.equal(applied.matched, 3);
    assert.equal(applied.dryRun, false);

    // Ensure DB is updated
    const countMapping = db.prepare("SELECT COUNT(*) as count FROM audiobook_books WHERE hierarchy_provenance = 'mapping'").get().count;
    assert.equal(countMapping, 3);

    const discDetail = db.prepare("SELECT * FROM audiobook_books WHERE folder_key = 'disc-1'").get();
    assert.equal(discDetail.parent_series_title, "Discworld");
    assert.equal(discDetail.subseries_title, "Ankh-Morpork City Watch");

    // Re-run should report as unchanged (linked)
    const rerun = await backfill.run({ mode: "hierarchy" });
    assert.equal(rerun.matched, 0);
    assert.equal(rerun.linked, 3); // 3 unchanged
  });
});

test("AudiobookScannerService scans library and indexes tracks", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    
    // We will pass MockPlexAdapter
    const plex = new MockPlexAdapter();
    const scanner = new AudiobookScannerService(db, plex, async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } })
    );
    
    const result = await scanner.scanLibrary("Audiobooks");
    assert.equal(result.ok, true);
    assert.equal(result.scanned, 1);
    assert.equal(result.added, 1);
    
    // Verify book is created in db
    const book = db.prepare("SELECT * FROM audiobook_books WHERE title LIKE '%Guards! Guards%'").get();
    assert.ok(book);
    assert.equal(book.parent_series_title, "Discworld");
    assert.equal(book.subseries_title, "Ankh-Morpork City Watch");
  });
});

test("audiobook discovery ingests rich list metadata without N+1 Plex reads and deduplicates revisions", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    class CountingPlexAdapter extends MockPlexAdapter {
      metadataCalls = 0;
      duration = 1_200_000;
      reverse = false;
      async getRichMetadataByRatingKey(ratingKey, plexGuid) {
        this.metadataCalls++;
        return super.getRichMetadataByRatingKey(ratingKey, plexGuid);
      }
      async listLibraryTracks(libraryKey) {
        const tracks = await super.listLibraryTracks(libraryKey);
        const first = { ...tracks[0], guid: "plex://track/stable-1", duration: this.duration };
        const second = {
          ...tracks[0],
          ratingKey: "mock-track-2",
          title: "Part 2",
          guid: "plex://track/stable-2",
          duration: this.duration,
          filePath: "F:\\Media\\Audio\\Audiobooks\\Terry Pratchett   Narrated by\\2023 - Guards! Guards!\\02.mp3"
        };
        return this.reverse ? [second, first] : [first, second];
      }
    }
    const plex = new CountingPlexAdapter();
    let providerCalls = 0;
    const fetcher = async () => {
      providerCalls++;
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const scanner = new AudiobookScannerService(db, plex, fetcher);
    const now = new Date("2026-07-11T12:00:00.000Z");

    const first = await scanner.scanLibrary("Audiobooks", { trigger: "manual", now });
    assert.equal(first.booksNew, 1);
    assert.equal(first.outboxEnqueued, 1);
    assert.equal(plex.metadataCalls, 0);
    assert.equal(providerCalls, 1);
    const firstManifest = db.prepare("SELECT * FROM audiobook_media_revisions").get();
    assert.ok(firstManifest);
    assert.equal(firstManifest.track_count, 2);
    assert.equal(firstManifest.file_count, 2);
    assert.equal(firstManifest.manifest_status, "unsupported_multi_file");
    const firstItems = db.prepare(`
      SELECT item_order, stable_identity, duration_ms, private_file_path, path_hash
      FROM audiobook_media_revision_items ORDER BY item_order
    `).all();
    assert.equal(firstItems.length, 2);
    assert.equal(firstItems.every((item) => item.private_file_path && item.path_hash), true);
    assert.equal(db.prepare("SELECT manifest_status FROM audiobook_discovery_outbox").get().manifest_status,
      "unsupported_multi_file");

    plex.reverse = true;
    const second = await scanner.scanLibrary("Audiobooks", { trigger: "interval", now: new Date(now.getTime() + 60_000) });
    assert.equal(second.booksNew, 0);
    assert.equal(second.booksAlreadyKnown, 1);
    assert.equal(second.outboxEnqueued, 0);
    assert.equal(providerCalls, 1, "enrichment cooldown should suppress immediate provider retries");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_media_revisions").get().count, 1);
    assert.deepEqual(db.prepare(`
      SELECT item_order, stable_identity, duration_ms, private_file_path, path_hash
      FROM audiobook_media_revision_items ORDER BY item_order
    `).all(), firstItems, "later scan order must not mutate an immutable manifest");

    plex.duration = 1_260_000;
    const changed = await scanner.scanLibrary("Audiobooks", { trigger: "interval", now: new Date(now.getTime() + 120_000) });
    assert.equal(changed.booksChanged, 1);
    assert.equal(changed.outboxEnqueued, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_discovery_outbox").get().count, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_media_revisions").get().count, 2);
  });
});

test("legacy audiobook discovery outbox rows become safe terminal classifications", async () => {
  await withTestDb(async (db) => {
    db.prepare(`
      INSERT INTO audiobook_books
        (id, folder_key, title, source_provenance, enrichment_status, identity_status,
         current_media_revision, created_at, updated_at)
      VALUES (90, 'legacy-outbox', 'Legacy Outbox', 'fixture', 'enriched', 'identified',
        'current-revision', '2026-07-11T00:00:00Z', '2026-07-11T00:00:00Z')
    `).run();
    db.prepare(`
      INSERT INTO audiobook_discovery_outbox
        (audiobook_id, media_revision, trigger_reason, created_at)
      VALUES (90, 'older-revision', 'interval', '2026-07-11T00:00:00Z')
    `).run();
    reconcileLegacyDiscoveryOutbox(db, "2026-07-12T00:00:00Z");
    const row = db.prepare("SELECT * FROM audiobook_discovery_outbox WHERE audiobook_id = 90").get();
    assert.equal(row.manifest_status, "superseded");
    assert.equal(row.safe_outcome_code, "SUPERSEDED_REVISION");
    assert.equal(row.consumed_at, "2026-07-12T00:00:00Z");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_media_revisions").get().count, 0);
  });
});

test("audiobook discovery coordinator persists cooldown and restart-safe lease decisions", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const fetcher = async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } });
    const discovery = new AudiobookDiscoveryService(db, new MockPlexAdapter(), fetcher, 360);
    const now = new Date("2026-07-11T12:00:00.000Z");

    const first = await discovery.run("startup", { now, force: true });
    assert.equal(first.status, "succeeded");
    const cooldown = await discovery.run("startup", { now: new Date(now.getTime() + 60_000) });
    assert.equal(cooldown.status, "skipped");
    assert.equal(cooldown.reason, "cooldown");

    db.prepare(`
      UPDATE audiobook_discovery_state
      SET lease_owner = 'other-process', lease_expires_at = ?
      WHERE id = 1
    `).run(new Date(now.getTime() + 30 * 60_000).toISOString());
    const held = await discovery.run("manual", { now: new Date(now.getTime() + 120_000) });
    assert.equal(held.status, "skipped");
    assert.equal(held.reason, "lease_held");

    db.prepare("UPDATE audiobook_discovery_state SET lease_expires_at = ? WHERE id = 1")
      .run(new Date(now.getTime() - 60_000).toISOString());
    const recovered = await discovery.run("manual", { now: new Date(now.getTime() + 180_000) });
    assert.equal(recovered.status, "succeeded");
    assert.equal(db.prepare("SELECT lease_owner FROM audiobook_discovery_state WHERE id = 1").get().lease_owner, null);
  });
});

test("audiobook identity conflicts preserve separate local editions and never merge by title", async () => {
  await withTestDb(async (db) => {
    const metadata = new MetadataService(db, new MockPlexAdapter());
    const base = {
      mediaType: "audiobook",
      title: "Part 1",
      duration: 1_200_000,
      librarySectionID: "5",
      librarySectionTitle: "Audiobooks",
      genres: [],
      guid: "audnexus://B000000001"
    };
    metadata.ingestRichMetadata({
      ...base,
      ratingKey: "edition-a-track",
      parentGuid: "local://edition-a",
      parentTitle: "Shared Title",
      filePath: "F:\\Audiobooks\\Author One\\Shared Title\\01.mp3"
    });
    metadata.ingestRichMetadata({
      ...base,
      ratingKey: "edition-b-track",
      parentGuid: "local://edition-b",
      parentTitle: "Shared Title",
      filePath: "F:\\Audiobooks\\Author Two\\Shared Title\\01.mp3"
    });

    const books = db.prepare("SELECT asin, identity_status FROM audiobook_books ORDER BY id").all();
    assert.equal(books.length, 2);
    assert.equal(books.filter((book) => book.asin === "B000000001").length, 1);
    assert.equal(books.every((book) => book.identity_status === "conflict"), true);
  });
});

test("audiobook item discovery repairs a stale rating key through its stored Plex GUID", async () => {
  await withTestDb(async (db) => {
    class GuidRepairPlexAdapter extends MockPlexAdapter {
      async getRichMetadataByRatingKey(ratingKey, plexGuid) {
        assert.equal(ratingKey, "stale-track");
        assert.equal(plexGuid, "plex://track/stable-guid");
        return {
          ratingKey: "active-track",
          guid: plexGuid,
          mediaType: "audiobook",
          title: "Part 1",
          duration: 1_200_000,
          librarySectionID: "5",
          librarySectionTitle: "Audiobooks",
          parentGuid: "local://stable-book",
          parentTitle: "Stable Book",
          genres: [],
          filePath: "F:\\Audiobooks\\Stable Author\\Stable Book\\01.mp3"
        };
      }
    }
    const discovery = new AudiobookDiscoveryService(db, new GuidRepairPlexAdapter(), async () =>
      new Response(JSON.stringify({ items: [] }), { status: 200 })
    );
    const result = await discovery.run("webhook-item", {
      ratingKey: "stale-track",
      plexGuid: "plex://track/stable-guid",
      library: "Audiobooks",
      now: new Date("2026-07-11T12:00:00.000Z")
    });
    assert.equal(result.status, "succeeded");
    assert.ok(db.prepare("SELECT rating_key FROM content_catalog WHERE rating_key = 'active-track'").get());
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_discovery_outbox").get().count, 0);
  });
});

test("Plex webhook endpoint accepts multipart/form-data and processes tracks in background", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    
    // Import server createApp
    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db, new MockPlexAdapter(), { skipStartupUserSync: true });
    
    // Start local server on random port
    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = server.address().port;
    
    try {
      const payload = {
        event: "library.new",
        Metadata: {
          librarySectionTitle: "Audiobooks",
          type: "track",
          ratingKey: "mock-track-1",
          guid: "plex://track/123"
        }
      };
      
      const response = await fetch(`http://127.0.0.1:${port}/webhooks/plex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      assert.equal(response.status, 202);
      const resJson = await response.json();
      assert.equal(resJson.ok, true);
      
      // Poll database for up to 2 seconds to wait for async processing to complete
      let row;
      for (let i = 0; i < 20; i++) {
        row = db.prepare("SELECT * FROM content_catalog WHERE rating_key = 'mock-track-1'").get();
        if (row) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(row);
      assert.equal(row.title, "Part 1");
      
      // Verify book is created
      const book = db.prepare("SELECT * FROM audiobook_books WHERE title LIKE '%Guards! Guards%'").get();
      assert.ok(book);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_discovery_outbox").get().count, 0);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});


test("dashboard category model distinguishes the supported media families", () => {
  assert.equal(deriveDashboardCategory("movie", "Movies").category, "movie");
  assert.equal(deriveDashboardCategory("movie", "Workouts").category, "other");
  assert.equal(deriveDashboardCategory("movie", "Anime Movies").category, "anime");
  assert.equal(deriveDashboardCategory("episode", "Classic TV").category, "classic_tv");
  assert.equal(deriveDashboardCategory("episode", "Anime").category, "anime");
  assert.equal(deriveDashboardCategory("track", "Audiobooks").category, "audiobook");
  assert.equal(deriveDashboardCategory("track", "").category, "other");
  assert.equal(deriveDashboardCategory("audiobook", "").category, "audiobook");
  assert.equal(deriveDashboardCategory("episode", "TV Shows").category, "tv");
  assert.equal(deriveDashboardCategory("track", "Audiobooks").derived, false);
  assert.equal(deriveDashboardCategory("episode", "Anime").derived, false);
  assert.equal(deriveDashboardCategory("episode", "Classic TV").derived, false);
});

test("dashboard service returns bounded mixed-media data and honest progress", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users WHERE enabled = 1 ORDER BY id").all();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const now = new Date().toISOString();
    insert.run(users[0].id,"movie-1","movie","Movies","Moonrise",null,now,100,7200000,1,now,now);
    insert.run(users[1].id,"anime-1","episode","Anime","Episode 1","Skyward",now,73,1500000,0,now,now);
    insert.run(users[0].id,"book-1","track","Audiobooks","The Long Book","Author Name",now,35,1800000,0,now,now);
    const indexes=db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_playback_dashboard_%'").all();
    assert.ok(indexes.length >= 3);
    const service = new DashboardService(db);
    const overview = service.getOverview({});
    assert.equal(overview.totals.plays, 3);
    assert.equal(overview.totals.minutes, 175);
    assert.equal(typeof overview.timingMs, "number");
    assert.equal(overview.summaryStrip.length, 5);
    assert.equal(overview.summaryStrip.some(x => x.category === "movie"), true);
    assert.equal(overview.summaryStrip.find(x => x.category === "movie").minutes, 120);
    assert.equal(overview.summaryStrip.find(x => x.category === "anime").minutes, 25);
    assert.equal(overview.windows.continueWatching, "Recent incomplete playback from the last 30 days");
    assert.ok(overview.categories.some(x => x.category === "movie"));
    assert.ok(overview.categories.some(x => x.category === "anime"));
    assert.ok(overview.categories.some(x => x.category === "audiobook"));
    assert.equal(overview.categoryMix.find(x => x.category === "movie").durationMinutes, 120);
    assert.equal(overview.categoryMix.find(x => x.category === "anime").durationMinutes, 25);
    assert.equal(overview.recentlyCompleted.length, 1);
    assert.equal(overview.householdActivity.length, 2);
    assert.equal(Array.isArray(overview.needsAttention), true);
    assert.equal(service.getActivity({limit:1}).items.length, 1);
    assert.equal(service.getActivity({limit:5000}).limit, 1000);
    assert.equal(service.getActivity({category:"anime"}).total, 1);
    assert.equal(service.getPeople({}).people.length, users.length);
    assert.equal(service.getTimeline({ days: 30 }).windowDays, 7);
    const progress = service.getProgress({});
    assert.equal(typeof progress.timingMs, "number");
    assert.ok(progress.progress.some(x => x.title === "The Long Book" && x.totalKnown === false));
  });
});

test("dashboard overview normalizes seconds-based durations from playback observations", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users WHERE enabled = 1 ORDER BY id").all();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const now = new Date().toISOString();
    insert.run(users[0].id, "movie-seconds", "movie", "Movies", "Moonrise", null, now, 100, 7200, 1, now, now);
    insert.run(users[1].id, "anime-seconds", "episode", "Anime", "Episode 1", "Skyward", now, 73, 1500, 0, now, now);
    const overview = new DashboardService(db).getOverview({});

    assert.equal(overview.totals.minutes, 145);
    assert.equal(overview.categoryMix.find(x => x.category === "movie").durationMinutes, 120);
    assert.equal(overview.categoryMix.find(x => x.category === "anime").durationMinutes, 25);
  });
});

test("dashboard overview groups near-simultaneous co-watch cards by shared title", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users WHERE plex_username IN ('Tony', 'Viewer') ORDER BY plex_username").all();
    const now = new Date();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const firstAt = now.toISOString();
    const secondAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    insert.run(users[0].id, "cowatch-1", "movie", "Movies", "Moonrise", null, firstAt, 100, 7200, 1, firstAt, firstAt);
    insert.run(users[1].id, "cowatch-1", "movie", "Movies", "Moonrise", null, secondAt, 100, 7200, 1, secondAt, secondAt);
    const event = db.prepare(`INSERT INTO watch_events
      (source_user_id,rating_key,media_type,library_name,title,watched_at,prompt_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(users[0].id, "cowatch-1", "movie", "Movies", "Moonrise", firstAt, "resolved", firstAt, firstAt);
    db.prepare(`INSERT INTO cowatch_confirmations
      (watch_event_id,target_user_id,confirmation_method,status,plex_sync_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(Number(event.lastInsertRowid), users[1].id, "fixture", "confirmed", "marked_watched", firstAt, firstAt);
    const overview = new DashboardService(db).getOverview({});

    assert.equal(overview.recentPlayback.length, 1);
    assert.match(overview.recentPlayback[0].displayName, /\+/);
    assert.match(overview.recentPlayback[0].displayName, /Tony/);
    assert.match(overview.recentPlayback[0].displayName, /Viewer/);
    assert.deepEqual(overview.recentPlayback[0].displayNames, ["Tony", "Viewer"]);
  });
});

test("dashboard overview groups one item session while separating replay, gap, and different-item cards", () => {
  withTestDb((db) => {
    seedUsers(db);
    const tony = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get();
    const now = Date.now();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const add = (ratingKey, minutesAgo, percent, completed = 0) => {
      const watchedAt = new Date(now - minutesAgo * 60 * 1000).toISOString();
      insert.run(tony.id, ratingKey, "movie", "Movies", ratingKey, watchedAt, percent, 7_200_000, completed, watchedAt, watchedAt);
    };

    add("pause-resume", 90, 35);
    add("pause-resume", 30, 55);
    add("different-item", 20, 100, 1);
    add("replay-after-completion", 110, 100, 1);
    add("replay-after-completion", 10, 100, 1);
    add("gap-split", 190, 100, 1);
    add("gap-split", 20, 100, 1);

    const recent = new DashboardService(db).getOverview({}).recentPlayback;
    const pause = recent.filter((item) => item.ratingKey === "pause-resume");
    assert.equal(pause.length, 1);
    assert.equal(pause[0].sessionStartAt, new Date(now - 90 * 60 * 1000).toISOString());
    assert.equal(pause[0].sessionEndAt, new Date(now - 30 * 60 * 1000).toISOString());
    assert.equal(recent.filter((item) => item.ratingKey === "different-item").length, 1);
    assert.equal(recent.filter((item) => item.ratingKey === "replay-after-completion").length, 2);
    assert.equal(recent.filter((item) => item.ratingKey === "gap-split").length, 2);
  });
});

test("dashboard overview merges audiobook sessions across Plex rating-key churn", () => {
  withTestDb((db) => {
    seedUsers(db);
    const tony = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get();
    const now = Date.now();
    const oldAt = new Date(now - 90 * 60 * 1000).toISOString();
    const currentAt = new Date(now - 30 * 60 * 1000).toISOString();

    db.prepare(`INSERT INTO audiobook_books
      (folder_key,title,authors_json,narrators_json,source_provenance,enrichment_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(
      "warbreaker-folder",
      "2015 - Cosmere Warbreaker (Alyssa Bresnahan)",
      JSON.stringify(["Brandon Sanderson"]),
      JSON.stringify([]),
      "folder_path",
      "pending",
      oldAt,
      oldAt
    );
    const book = db.prepare("SELECT id FROM audiobook_books WHERE folder_key = 'warbreaker-folder'").get();
    db.prepare(`INSERT INTO content_catalog
      (rating_key,media_type,title,library_title,audiobook_id,source_provenance,refreshed_at)
      VALUES (?,?,?,?,?,?,?)`).run(
      "old-book-track",
      "audiobook",
      "Cosmere Warbreaker (Alyssa Bresnahan) (2015)",
      "Audiobooks",
      book.id,
      "fixture",
      oldAt
    );

    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(tony.id, "old-book-track", "audiobook", "Audiobooks", "Cosmere Warbreaker (Alyssa Bresnahan) (2015)", "Brandon Sanderson", oldAt, 20, 1200000, 0, oldAt, oldAt);
    insert.run(tony.id, "current-book-track", "audiobook", "Audiobooks", "Cosmere Warbreaker (Alyssa Bresnahan) (2015)", "Brandon Sanderson", currentAt, 30, 1200000, 0, currentAt, currentAt);

    const recent = new DashboardService(db).getOverview({}).recentPlayback;
    assert.equal(recent.length, 1);
    assert.equal(recent[0].displayTitle, "Warbreaker");
    assert.equal(recent[0].sessionStartAt, oldAt);
    assert.equal(recent[0].sessionEndAt, currentAt);
  });
});

test("dashboard preferences survive identity resyncs and drive dashboard visibility", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users ORDER BY plex_username ASC").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const prefs = new DashboardPreferenceService(db);
    prefs.saveUsers([
      { id: byName.Tony.id, alias: "Big T", shown: true },
      { id: byName.Viewer.id, alias: null, shown: false }
    ]);

    const now = new Date().toISOString();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(byName.Tony.id, "movie-1", "movie", "Movies", "Moonrise", null, now, 100, 7200000, 1, now, now);
    insert.run(byName.Viewer.id, "movie-2", "movie", "Movies", "Moonrise", null, now, 100, 7200000, 1, now, now);

    new UserService(db).syncConfiguredUsers([
      { plexUsername: "Disabled", displayName: "Disabled Synced", isSourceUser: true, isTypicalCowatcher: false, enabled: false },
      { plexUsername: "Tony", displayName: "Tony Synced", isSourceUser: true, isTypicalCowatcher: false, enabled: true },
      { plexUsername: "Viewer", plexUserId: "viewer-plex", displayName: "Viewer Synced", isSourceUser: false, isTypicalCowatcher: true, enabled: true }
    ]);

    const service = new DashboardService(db);
    const overview = service.getOverview({});
    const tony = overview.users.find((user) => user.plex_username === "Tony");
    assert.ok(tony);
    assert.equal(tony.display_name, "Big T");
    assert.equal(overview.users.some((user) => user.plex_username === "Viewer"), false);

    const people = service.getPeople({}).people;
    assert.equal(people.some((person) => person.plex_username === "Viewer"), false);
    assert.equal(people.find((person) => person.plex_username === "Tony").display_name, "Big T");

    const stored = db.prepare("SELECT dashboard_alias, dashboard_shown FROM users WHERE plex_username = 'Tony'").get();
    assert.equal(stored.dashboard_alias, "Big T");
    assert.equal(stored.dashboard_shown, 1);
  });
});

test("dashboard preference lists expose only visible users and preserve aliases", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users ORDER BY plex_username ASC").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const prefs = new DashboardPreferenceService(db);
    prefs.saveUsers([
      { id: byName.Tony.id, alias: "Big T", shown: true },
      { id: byName.Viewer.id, alias: "Hidden Viewer", shown: false }
    ]);

    const visible = prefs.listVisibleUsers();
    assert.deepEqual(visible.map((user) => user.plex_username), ["Tony"]);
    assert.equal(visible[0].alias, "Big T");
  });
});

test("dashboard people separates household profiles without merging duplicate-looking identities", () => {
  withTestDb((db) => {
    seedUsers(db);
    const now = new Date();
    const nowIso = now.toISOString();
    const oldIso = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const users = db.prepare("SELECT id, plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    db.prepare("UPDATE users SET dashboard_alias='Big T', dashboard_shown=1 WHERE id=?").run(byName.Tony.id);
    db.prepare("UPDATE users SET dashboard_shown=0 WHERE id=?").run(byName.Viewer.id);
    db.prepare("UPDATE users SET dashboard_shown=1 WHERE id=?").run(byName.Disabled.id);
    const duplicate = db.prepare(`INSERT INTO users
      (plex_username,display_name,dashboard_alias,dashboard_shown,is_source_user,is_typical_cowatcher,enabled,created_at,updated_at)
      VALUES ('Tony Archive','Tony Archive','Big_T',1,0,0,1,?,?)`).run(nowIso, nowIso);
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(byName.Tony.id, "people-current", "movie", "Movies", "Current Movie", nowIso, 100, 7200000, 1, nowIso, nowIso);
    insert.run(byName.Tony.id, "people-old", "movie", "Movies", "Old Movie", oldIso, 100, 7200000, 1, oldIso, oldIso);

    const result = new DashboardService(db).getPeople({});
    assert.equal(result.window.defaulted, true);
    assert.deepEqual(result.active.map((person) => person.display_name), ["Big T"]);
    assert.equal(result.active[0].plays, 1);
    assert.equal(result.active[0].minutes, 120);
    assert.equal(result.active[0].completed, 1);
    assert.equal(result.active[0].heatmap.length, 30);
    assert.deepEqual(result.active[0].possibleDuplicates, ["Big_T"]);
    assert.equal(result.secondary.some((person) => person.id === Number(duplicate.lastInsertRowid)), true);
    assert.equal(result.secondary.some((person) => person.plex_username === "Disabled" && person.status === "disabled"), true);
    assert.equal(result.people.some((person) => person.plex_username === "Viewer"), false);

    const explicit = new DashboardService(db).getPeople({ dateFrom: oldIso, dateTo: oldIso });
    assert.equal(explicit.active.find((person) => person.plex_username === "Tony").recent[0].title, "Old Movie");
  });
});

test("dashboard people attributes confirmed co-watches without duplicating direct playback", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id,plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const watchedAt = "2026-07-01T20:00:00.000Z";
    const insertObservation = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const sourceObservation = insertObservation.run(byName.Tony.id, "shared-movie", "movie", "Movies", "Shared Movie", watchedAt, 100, 7_200_000, 1, watchedAt, watchedAt);
    const event = db.prepare(`INSERT INTO watch_events
      (source_user_id,rating_key,media_type,library_name,title,watched_at,prompt_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(byName.Tony.id, "shared-movie", "movie", "Movies", "Shared Movie", watchedAt, "resolved", watchedAt, watchedAt);
    db.prepare(`INSERT INTO cowatch_confirmations
      (watch_event_id,target_user_id,confirmation_method,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`).run(Number(event.lastInsertRowid), byName.Viewer.id, "test", "confirmed", watchedAt, watchedAt);

    const service = new DashboardService(db);
    const attributed = service.getPeople({ period: "all" });
    const viewerAttributed = attributed.people.find((person) => person.plex_username === "Viewer");
    const tonyAttributed = attributed.people.find((person) => person.plex_username === "Tony");
    assert.equal(viewerAttributed.plays, 1);
    assert.equal(viewerAttributed.minutes, 120);
    assert.equal(viewerAttributed.completed, 1);
    assert.equal(viewerAttributed.activityBreakdown.observed.plays, 0);
    assert.equal(viewerAttributed.activityBreakdown.attributedTogether.plays, 1);
    assert.equal(viewerAttributed.activityBreakdown.confirmedTogetherSessions, 1);
    assert.equal(viewerAttributed.recent[0].contribution, "attributed_confirmed_together");
    assert.equal(viewerAttributed.heatmap.find((day) => day.date === "2026-07-01").attributedMinutes, 120);
    assert.equal(tonyAttributed.activityBreakdown.confirmedTogetherSessions, 1);

    const targetAt = "2026-07-01T20:05:00.000Z";
    insertObservation.run(byName.Viewer.id, "shared-movie", "movie", "Movies", "Shared Movie", targetAt, 100, 7_200_000, 1, targetAt, targetAt);
    const deduplicated = service.getPeople({ period: "all" }).people.find((person) => person.plex_username === "Viewer");
    assert.equal(deduplicated.plays, 1);
    assert.equal(deduplicated.minutes, 120);
    assert.equal(deduplicated.activityBreakdown.observed.plays, 1);
    assert.equal(deduplicated.activityBreakdown.attributedTogether.plays, 0);
    assert.equal(deduplicated.activityBreakdown.confirmedTogetherSessions, 1);
    assert.equal(deduplicated.recent[0].contribution, "observed");
    const filteredOutDirect = service.getPeople({ period: "all", completed: false }).people.find((person) => person.plex_username === "Viewer");
    assert.equal(filteredOutDirect.plays, 0);
    assert.equal(filteredOutDirect.activityBreakdown.attributedTogether.plays, 0);

    const unknownAt = "2026-07-02T20:00:00.000Z";
    insertObservation.run(byName.Tony.id, "unknown-duration", "movie", "Movies", "Unknown Duration", unknownAt, 100, null, 1, unknownAt, unknownAt);
    const unknownEvent = db.prepare(`INSERT INTO watch_events
      (source_user_id,rating_key,media_type,library_name,title,watched_at,prompt_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(byName.Tony.id, "unknown-duration", "movie", "Movies", "Unknown Duration", unknownAt, "resolved", unknownAt, unknownAt);
    db.prepare(`INSERT INTO cowatch_confirmations
      (watch_event_id,target_user_id,confirmation_method,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`).run(Number(unknownEvent.lastInsertRowid), byName.Viewer.id, "test", "confirmed", unknownAt, unknownAt);
    const withUnknown = service.getPeople({ period: "all" }).people.find((person) => person.plex_username === "Viewer");
    assert.equal(withUnknown.plays, 2);
    assert.equal(withUnknown.minutes, 120);
    assert.equal(withUnknown.activityBreakdown.attributedTogether.unknownDuration, 1);
    assert.equal(Number(sourceObservation.lastInsertRowid) > 0, true);
  });
});

test("dashboard people honors positive adjudication, clear, periods, and uncapped all-time totals", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id,plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const insertObservation = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const sourceAt = "2026-07-03T20:00:00.000Z";
    const targetAt = "2026-07-03T20:05:00.000Z";
    insertObservation.run(byName.Tony.id, "review-shared", "movie", "Movies", "Reviewed Shared", sourceAt, 100, 7_200_000, 1, sourceAt, sourceAt);
    insertObservation.run(byName.Viewer.id, "review-shared", "movie", "Movies", "Reviewed Shared", targetAt, 100, 7_200_000, 1, targetAt, targetAt);
    const adjudications = new CowatchAdjudicationService(db);
    const candidate = adjudications.listCandidates({ dateFrom: "2026-07-03T00:00:00.000Z", dateTo: "2026-07-04T00:00:00.000Z" })[0];
    assert.ok(candidate);
    await adjudications.decide({ candidateId: candidate.candidateId, decision: "yes", actorKind: "web", method: "browser", requestId: "people-review-yes", apply: true, confirm: true });
    const service = new DashboardService(db);
    let viewer = service.getPeople({ period: "all" }).people.find((person) => person.plex_username === "Viewer");
    assert.equal(viewer.activityBreakdown.observed.plays, 1);
    assert.equal(viewer.activityBreakdown.attributedTogether.plays, 0);
    assert.equal(viewer.activityBreakdown.confirmedTogetherSessions, 1);

    await adjudications.decide({ candidateId: candidate.candidateId, decision: "clear", actorKind: "web", method: "browser", requestId: "people-review-clear", apply: true, confirm: true });
    viewer = service.getPeople({ period: "all" }).people.find((person) => person.plex_username === "Viewer");
    assert.equal(viewer.activityBreakdown.confirmedTogetherSessions, 0);

    const bulkInsert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    db.exec("BEGIN");
    try {
      for (let index = 0; index < 505; index += 1) {
        const at = new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString();
        bulkInsert.run(byName.Tony.id, `archive-${index}`, "movie", "Movies", `Archive ${index}`, at, 100, 60_000, 1, at, at);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const allTimeTony = service.getPeople({ period: "all" }).people.find((person) => person.plex_username === "Tony");
    assert.equal(allTimeTony.plays, 506);
    assert.equal(allTimeTony.heatmap.length, 365);
    assert.equal(service.getPeople({ period: "7d", user: "Tony" }).window.period, "7d");
    assert.throws(() => service.getPeople({ period: "custom", dateFrom: "2026-07-01" }), /require dateFrom and dateTo/);
    assert.throws(() => service.getPeople({ period: "custom", dateFrom: "2026-07-05", dateTo: "2026-07-01" }), /dateFrom must be on or before dateTo/);
  });
});

test("dashboard cowatch pairings use visible exact-item evidence and measurable overlap", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const now = new Date();
    const sourceAt = now.toISOString();
    const targetAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(byName.Tony.id, "pairing-movie", "movie", "Movies", "Pairing Movie", sourceAt, 100, 7200000, 1, sourceAt, sourceAt);
    insert.run(byName.Viewer.id, "pairing-movie", "movie", "Movies", "Pairing Movie", targetAt, 100, 7200000, 1, targetAt, targetAt);

    const result = new DashboardService(db).getCowatchPairings({ dateFrom: new Date(now.getTime() - 60 * 60 * 1000).toISOString() });
    assert.equal(result.total, 1);
    assert.deepEqual(result.items[0].people.map((person) => person.displayName), ["Tony", "Viewer"]);
    assert.equal(result.items[0].sessionCount, 1);
    assert.equal(result.items[0].provenance.inferred, 1);
    assert.equal(result.items[0].knownSharedMinutes, 115);
    assert.equal(result.items[0].unknownDurationSessions, 0);
    assert.equal(result.items[0].titles[0].ratingKey, "pairing-movie");

    db.prepare("UPDATE users SET dashboard_shown=0 WHERE id=?").run(byName.Viewer.id);
    assert.equal(new DashboardService(db).getCowatchPairings({ dateFrom: new Date(now.getTime() - 60 * 60 * 1000).toISOString() }).total, 0);
  });
});

test("dashboard prompt lifecycle actions are confirmed idempotent and audited", () => {
  withTestDb((db) => {
    seedUsers(db);
    const watchEventId = insertCompletedWatch(db);
    const service = cowatchService(db);

    const unconfirmed = service.dismissPrompt(watchEventId, false);
    assert.equal(unconfirmed.ok, false);
    assert.equal(unconfirmed.errorCode, "CONFIRMATION_REQUIRED");
    const dismissed = service.dismissPrompt(watchEventId, true);
    const dismissedAgain = service.dismissPrompt(watchEventId, true);
    assert.equal(dismissed.ok, true);
    assert.equal(dismissed.data.changed, true);
    assert.equal(dismissedAgain.data.changed, false);

    const reprompted = service.reprompt(watchEventId, true);
    const repromptedAgain = service.reprompt(watchEventId, true);
    assert.equal(reprompted.data.changed, true);
    assert.equal(repromptedAgain.data.changed, false);
    assert.equal(db.prepare("SELECT prompt_status FROM watch_events WHERE id=?").get(watchEventId).prompt_status, "pending");
    assert.ok(db.prepare("SELECT id FROM audit_log WHERE action='dashboard_prompt_dismissed' AND status='ok'").get());
    assert.ok(db.prepare("SELECT id FROM audit_log WHERE action='dashboard_prompt_reprompted' AND status='ok'").get());
  });
});

test("cowatch adjudication is append-only reversible idempotent and evidence-scoped", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    migrateDatabase(db);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM schema_migrations WHERE version=10").get().count, 1);
    const users = db.prepare("SELECT id, plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const now = new Date();
    const sourceAt = now.toISOString();
    const targetAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(byName.Tony.id, "review-movie", "movie", "Movies", "Review Movie", sourceAt, 100, 7200000, 1, sourceAt, sourceAt);
    insert.run(byName.Viewer.id, "review-movie", "movie", "Movies", "Review Movie", targetAt, 100, 7200000, 1, targetAt, targetAt);
    const service = new CowatchAdjudicationService(db);
    const candidate = service.listCandidates({ days: 1 })[0];
    assert.ok(candidate);

    const preview = await service.decide({ candidateId: candidate.candidateId, decision: "yes", actorKind: "web", method: "browser", requestId: "request-preview-1" });
    assert.equal(preview.data.dryRun, true);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM cowatch_adjudications").get().count, 0);
    const yes = await service.decide({ candidateId: candidate.candidateId, decision: "yes", actorKind: "web", method: "browser", requestId: "request-apply-1", apply: true, confirm: true });
    const repeated = await service.decide({ candidateId: candidate.candidateId, decision: "yes", actorKind: "web", method: "browser", requestId: "request-apply-1", apply: true, confirm: true });
    assert.equal(yes.data.changed, true);
    assert.equal(repeated.data.repeated, true);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM cowatch_adjudications").get().count, 1);

    await service.decide({ candidateId: candidate.candidateId, decision: "not_sure", actorKind: "web", method: "browser", requestId: "request-apply-2", apply: true, confirm: true });
    assert.equal(service.listCandidates({ days: 1 })[0].effectiveRelationship, "likely_together");
    await service.decide({ candidateId: candidate.candidateId, decision: "no", actorKind: "web", method: "browser", requestId: "request-apply-3", apply: true, confirm: true });
    assert.equal(service.listCandidates({ days: 1 })[0].effectiveRelationship, "suppressed");
    assert.equal(new DashboardService(db).getCowatchPairings({ dateFrom: new Date(now.getTime() - 60 * 60 * 1000).toISOString() }).total, 0);
    await service.decide({ candidateId: candidate.candidateId, decision: "clear", actorKind: "web", method: "browser", requestId: "request-apply-4", apply: true, confirm: true });
    assert.equal(service.listCandidates({ days: 1 })[0].effectiveRelationship, "likely_together");
    assert.equal(service.listCandidates({ days: 1 })[0].decision, null);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM cowatch_adjudications").get().count, 4);
    assert.ok(db.prepare("SELECT id FROM audit_log WHERE action='cowatch_adjudication_decided' AND status='reversed'").get());

    const laterTarget = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    insert.run(byName.Viewer.id, "review-movie", "movie", "Movies", "Review Movie", laterTarget, 100, 7200000, 1, laterTarget, laterTarget);
    const changedCandidate = service.listCandidates({ days: 1 })[0];
    assert.notEqual(changedCandidate.candidateId, candidate.candidateId);
  });
});

test("Discord review prompts are operator-triggered deduped and resolve without Plex sync", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const now = new Date();
    const sourceAt = now.toISOString();
    const targetAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(byName.Tony.id, "discord-review", "movie", "Movies", "Discord Review", sourceAt, 100, 7200000, 1, sourceAt, sourceAt);
    insert.run(byName.Viewer.id, "discord-review", "movie", "Movies", "Discord Review", targetAt, 100, 7200000, 1, targetAt, targetAt);
    let plexWrites = 0;
    cowatchService(db, { markWatched: async () => { plexWrites += 1; return { ok: true, status: "marked_watched" }; } });
    const service = new CowatchAdjudicationService(db);
    const candidate = service.listCandidates({ days: 1 })[0];

    const preview = service.requestDiscordReview({ candidateId: candidate.candidateId, actorKind: "web", requestId: "review-preview-1" });
    assert.equal(preview.data.dryRun, true);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM cowatch_review_prompts").get().count, 0);
    const requested = service.requestDiscordReview({ candidateId: candidate.candidateId, actorKind: "web", requestId: "review-request-1", apply: true, confirm: true });
    const duplicate = service.requestDiscordReview({ candidateId: candidate.candidateId, actorKind: "web", requestId: "review-request-2", apply: true, confirm: true });
    assert.equal(requested.data.changed, true);
    assert.equal(duplicate.data.changed, false);
    assert.equal(service.listPendingReviewPrompts().length, 1);

    const firstPromptId = requested.data.reviewPromptId;
    assert.equal(service.recordReviewPromptFailure(firstPromptId, "fixture delivery failure").failed, true);
    const retried = service.requestDiscordReview({ candidateId: candidate.candidateId, actorKind: "web", requestId: "review-request-3", apply: true, confirm: true });
    assert.equal(retried.data.changed, true);
    const secondPromptId = retried.data.reviewPromptId;
    assert.equal(service.recordReviewPromptSent(secondPromptId, "private-channel", "private-message").sent, true);
    assert.equal(service.recordReviewPromptSent(secondPromptId, "private-channel", "private-message").sent, false);
    const resolved = await service.resolveReviewPrompt(secondPromptId, "yes", "interaction-12345678");
    const late = await service.resolveReviewPrompt(secondPromptId, "no", "interaction-87654321");
    assert.equal(resolved.data.status, "resolved");
    assert.equal(late.data.changed, false);
    assert.equal(service.listCandidates({ days: 1 })[0].decision, "yes");
    assert.equal(plexWrites, 0);
    assert.equal(db.prepare("SELECT status FROM cowatch_review_prompts WHERE id=?").get(secondPromptId).status, "resolved");
    assert.ok(db.prepare("SELECT id FROM audit_log WHERE action='cowatch_review_prompt_resolved'").get());

    await service.decide({ candidateId: candidate.candidateId, decision: "clear", actorKind: "web", method: "browser", requestId: "review-clear-123", apply: true, confirm: true });
    const hiddenPrompt = service.requestDiscordReview({ candidateId: candidate.candidateId, actorKind: "web", requestId: "review-request-4", apply: true, confirm: true });
    db.prepare("UPDATE users SET dashboard_shown=0 WHERE id=?").run(byName.Viewer.id);
    assert.equal(service.listPendingReviewPrompts().length, 0);
    assert.equal(db.prepare("SELECT status FROM cowatch_review_prompts WHERE id=?").get(hiddenPrompt.data.reviewPromptId).status, "cancelled");
  });
});

test("Discord review components use a distinct review-only interaction namespace", () => {
  const media = { reviewPromptId: 42, sourceName: "Tony", targetName: "Viewer", title: "Review Movie", watchedAt: "2026-07-05T12:00:00.000Z" };
  const embed = buildCowatchReviewEmbed(media);
  const components = buildCowatchReviewComponents(media.reviewPromptId).map((row) => row.toJSON());
  assert.match(embed.footer.text, /will not change Plex watched state/i);
  assert.deepEqual(components[0].components.map((component) => component.custom_id), ["cowatch-review:yes:42", "cowatch-review:no:42", "cowatch-review:not_sure:42"]);
});

test("dashboard audiobook titles prefer the book title and artwork routes return images", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const user = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
    const now = new Date();
    const nowIso = now.toISOString();
    const laterIso = new Date(now.getTime() + 1000).toISOString();
    const coverUrl = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#0f172a"/><text x="50%" y="50%" fill="#f59e0b" font-size="44" text-anchor="middle">The Final Empire</text></svg>`);

    db.prepare(`
      INSERT INTO audiobook_books (folder_key, title, authors_json, narrators_json, cover_url, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run("book-folder", "The Final Empire", JSON.stringify(["Brandon Sanderson"]), JSON.stringify([]), coverUrl, "manual", "enriched", nowIso, nowIso);
    const book = db.prepare("SELECT id FROM audiobook_books WHERE folder_key = 'book-folder'").get();
    db.prepare(`
      INSERT INTO content_catalog (rating_key, media_type, title, audiobook_id, source_provenance, refreshed_at)
      VALUES (?, 'audiobook', ?, ?, ?, ?)
    `).run("book-track-1", "Brandon Sanderson", book.id, "plex", nowIso);
    db.prepare(`
      INSERT INTO audiobook_books (folder_key, title, authors_json, narrators_json, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("book-folder-2", "2016 - Arcanum Unbounded The Cosmere Collection (Unabridged)", JSON.stringify(["Brandon Sanderson"]), JSON.stringify([]), "folder_path", "pending", nowIso, nowIso);
    const secondBook = db.prepare("SELECT id FROM audiobook_books WHERE folder_key = 'book-folder-2'").get();
    db.prepare(`
      INSERT INTO content_catalog (rating_key, media_type, title, audiobook_id, source_provenance, refreshed_at)
      VALUES (?, 'audiobook', ?, ?, ?, ?)
    `).run("book-track-2", "Brandon Sanderson", secondBook.id, "plex", nowIso);
    db.prepare(`
      INSERT INTO audiobook_books (folder_key, title, authors_json, narrators_json, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("book-folder-3", "Cosmere Warbreaker (Alyssa Bresnahan) (2015)", JSON.stringify(["Brandon Sanderson"]), JSON.stringify([]), "folder_path", "pending", nowIso, nowIso);
    const thirdBook = db.prepare("SELECT id FROM audiobook_books WHERE folder_key = 'book-folder-3'").get();
    db.prepare(`
      INSERT INTO content_catalog (rating_key, media_type, title, audiobook_id, source_provenance, refreshed_at)
      VALUES (?, 'audiobook', ?, ?, ?, ?)
    `).run("book-track-3", "Brandon Sanderson", thirdBook.id, "plex", nowIso);
    db.prepare(`
      INSERT INTO playback_observations
        (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(user.id, "book-track-1", "audiobook", "Audiobooks", "Brandon Sanderson", "Brandon Sanderson", nowIso, 25, 1200000, 0, nowIso, nowIso);
    db.prepare(`
      INSERT INTO playback_observations
        (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(user.id, "book-track-2", "audiobook", "Audiobooks", "Arcanum Unbounded The Cosmere Collection (Unabridged) (2016)", "Brandon Sanderson", laterIso, 25, 1200000, 0, laterIso, laterIso);
    db.prepare(`
      INSERT INTO playback_observations
        (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(user.id, "book-track-3", "audiobook", "Audiobooks", "Cosmere Warbreaker (Alyssa Bresnahan) (2015)", "Brandon Sanderson", new Date(now.getTime() + 2000).toISOString(), 3, 1200000, 0, new Date(now.getTime() + 2000).toISOString(), new Date(now.getTime() + 2000).toISOString());

    const service = new DashboardService(db);
    const overview = service.getOverview({});
    const firstItem = overview.activity.items.find((item) => item.ratingKey === "book-track-1");
    const secondItem = overview.activity.items.find((item) => item.ratingKey === "book-track-2");
    const thirdItem = overview.activity.items.find((item) => item.ratingKey === "book-track-3");
    const secondContinue = overview.continueWatching.find((item) => item.ratingKey === "book-track-2");
    assert.ok(firstItem);
    assert.ok(secondItem);
    assert.ok(thirdItem);
    assert.ok(secondContinue);
    assert.equal(overview.summaryStrip.find((item) => item.category === "audiobook").minutes > 0, true);
    assert.equal(firstItem.displayTitle, "The Final Empire");
    assert.equal(secondItem.displayTitle, "Arcanum Unbounded The Cosmere Collection (Unabridged)");
    assert.equal(thirdItem.displayTitle, "Warbreaker");
    assert.equal(secondContinue.displayTitle, "Arcanum Unbounded The Cosmere Collection (Unabridged)");

    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db, new MockPlexAdapter(), { skipStartupUserSync: true });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const audiobookArt = await fetch(base + secondItem.artworkUrl);
      assert.equal(audiobookArt.status, 200);
      assert.match(audiobookArt.headers.get("content-type"), /image\/svg\+xml/);
      assert.match(await audiobookArt.text(), /<svg/i);

      const movieArt = await fetch(base + "/api/artwork/movie-1");
      assert.equal(movieArt.status, 200);
      assert.match(movieArt.headers.get("content-type"), /image\/svg\+xml/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("audiobook artwork falls back to a newer reconciled Plex sibling", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const user = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO audiobook_books
        (folder_key, title, authors_json, narrators_json, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "warbreaker-artwork-fallback",
      "Cosmere Warbreaker (Alyssa Bresnahan) (2015)",
      JSON.stringify(["Brandon Sanderson"]),
      JSON.stringify(["Alyssa Bresnahan"]),
      "folder_path",
      "pending",
      nowIso,
      nowIso
    );
    const book = db.prepare("SELECT id FROM audiobook_books WHERE folder_key = ?").get("warbreaker-artwork-fallback");
    db.prepare(`
      INSERT INTO content_catalog
        (rating_key, media_type, title, audiobook_id, source_provenance, refreshed_at)
      VALUES (?, 'audiobook', ?, ?, ?, ?)
    `).run("old-book-track", "Cosmere Warbreaker (Alyssa Bresnahan) (2015)", book.id, "plex", nowIso);
    db.prepare(`
      INSERT INTO content_catalog
        (rating_key, media_type, title, audiobook_id, source_provenance, refreshed_at)
      VALUES (?, 'audiobook', ?, ?, ?, ?)
    `).run(
      "current-book-parent",
      "Cosmere Warbreaker (Alyssa Bresnahan) (2015)",
      book.id,
      "plex",
      new Date(Date.now() + 1000).toISOString()
    );
    db.prepare(`
      INSERT INTO playback_observations
        (user_id, rating_key, parent_rating_key, media_type, library_name, title, watched_at, completed, created_at, updated_at)
      VALUES (?, ?, ?, 'track', 'Audiobooks', ?, ?, 0, ?, ?)
    `).run(user.id, "current-book-track", "current-book-parent", "Cosmere Warbreaker (Alyssa Bresnahan) (2015)", nowIso, nowIso, nowIso);

    const unavailableKeys = new Set([String(book.id), "old-book-track"]);
    class ArtworkFallbackMockPlexAdapter extends MockPlexAdapter {
      async getRichMetadataByRatingKey(ratingKey, plexGuid) {
        if (unavailableKeys.has(ratingKey)) {
          return { ratingKey, mediaType: "track", title: "Warbreaker", genres: [] };
        }
        return super.getRichMetadataByRatingKey(ratingKey, plexGuid);
      }
    }

    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db, new ArtworkFallbackMockPlexAdapter(), { skipStartupUserSync: true });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const artwork = await fetch(`${base}/api/artwork/audiobook:${book.id}`);
      assert.equal(artwork.status, 200);
      assert.match(artwork.headers.get("content-type"), /image\/svg\+xml/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("artwork proxy refreshes an authoritative local audiobook cover without restart", async () => {
  await withTestDb(async (db) => {
    const nowIso = new Date().toISOString();
    const firstCover = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><text>FIRST COVER</text></svg>`);
    const secondCover = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><text>SECOND COVER</text></svg>`);
    const result = db.prepare(`
      INSERT INTO audiobook_books
        (folder_key, title, authors_json, narrators_json, cover_url, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (?, ?, '[]', '[]', ?, 'manual', 'enriched', ?, ?)
    `).run("artwork-refresh-book", "Artwork Refresh Book", firstCover, nowIso, nowIso);
    const audiobookId = Number(result.lastInsertRowid);

    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db, new MockPlexAdapter(), { skipStartupUserSync: true });
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const artworkUrl = `${base}/api/artwork/audiobook:${audiobookId}`;
    try {
      const first = await fetch(artworkUrl);
      assert.equal(first.status, 200);
      const firstFinalUrl = first.url;
      assert.match(firstFinalUrl, /variant=poster&v=[a-f0-9]{20}$/);
      assert.match(first.headers.get("cache-control"), /private.*immutable/);
      assert.match(await first.text(), /FIRST COVER/);

      db.prepare("UPDATE audiobook_books SET cover_url = ?, updated_at = ? WHERE id = ?")
        .run(secondCover, new Date(Date.now() + 1000).toISOString(), audiobookId);

      const second = await fetch(artworkUrl);
      assert.equal(second.status, 200);
      assert.notEqual(second.url, firstFinalUrl);
      assert.match(await second.text(), /SECOND COVER/);

      const legacy = await fetch(artworkUrl, { redirect: "manual" });
      assert.equal(legacy.status, 307);
      assert.equal(legacy.headers.get("cache-control"), "no-store");
      assert.match(legacy.headers.get("location"), new RegExp(`^/api/artwork/audiobook%3A${audiobookId}\\?variant=poster&v=[a-f0-9]{20}$`));
      assert.doesNotMatch(legacy.headers.get("location"), /data:|FIRST|SECOND/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("artwork resolver recovers stale Plex identities by GUID and coalesces requests", async () => {
  await withTestDb(async (db) => {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO content_catalog (rating_key, guid, media_type, title, source_provenance, refreshed_at)
      VALUES ('stale-movie-art', 'plex://movie/stable', 'movie', 'Stale Movie Art', 'plex', ?)
    `).run(nowIso);
    db.prepare(`
      INSERT INTO content_catalog (rating_key, guid, media_type, title, source_provenance, refreshed_at)
      VALUES ('stale-show-art', 'plex://show/stable', 'show', 'Stale Show Art', 'plex', ?)
    `).run(nowIso);

    const calls = [];
    const poster = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><text>GUID POSTER</text></svg>`);
    const backdrop = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg"><text>GUID BACKDROP</text></svg>`);
    class GuidRecoveringArtworkAdapter extends MockPlexAdapter {
      async getRichMetadataByRatingKey(ratingKey, plexGuid) {
        calls.push({ ratingKey, plexGuid });
        await new Promise((resolve) => setTimeout(resolve, 15));
        const show = ratingKey === "stale-show-art";
        return {
          ratingKey: show ? "active-show-art" : "active-movie-art",
          guid: plexGuid,
          mediaType: show ? "show" : "movie",
          title: show ? "Stale Show Art" : "Stale Movie Art",
          genres: [],
          thumb: poster,
          art: backdrop
        };
      }
    }

    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db, new GuidRecoveringArtworkAdapter(), { skipStartupUserSync: true });
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const movieResponses = await Promise.all(Array.from({ length: 6 }, () => fetch(`${base}/api/artwork/stale-movie-art`)));
      assert.equal(movieResponses.every((response) => response.status === 200), true);
      assert.equal(calls.filter((call) => call.ratingKey === "stale-movie-art").length, 1);
      assert.deepEqual(calls.find((call) => call.ratingKey === "stale-movie-art"), {
        ratingKey: "stale-movie-art",
        plexGuid: "plex://movie/stable"
      });
      assert.match(await movieResponses[0].text(), /GUID POSTER/);

      const backdropResponse = await fetch(`${base}/api/artwork/stale-movie-art?variant=backdrop`);
      assert.equal(backdropResponse.status, 200);
      assert.match(await backdropResponse.text(), /GUID BACKDROP/);

      const showResponse = await fetch(`${base}/api/artwork/stale-show-art`);
      assert.equal(showResponse.status, 200);
      assert.deepEqual(calls.find((call) => call.ratingKey === "stale-show-art"), {
        ratingKey: "stale-show-art",
        plexGuid: "plex://show/stable"
      });
      assert.doesNotMatch(showResponse.url, /plex:\/\/|stable/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("artwork proxy rejects unsafe local sources and never guesses audiobook siblings by title", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const nowIso = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO audiobook_books
        (folder_key, title, authors_json, narrators_json, cover_url, source_provenance, enrichment_status, created_at, updated_at)
      VALUES ('unsafe-artwork-book', 'Duplicate Artwork Title', '[]', '[]', 'http://127.0.0.1:9/private-cover', 'manual', 'enriched', ?, ?)
    `).run(nowIso, nowIso);
    const audiobookId = Number(result.lastInsertRowid);
    const user = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get();
    db.prepare(`
      INSERT INTO playback_observations
        (user_id, rating_key, media_type, library_name, title, watched_at, completed, created_at, updated_at)
      VALUES (?, 'unlinked-title-match', 'track', 'Audiobooks', 'Duplicate Artwork Title', ?, 0, ?, ?)
    `).run(user.id, nowIso, nowIso, nowIso);

    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db, new MockPlexAdapter(), { skipStartupUserSync: true });
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const first = await fetch(`${base}/api/artwork/audiobook:${audiobookId}`, { redirect: "manual" });
      assert.equal(first.status, 307);
      const location = first.headers.get("location");
      assert.match(location, /^\/api\/artwork\/audiobook%3A\d+\?variant=poster&v=[a-f0-9]{20}$/);
      assert.doesNotMatch(location, /127\.0\.0\.1|private-cover|unlinked-title-match/i);

      const final = await fetch(`${base}${location}`);
      assert.equal(final.status, 404);
      assert.equal(await final.text(), "");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("ingestion automatically refreshes missing metadata and retries stale fallbacks", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const user = db.prepare("SELECT id FROM users WHERE plex_username = 'Tony'").get();
    const watchedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO playback_observations
        (user_id, rating_key, media_type, library_name, title, watched_at, completed, created_at, updated_at)
      VALUES (?, 'automatic-metadata-item', 'movie', 'Movies', 'Automatic Fixture Movie', ?, 0, ?, ?)
    `).run(user.id, watchedAt, watchedAt, watchedAt);

    let calls = 0;
    let available = false;
    const plex = {
      getRichMetadataByRatingKey: async (ratingKey) => {
        calls++;
        if (!available) throw new Error("Plex temporarily unavailable");
        return { ratingKey, mediaType: "movie", title: "Recovered Fixture Movie", duration: 7200000, librarySectionID: "1", librarySectionTitle: "Movies", genres: [] };
      }
    };
    const metadata = new MetadataService(db, plex);
    const tautulli = {
      getRecentHistory: async ({ user: username }) => username === "Tony" ? [{ user: username, ratingKey: "automatic-metadata-item", mediaType: "movie", title: "Automatic Fixture Movie", watchedAt, percentComplete: 0 }] : []
    };
    const ingestion = new IngestionService(db, tautulli, metadata);

    await ingestion.pollRecentHistory();
    assert.equal(calls, 1);
    assert.equal(db.prepare("SELECT source_provenance FROM content_catalog WHERE rating_key = 'automatic-metadata-item'").get().source_provenance, "fallback");

    await ingestion.pollRecentHistory();
    assert.equal(calls, 1, "a fresh fallback should not be retried on every poll");

    available = true;
    const stale = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    db.prepare("UPDATE content_catalog SET refreshed_at = ? WHERE rating_key = 'automatic-metadata-item'").run(stale);
    await ingestion.pollRecentHistory();
    assert.equal(calls, 2);
    const repaired = db.prepare("SELECT title, source_provenance FROM content_catalog WHERE rating_key = 'automatic-metadata-item'").get();
    assert.equal(repaired.title, "Recovered Fixture Movie");
    assert.equal(repaired.source_provenance, "plex");
  });
});

test("dashboard service falls back to catalog libraries and groups explorer cards", () => {
  withTestDb((db) => {
    seedUsers(db);
    const user = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO audiobook_books (folder_key, title, authors_json, narrators_json, series_title, genres_json, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run("book-folder", "Guards! Guards!", JSON.stringify(["Terry Pratchett"]), JSON.stringify(["Nigel Planer"]), "Discworld", JSON.stringify(["Fantasy"]), "plex", "ready", now, now);
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, source_provenance, refreshed_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run("anime-1", "episode", "Episode 1", "Anime", "plex", now);
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, source_provenance, refreshed_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run("anime-2", "episode", "Episode 2", "Anime", "plex", now);
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, source_provenance, refreshed_at, audiobook_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("audio-1", "audiobook", "Chapter 1", "Audiobooks", "plex", now, 1);
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, source_provenance, refreshed_at, audiobook_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run("audio-2", "audiobook", "Chapter 2", "Audiobooks", "plex", now, 1);
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, "anime-1", "episode", null, "Episode 1", "Skyward", now, 50, 1500000, 0, now, now);
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, "anime-2", "episode", null, "Episode 2", "Skyward", now, 60, 1500000, 0, now, now);
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, "audio-1", "audiobook", null, "Chapter 1", "Guards! Guards!", now, 25, 1200000, 0, now, now);
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, "audio-2", "audiobook", null, "Chapter 2", "Guards! Guards!", now, 40, 1200000, 0, now, now);
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, "noise-1", "clip", null, "Broken file", null, now, 0, 60000, 0, now, now);
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(user.id, "unknown-track", "track", null, "01 - mystery file", null, now, 0, 60000, 0, now, now);
    const service = new DashboardService(db);
    const overview = service.getOverview({});
    assert.ok(overview.libraries.includes("Anime"));
    assert.ok(overview.libraries.includes("Audiobooks"));
    assert.equal(service.getActivity({ category: "anime" }).total, 2);
    assert.equal(service.getActivity({ category: "audiobook" }).total, 2);
    const media = service.getMedia({ sort: "title" });
    assert.equal(media.total, 2);
    assert.equal(media.items.length, 2);
    assert.equal(media.items.some((item) => item.category === "other"), false);
    assert.equal(media.items.some((item) => item.title === "01 - mystery file"), false);
    const anime = media.items.find((item) => item.category === "anime");
    const audio = media.items.find((item) => item.category === "audiobook");
    assert.ok(anime);
    assert.ok(audio);
    assert.equal(anime.plays, 2);
    assert.equal(anime.distinctItems, 2);
    assert.equal(audio.plays, 2);
    assert.equal(anime.title, "Skyward");
    assert.equal(audio.title, "Guards! Guards!");
  });
});

test("dashboard library browser sorts canonical titles and excludes hidden-user aggregates", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users ORDER BY plex_username").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    db.prepare("UPDATE users SET dashboard_shown = 0 WHERE plex_username = 'Viewer'").run();
    const now = new Date();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const add = (userId, key, title, minutesAgo, completed = true, progress = 100) => {
      const watchedAt = new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
      insert.run(userId, key, "movie", "Movies", title, watchedAt, progress, 7200000, completed ? 1 : 0, watchedAt, watchedAt);
    };
    add(byName.Tony.id, "movie-zulu", "2020 - Zulu", 5);
    add(byName.Tony.id, "movie-alpha", "!Alpha", 10);
    add(byName.Tony.id, "movie-bravo", "Bravo", 15);
    add(byName.Tony.id, "movie-bravo", "Bravo", 20);
    add(byName.Tony.id, "movie-continue", "Continuing", 2, false, 42);
    add(byName.Viewer.id, "movie-hidden", "Hidden Favorite", 1);
    add(byName.Viewer.id, "movie-hidden", "Hidden Favorite", 3);

    const service = new DashboardService(db);
    const titleSorted = service.getMedia({ category: "movie", sort: "title" });
    assert.deepEqual(titleSorted.items.map((item) => item.title), ["!Alpha", "Bravo", "Continuing", "2020 - Zulu"]);
    assert.equal(titleSorted.items.some((item) => item.title === "Hidden Favorite"), false);
    assert.equal(titleSorted.items.every((item) => typeof item.groupKey === "string" && item.groupKey.length > 0), true);

    const playsSorted = service.getMedia({ category: "movie", sort: "plays" });
    assert.equal(playsSorted.items[0].title, "Bravo");
    assert.equal(playsSorted.items[0].plays, 2);

    const firstPage = service.getMedia({ category: "movie", sort: "title", limit: 2, offset: 0 });
    const secondPage = service.getMedia({ category: "movie", sort: "title", limit: 2, offset: 2 });
    assert.equal(firstPage.total, 4);
    assert.deepEqual(firstPage.items.map((item) => item.groupKey), service.getMedia({ category: "movie", sort: "title", limit: 2, offset: 0 }).items.map((item) => item.groupKey));
    assert.equal(firstPage.items.some((item) => secondPage.items.some((candidate) => candidate.groupKey === item.groupKey)), false);

    const continuePage = service.getContinueConsuming({ category: "movie", sort: "progress", limit: 1, offset: 0 });
    assert.equal(continuePage.total, 1);
    assert.equal(continuePage.items[0].title, "Continuing");
    assert.equal(continuePage.items[0].percentComplete, 42);
    assert.equal(Array.isArray(service.getContinueWatching({ category: "movie", limit: 1 })), true);
  });
});

test("dashboard library participant labels aggregate visible aliases without implying co-watching", () => {
  withTestDb((db) => {
    seedUsers(db);
    const now = new Date();
    const nowIso = now.toISOString();
    db.prepare("UPDATE users SET dashboard_alias = 'Big T' WHERE plex_username = 'Tony'").run();
    db.prepare(`INSERT INTO users
      (plex_username,display_name,dashboard_alias,dashboard_shown,is_source_user,is_typical_cowatcher,enabled,created_at,updated_at)
      VALUES ('Alex','Alex','Ace',1,0,1,1,?,?)`).run(nowIso, nowIso);
    db.prepare(`INSERT INTO users
      (plex_username,display_name,dashboard_alias,dashboard_shown,is_source_user,is_typical_cowatcher,enabled,created_at,updated_at)
      VALUES ('Hidden','Hidden','Secret',0,0,1,1,?,?)`).run(nowIso, nowIso);
    const users = db.prepare("SELECT id, plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,grandparent_rating_key,parent_rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const addEpisode = (username, ratingKey, minutesAgo) => {
      const watchedAt = new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
      insert.run(byName[username].id, ratingKey, "show-shared", "season-shared", "episode", "TV Shows", `Episode ${ratingKey}`, "Shared Show", watchedAt, 45, 1800000, 0, watchedAt, watchedAt);
    };
    addEpisode("Alex", "episode-1", 1);
    addEpisode("Tony", "episode-2", 2);
    addEpisode("Tony", "episode-2", 3);
    addEpisode("Hidden", "episode-4", 4);
    addEpisode("Viewer", "episode-3", 2 * 24 * 60);

    const service = new DashboardService(db);
    const media = service.getMedia({ category: "tv", search: "Shared Show", completed: false });
    assert.equal(media.total, 1);
    assert.deepEqual(media.items[0].displayNames, ["Ace", "Big T", "Viewer"]);
    assert.equal(media.items[0].people.length, 3);
    assert.equal(media.items[0].displayName, "Ace");

    const continuing = service.getContinueConsuming({ category: "tv", search: "Shared Show" });
    assert.equal(continuing.total, 1);
    assert.deepEqual(continuing.items[0].displayNames, ["Ace", "Big T", "Viewer"]);

    const personFiltered = service.getMedia({ category: "tv", user: "Tony" });
    assert.deepEqual(personFiltered.items[0].displayNames, ["Big T"]);
    const dateFiltered = service.getMedia({ category: "tv", dateFrom: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() });
    assert.deepEqual(dateFiltered.items[0].displayNames, ["Ace", "Big T"]);
  });
});

test("dashboard cards and detail include explicit confirmed participants without duplicate playback", () => {
  withTestDb((db) => {
    seedUsers(db);
    const now = new Date().toISOString();
    const users = db.prepare("SELECT id, plex_username FROM users").all();
    const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
    db.prepare("UPDATE users SET dashboard_alias = 'Just J' WHERE plex_username = 'Viewer'").run();
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,grandparent_rating_key,parent_rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(byName.Tony.id, "confirmed-episode", "confirmed-show", "confirmed-season", "episode", "TV Shows", "Only Source Observed", "Confirmed Show", now, 100, 1800000, 1, now, now);
    const event = db.prepare(`INSERT INTO watch_events
      (source_user_id,rating_key,media_type,library_name,title,show_title,watched_at,prompt_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(byName.Tony.id, "confirmed-episode", "episode", "TV Shows", "Only Source Observed", "Confirmed Show", now, "resolved", now, now);
    db.prepare(`INSERT INTO cowatch_confirmations
      (watch_event_id,target_user_id,confirmation_method,status,plex_sync_status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`)
      .run(event.lastInsertRowid, byName.Viewer.id, "discord", "confirmed", "marked_watched", now, now);

    const service = new DashboardService(db);
    const activity = service.getActivity({ ratingKey: "confirmed-episode" }).items[0];
    assert.deepEqual(activity.displayNames, ["Just J", "Tony"]);
    assert.deepEqual(activity.confirmedUserIds, [byName.Viewer.id]);
    assert.equal(activity.evidence.confirmed, true);

    const media = service.getMedia({ category: "tv", search: "Confirmed Show" });
    assert.deepEqual(media.items[0].displayNames, ["Just J", "Tony"]);
    assert.deepEqual(new Set(media.items[0].people), new Set([byName.Tony.id, byName.Viewer.id]));
    const recent = service.getOverview({}).recentPlayback.find((item) => item.ratingKey === "confirmed-episode");
    assert.ok(recent);
    assert.deepEqual(recent.displayNames, ["Just J", "Tony"]);
    assert.equal(recent.evidence.relationship, "together");
    assert.deepEqual(service.getDetail("confirmed-episode").people.map((person) => person.displayName), ["Just J", "Tony"]);

    db.prepare("UPDATE users SET dashboard_shown = 0 WHERE plex_username = 'Viewer'").run();
    const hiddenActivity = service.getActivity({ ratingKey: "confirmed-episode" }).items[0];
    assert.deepEqual(hiddenActivity.displayNames, ["Tony"]);
    assert.deepEqual(hiddenActivity.confirmedUserIds, []);
    assert.equal(hiddenActivity.evidence.confirmed, false);
  });
});

test("dashboard poster cards retain one accessible viewer badge without duplicate overview copy", () => {
  const dashboardSource = fs.readFileSync(path.resolve("src/web/static/dashboard.js"), "utf8");
  assert.match(dashboardSource, /const libraryArt=x=>[^;]+viewerBadge\(x\)/);
  assert.match(dashboardSource, /const card=x=>[^;]+\$\{libraryArt\(x\)\}[^;]+\$\{watchedBy\(x\)\}/);
  assert.match(dashboardSource, /const badgeAttrs = `aria-label=/);
  assert.match(dashboardSource, /const sessionTimeLabel = item =>/);
  assert.match(dashboardSource, /\$\{libraryArt\(cw\)\}[\s\S]*\$\{sessionTimeLabel\(cw\)\}/);
  assert.doesNotMatch(dashboardSource, /\$\{libraryArt\(cw\)\}[\s\S]*\$\{watchedBy\(cw\)\}/);
});

test("dashboard detail workspace resolves raw and progress selectors to canonical identities", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = Object.fromEntries(db.prepare("SELECT id, plex_username FROM users").all().map((user) => [user.plex_username, user.id]));
    const now = "2026-07-10T12:00:00.000Z";
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, leaf_count, source_provenance, refreshed_at)
      VALUES ('movie-1', 'movie', 'Same Movie', 'Movies', 1, 'fixture', ?)`).run(now);
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, leaf_count, source_provenance, refreshed_at)
      VALUES ('show-1', 'show', 'Same Series', 'TV Shows', 2, 'fixture', ?)`).run(now);
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, grandparent_rating_key, grandparent_title, source_provenance, refreshed_at)
      VALUES ('episode-1', 'episode', 'Episode 1', 'TV Shows', 'show-1', 'Same Series', 'fixture', ?)`).run(now);
    db.prepare(`INSERT INTO audiobook_books (id, folder_key, title, subtitle, chapter_count, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (10, 'same-book-folder', 'Same Audiobook', 'A bounded subtitle', 2, 'plex', 'enriched', ?, ?)`).run(now, now);
    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, parent_rating_key, audiobook_id, source_provenance, refreshed_at)
      VALUES ('track-1', 'track', 'Chapter 1', 'Audiobooks', 'parent-1', 10, 'fixture', ?)`).run(now);
    const insertObservation = db.prepare(`INSERT INTO playback_observations
      (user_id, rating_key, grandparent_rating_key, media_type, library_name, title, show_title, watched_at, percent_complete, duration, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertObservation.run(users.Tony, "movie-1", null, "movie", "Movies", "Same Movie", null, now, 100, 600000, 1, now, now);
    insertObservation.run(users.Tony, "episode-1", "show-1", "episode", "TV Shows", "Episode 1", "Same Series", now, 50, 600000, 0, now, now);
    insertObservation.run(users.Tony, "track-1", null, "track", "Audiobooks", "Chapter 1", null, now, 50, 600000, 0, now, now);

    const service = new DashboardService(db);
    assert.equal(service.resolveDetailIdentity("movie-1").identity.detailKey, "movie:movie-1");
    assert.equal(service.resolveDetailIdentity("movie:Movies:movie-1").identity.detailKey, "movie:movie-1");
    assert.equal(service.resolveDetailIdentity("series:tv:TV Shows:show-1").identity.detailKey, "series:tv:show-1");
    assert.equal(service.resolveDetailIdentity("episode-1").identity.detailKey, "series:tv:show-1");
    assert.equal(service.resolveDetailIdentity("audiobook:Audiobooks:10").identity.detailKey, "audiobook:10");
    assert.equal(service.resolveDetailIdentity("track-1").identity.detailKey, "audiobook:10");
    assert.equal(service.resolveDetailIdentity("parent-1").identity.detailKey, "audiobook:10");

    const movie = service.getDetailWorkspace("movie-1");
    assert.equal(movie.ok, true);
    assert.equal(movie.data.detailKey, "movie:movie-1");
    assert.equal(movie.data.title, "Same Movie");
    assert.equal(movie.data.progressSummary.completedItems, 1);
    assert.equal(movie.data.hierarchy.available, true);
    assert.equal(movie.data.artworkUrl, movie.data.posterUrl);
    assert.match(movie.data.posterUrl, /^\/api\/artwork\/movie-1\?variant=poster&v=[a-f0-9]{20}$/);
    assert.match(movie.data.backdropUrl, /^\/api\/artwork\/movie-1\?variant=backdrop&v=[a-f0-9]{20}$/);
    assert.match(movie.data.artworkRevision, /^[a-f0-9]{20}$/);
    assert.equal(Object.hasOwn(movie.data, "plays"), false);

    const audiobook = service.getDetailWorkspace("audiobook:10");
    assert.equal(audiobook.ok, true);
    assert.equal(audiobook.data.category, "audiobook");
    assert.equal(audiobook.data.progressSummary.totalItems, 2);
    assert.equal(audiobook.data.artworkUrl, audiobook.data.posterUrl);
    assert.match(audiobook.data.posterUrl, /^\/api\/artwork\/audiobook%3A10\?variant=poster&v=[a-f0-9]{20}$/);

    db.prepare(`INSERT INTO audiobook_books
      (id,folder_key,title,chapter_count,source_provenance,enrichment_status,created_at,updated_at)
      VALUES (11,'verified-detail-book','Verified Detail Audiobook',3,'fixture','enriched',?,?)`).run(now, now);
    db.prepare(`INSERT INTO audiobook_chapter_sources
      (audiobook_id,source_type,source_status,confidence,refreshed_at)
      VALUES (11,'audiobook_tool','active',0.96,?)`).run(now);
    for (const [chapterIndex, title, startOffset, endOffset] of [
      [1, "Verified Detail Chapter 1", 0, 60000],
      [2, "Verified Detail Chapter 2", 60000, 120000],
      [3, "Verified Detail Chapter 3", 120000, 180000]
    ]) {
      db.prepare(`INSERT INTO audiobook_chapters
        (audiobook_id,chapter_index,title,start_offset_ms,end_offset_ms,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?)`).run(11, chapterIndex, title, startOffset, endOffset, now, now);
    }
    db.prepare(`INSERT INTO content_catalog
      (rating_key,media_type,title,library_title,audiobook_id,source_provenance,refreshed_at)
      VALUES ('verified-detail-track','track','Verified Detail Track','Audiobooks',11,'fixture',?)`).run(now);
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,view_offset,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(users.Tony, "verified-detail-track", "track", "Audiobooks", "Verified Detail Track", now, 50, 150000, 180000, 0, now, now);

    const verifiedAudiobook = service.getDetailWorkspace("audiobook:11");
    assert.equal(verifiedAudiobook.ok, true);
    assert.equal(verifiedAudiobook.data.progressSummary.unit, "chapter");
    assert.equal(verifiedAudiobook.data.progressSummary.source, "audiobook_tool");
    assert.equal(verifiedAudiobook.data.progressSummary.sourceVerified, true);
    assert.equal(verifiedAudiobook.data.progressSummary.completedItems, 2);
    assert.equal(verifiedAudiobook.data.progressSummary.totalItems, 3);
    assert.equal(verifiedAudiobook.data.progressSummary.currentPercent, 50);
    const verifiedHierarchy = service.getDetailWorkspaceHierarchy("audiobook:11");
    assert.equal(verifiedHierarchy.ok, true);
    assert.equal(verifiedHierarchy.data.hierarchy.chapters.length, 3);
    assert.equal(verifiedHierarchy.data.hierarchy.chapters.filter(chapter => Object.values(chapter.watchedStates).includes("watched")).length, 2);

    db.prepare(`INSERT INTO content_catalog (rating_key, media_type, title, library_title, source_provenance, refreshed_at)
      VALUES ('hidden-movie', 'movie', 'Hidden Movie', 'Movies', 'fixture', ?)`).run(now);
    insertObservation.run(users.Disabled, "hidden-movie", null, "movie", "Movies", "Hidden Movie", null, now, 100, 600000, 1, now, now);
    assert.equal(service.resolveDetailIdentity("hidden-movie").ok, false);
    assert.equal(service.resolveDetailIdentity("hidden-movie").errorCode, "DETAIL_NOT_FOUND");
  });
});

test("dashboard Movie history canonicalizes exact GUID keys into household-local viewing days", () => {
  withTestDb((db) => {
    seedUsers(db);
    const now = "2026-07-15T12:00:00.000Z";
    db.prepare("UPDATE users SET dashboard_alias = 'Garner' WHERE plex_username = 'Viewer'").run();
    db.prepare(`INSERT INTO users
      (plex_username,display_name,dashboard_alias,dashboard_shown,is_source_user,is_typical_cowatcher,enabled,created_at,updated_at)
      VALUES ('Dorothy','Dorothy','Dorothy',1,0,1,1,?,?)`).run(now, now);
    db.prepare(`INSERT INTO users
      (plex_username,display_name,dashboard_alias,dashboard_shown,is_source_user,is_typical_cowatcher,enabled,created_at,updated_at)
      VALUES ('Hidden','Hidden','Secret',0,0,1,1,?,?)`).run(now, now);
    const users = Object.fromEntries(db.prepare("SELECT id, plex_username FROM users").all().map(user => [user.plex_username, user.id]));
    const guid = "plex://movie/shang-chi-canonical";
    db.prepare(`INSERT INTO content_catalog
      (rating_key,guid,media_type,title,duration,library_title,source_provenance,refreshed_at)
      VALUES ('57417',?,'movie','Shang-Chi and the Legend of the Ten Rings',7920000,'Movies','fixture',?)`).run(guid, now);
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,plex_guid,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    insert.run(users.Tony, "23917", guid, "movie", "Movies", "Shang-Chi and the Legend of the Ten Rings", "2022-01-01T02:00:00.000Z", 100, 7920000, 1, now, now);
    insert.run(users.Viewer, "57417", guid, "movie", "Movies", "Shang-Chi and the Legend of the Ten Rings", "2026-07-14T18:00:00.000Z", 35, 7920000, 0, now, now);
    insert.run(users.Viewer, "57417", guid, "movie", "Movies", "Shang-Chi and the Legend of the Ten Rings", "2026-07-14T20:00:00.000Z", 100, 7920000, 1, now, now);
    insert.run(users.Dorothy, "57417", guid, "movie", "Movies", "Shang-Chi and the Legend of the Ten Rings", "2026-07-15T02:00:00.000Z", 100, 7920000, 1, now, now);
    insert.run(users.Hidden, "57417", guid, "movie", "Movies", "Shang-Chi and the Legend of the Ten Rings", "2026-07-15T03:00:00.000Z", 100, 7920000, 1, now, now);
    insert.run(users.Tony, "same-title-other", "plex://movie/different", "movie", "Movies", "Shang-Chi and the Legend of the Ten Rings", "2026-07-15T04:00:00.000Z", 100, 7920000, 1, now, now);

    const service = new DashboardService(db, { timeZone: "America/Toronto" });
    const result = service.getDetailWorkspace("movie:57417");
    assert.equal(result.ok, true);
    const history = result.data.movieHistory;
    assert.ok(history);
    assert.equal(history.canonicalGuid, guid);
    assert.equal(history.runtimeMinutes, 132);
    assert.equal(history.summary.rawObservationCount, 4);
    assert.equal(history.summary.sessionCount, 4);
    assert.equal(history.summary.viewingDayCount, 3);
    assert.equal(history.summary.replayCount, 0);
    assert.equal(history.summary.completedViewingDayCount, 3);
    assert.equal(history.summary.distinctViewerCount, 3);
    assert.deepEqual(history.people.map(person => person.displayName), ["Dorothy", "Garner", "Tony"]);
    assert.equal(history.rows.find(row => row.displayName === "Garner").observationCount, 2);
    assert.equal(history.rows.find(row => row.displayName === "Garner").sessionCount, 2);
    assert.equal(history.rows.find(row => row.displayName === "Tony").localDate, "2021-12-31");
    assert.equal(result.data.people.some(person => person.displayName === "Secret"), false);
    assert.equal(result.data.playbackSummary.plays, 4);
    assert.equal(result.data.playbackSummary.observationCount, 4);
    assert.equal(result.data.playbackSummary.sessionCount, 4);
    assert.equal(result.data.playbackSummary.replayCount, 0);
    assert.match(result.data.movieProfile.route, /movie-profile$/);
  });
});

function movieProfileEnvelope(overrides = {}) {
  return JSON.stringify({
    ok: true,
    tool: "exact_movie_profile",
    data: {
      schema_version: 1,
      status: "available",
      profile: {
        title: "Shang-Chi and the Legend of the Ten Rings",
        release_year: 2021,
        release_date: "2021-09-03",
        runtime_minutes: 132,
        genres: ["Action", "Adventure", "Fantasy"],
        directors: ["Destin Daniel Cretton"],
        cast: ["Simu Liu", "Awkwafina", "Tony Leung"],
        studios: ["Marvel Studios"],
        countries: ["United States"],
        content_rating: "PG-13",
        tagline: "You can't outrun your destiny.",
        synopsis: "Shang-Chi confronts the past he thought he left behind.",
        imdb_id: "tt3228774",
        tmdb_id: 566525,
        brand_tags: ["Marvel"],
        franchise_tags: ["Shang-Chi"],
        universe_tags: ["Marvel Cinematic Universe"],
        source_property_tags: ["Marvel Comics"],
        refreshed_at: "2026-07-15T12:00:00Z",
        file_path: "F:/private/movie.mkv",
        ...overrides
      }
    }
  });
}

function fakeMovieProfileProcess(responses, calls) {
  return (_executable, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.pid = 9876;
    child.kill = () => true;
    calls.push({ args: [...args], options });
    const response = responses.shift() ?? {};
    queueMicrotask(() => {
      if (response.error) return child.emit("error", new Error(response.error));
      if (response.stdout !== undefined) child.stdout.write(response.stdout);
      if (response.stderr !== undefined) child.stderr.write(response.stderr);
      if (!response.hang) child.emit("close", response.exitCode ?? 0);
    });
    return child;
  };
}

test("Movie profile adapter is exact, bounded, allowlisted, and timeout-safe", async () => {
  const calls = [];
  const adapter = new MovieProfileAdapter({
    executablePath: "python.exe",
    projectRoot: ".",
    timeoutMs: 25,
    spawnProcess: fakeMovieProfileProcess([{ stdout: movieProfileEnvelope() }], calls),
    killProcessTree: () => {}
  });
  const result = await adapter.fetchProfile({ ratingKey: "57417", imdbId: "tt3228774", tmdbId: 566525 });
  assert.equal(result.status, "available");
  assert.equal(result.profile.runtimeMinutes, 132);
  assert.equal(Object.hasOwn(result.profile, "file_path"), false);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes("exact-profile"));
  assert.equal(calls[0].args.some(arg => String(arg).includes("semantic")), false);
  assert.equal(calls[0].options.shell, false);

  const timeoutAdapter = new MovieProfileAdapter({
    executablePath: "python.exe",
    projectRoot: ".",
    timeoutMs: 5,
    spawnProcess: fakeMovieProfileProcess([{ hang: true }], []),
    killProcessTree: () => {}
  });
  assert.deepEqual(await timeoutAdapter.fetchProfile({ ratingKey: "57417" }), { status: "unavailable", reason: "timeout" });
});

test("Movie profile service coalesces misses, caches valid profiles, and backs off failures", async () => {
  await withTestDb(async (db) => {
    const nowIso = "2026-07-15T12:00:00.000Z";
    db.prepare(`INSERT INTO content_catalog (rating_key,media_type,title,source_provenance,refreshed_at)
      VALUES ('57417','movie','Shang-Chi and the Legend of the Ten Rings','fixture',?)`).run(nowIso);
    let clock = 1_000;
    let calls = 0;
    let fail = false;
    const profile = {
      schemaVersion: 1, title: "Shang-Chi and the Legend of the Ten Rings", releaseYear: 2021, releaseDate: "2021-09-03",
      runtimeMinutes: 132, genres: ["Action"], directors: ["Destin Daniel Cretton"], cast: ["Simu Liu"], studios: ["Marvel Studios"],
      countries: ["United States"], contentRating: "PG-13", tagline: null, synopsis: "Fixture synopsis", imdbId: "tt3228774", tmdbId: 566525,
      brandTags: ["Marvel"], franchiseTags: ["Shang-Chi"], universeTags: ["Marvel Cinematic Universe"], sourcePropertyTags: [],
      source: "media-bot", refreshedAt: nowIso
    };
    const adapter = { fetchProfile: async () => {
      calls += 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      return fail ? { status: "unavailable", reason: "upstream_unavailable" } : { status: "available", profile, cached: false };
    } };
    const service = new MovieProfileService(db, adapter, { ttlMs: 50, failureBackoffMs: 20, now: () => clock });
    const identity = { kind: "movie", category: "movie", ratingKey: "57417", detailKey: "movie:57417" };
    const [first, second] = await Promise.all([service.getProfile(identity), service.getProfile(identity)]);
    assert.equal(first.status, "available");
    assert.equal(second.status, "available");
    assert.equal(calls, 1);
    assert.equal((await service.getProfile(identity)).cached, true);
    assert.equal(calls, 1);
    clock += 51;
    fail = true;
    assert.equal((await service.getProfile(identity)).status, "unavailable");
    assert.equal(calls, 2);
    assert.equal((await service.getProfile(identity)).status, "unavailable");
    assert.equal(calls, 2);
  });
});

test("dashboard HTTP routes preserve privacy, CSV streaming, and confirmed prompt actions", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    const user = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?, 'movie-http', 'movie', 'Movies', 'HTTP Movie', ?, 100, 7200000, 1, ?, ?)`).run(user.id,now,now,now);
    const event = db.prepare(`INSERT INTO watch_events
      (source_user_id,rating_key,media_type,title,watched_at,prompt_status,created_at,updated_at)
      VALUES (?, 'movie-http', 'movie', 'HTTP Movie', ?, 'pending', ?, ?)`).run(user.id,now,now,now);
    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db,new MockPlexAdapter(), { skipStartupUserSync: true, discordReviewAvailable: false });
    // Wait for the async syncConfiguredUsers to complete in routes.ts, then re-seed
    await new Promise(r => setTimeout(r, 100));
    seedUsers(db);
    const server = await new Promise(resolve => { const instance=app.listen(0,"127.0.0.1",()=>resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const page = await (await fetch(base+"/")).text();
      assert.match(page,/Everything everyone is enjoying/);
      assert.match(page,/dashboard\.js/);
      assert.ok(page.indexOf('name="category"') < page.indexOf('name="user"'));
      assert.ok(page.indexOf('name="user"') < page.indexOf('name="search"'));
      const copyPage = await (await fetch(base+"/copy")).text();
      assert.match(copyPage,/api\/dashboard\/users/);
      assert.match(copyPage,/<th>Select<\/th>/);
      assert.match(copyPage,/row-select/);
      const overview = await (await fetch(base+"/api/dashboard/overview")).json();
      assert.equal(overview.ok,true);
      assert.equal(overview.data.totals.plays,1);
      assert.equal(typeof overview.data.timingMs,"number");
      assert.equal(overview.data.activity.items[0].artworkUrl, overview.data.activity.items[0].posterUrl);
      assert.match(overview.data.activity.items[0].posterUrl, /^\/api\/artwork\/movie-http\?variant=poster&v=[a-f0-9]{20}$/);
      assert.match(overview.data.activity.items[0].artworkRevision, /^[a-f0-9]{20}$/);
      const timeline = await (await fetch(base+"/api/dashboard/timeline")).json();
      assert.equal(timeline.ok,true);
      assert.equal(timeline.data.items.length,1);
      assert.equal(timeline.data.sessions.length,1);
      assert.equal(timeline.data.sessions[0].itemCount,1);
      const media = await (await fetch(base+"/api/dashboard/media?category=movie&sort=plays&limit=1")).json();
      assert.equal(media.ok,true);
      assert.equal(media.data.items[0].groupKey,"movie:Movies:movie-http");
      const continueConsuming = await (await fetch(base+"/api/dashboard/continue-consuming?limit=1")).json();
      assert.equal(continueConsuming.ok,true);
      assert.equal(continueConsuming.data.total,0);
      const continueWatching = await (await fetch(base+"/api/dashboard/continue-watching?limit=1")).json();
      assert.equal(Array.isArray(continueWatching.data),true);
      const progressHttp = await (await fetch(base+"/api/dashboard/progress?limit=1")).json();
      assert.equal(progressHttp.ok,true);
      assert.ok(progressHttp.data.recentlyActive);
      assert.ok(progressHttp.data.continue);
      assert.ok(progressHttp.data.recentlyCompleted);
      assert.ok(Array.isArray(progressHttp.data.progress));
      const detail = await (await fetch(base+"/api/dashboard/detail/movie-http")).json();
      assert.equal(detail.ok,true);
      assert.equal(detail.data.item.title,"HTTP Movie");
      assert.equal(detail.data.repeatCount,0);
      assert.equal(typeof detail.data.timingMs,"number");
      const workspace = await (await fetch(base+"/api/dashboard/detail-workspace/"+encodeURIComponent("movie:movie-http"))).json();
      assert.equal(workspace.ok,true);
      assert.equal(workspace.data.detailKey,"movie:movie-http");
      assert.equal(workspace.data.title,"HTTP Movie");
      assert.equal(workspace.data.hierarchy.available,true);
      const rawWorkspace = await (await fetch(base+"/api/dashboard/detail-workspace/movie-http")).json();
      assert.equal(rawWorkspace.ok,true);
      assert.equal(rawWorkspace.data.detailKey,workspace.data.detailKey);
      const refreshPreview = await fetch(base+"/api/dashboard/detail-workspace/"+encodeURIComponent("movie:movie-http")+"/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false })
      });
      assert.equal(refreshPreview.status, 200);
      assert.equal((await refreshPreview.json()).data.dryRun, true);
      const refreshDenied = await fetch(base+"/api/dashboard/detail-workspace/"+encodeURIComponent("movie:movie-http")+"/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true })
      });
      assert.equal(refreshDenied.status, 400);
      assert.equal((await refreshDenied.json()).errorCode, "CONFIRMATION_REQUIRED");
      const refreshApplied = await fetch(base+"/api/dashboard/detail-workspace/"+encodeURIComponent("movie:movie-http")+"/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, confirm: true })
      });
      assert.equal(refreshApplied.status, 200);
      const refreshedWorkspace = await refreshApplied.json();
      assert.equal(refreshedWorkspace.ok, true);
      assert.equal(refreshedWorkspace.data.workspace.title, "Mock Movie");
      assert.match(refreshedWorkspace.data.artworkRevision, /^[a-f0-9]{20}$/);
      const refreshAgain = await fetch(base+"/api/dashboard/detail-workspace/"+encodeURIComponent("movie:movie-http")+"/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, confirm: true })
      });
      const refreshedAgain = await refreshAgain.json();
      assert.equal(refreshAgain.status, 200);
      assert.equal(refreshedAgain.data.status, "unchanged");
      assert.equal(refreshedAgain.data.artworkRevision, refreshedWorkspace.data.artworkRevision);
      assert.doesNotMatch(JSON.stringify(refreshedWorkspace), /file_path|X-Plex-Token|private/i);
      assert.ok(db.prepare("SELECT id FROM audit_log WHERE action = 'dashboard_detail_refresh' AND status = 'ok'").get());
      const people = await (await fetch(base+"/api/dashboard/people?period=7d")).json();
      assert.equal(people.ok,true);
      assert.equal(people.data.window.period,"7d");
      const invalidPeopleResponse = await fetch(base+"/api/dashboard/people?period=custom&dateFrom=2026-07-05&dateTo=2026-07-01");
      const invalidPeople = await invalidPeopleResponse.json();
      assert.equal(invalidPeopleResponse.status,400);
      assert.equal(invalidPeople.errorCode,"VALIDATION_ERROR");
      assert.doesNotMatch(JSON.stringify(overview),/X-Plex-Token|file_path|folder_path_hint/);
      const csvResponse=await fetch(base+"/api/dashboard/export.csv");
      assert.match(csvResponse.headers.get("content-type"),/text\/csv/);
      const csv=await csvResponse.text();
      assert.match(csv,/watched_at,person,category/);
      assert.match(csv,/HTTP Movie/);
      assert.doesNotMatch(csv,/X-Plex-Token|file_path|folder_path_hint/);
      const denied=await fetch(base+`/api/dashboard/prompts/${event.lastInsertRowid}/dismiss`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      assert.equal(denied.status,400);
      const discordReviewUnavailable=await fetch(base+"/api/dashboard/cowatch-reviews/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/ask-discord",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apply:true,confirm:true,requestId:"disabled-review-1"})});
      assert.equal(discordReviewUnavailable.status,409);
      assert.equal((await discordReviewUnavailable.json()).errorCode,"DISCORD_REVIEW_UNAVAILABLE");
      const accepted=await fetch(base+`/api/dashboard/prompts/${event.lastInsertRowid}/dismiss`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:true})});
      assert.equal(accepted.status,200);
      assert.equal(db.prepare("SELECT prompt_status FROM watch_events WHERE id=?").get(event.lastInsertRowid).prompt_status,"dismissed");
      assert.ok(db.prepare("SELECT id FROM audit_log WHERE action='dashboard_prompt_dismissed'").get());
    } finally { await new Promise(resolve=>server.close(resolve)); }
  });
});

test("dashboard timeline uses bounded windows and summary endpoints stay sampled", () => {
  withTestDb((db) => {
    seedUsers(db);
    const user = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get();
    const insert = db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,show_title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    const now = new Date();
    for (let i = 0; i < 600; i++) {
      const watchedAt = new Date(now.getTime() - (i % 9) * 24 * 60 * 60 * 1000).toISOString();
      insert.run(user.id, `movie-${i}`, "movie", "Movies", `Movie ${i}`, null, watchedAt, 100, 7200000, 1, watchedAt, watchedAt);
    }
    const service = new DashboardService(db);
    const timeline = service.getTimeline({ days: 30, limit: 1000 });
    const overview = service.getOverview({});

    assert.equal(timeline.windowDays, 7);
    assert.equal(timeline.items.length <= 1000, true);
    assert.equal(typeof timeline.timingMs, "number");
    assert.equal(overview.activity.limit, 48);
    assert.equal(overview.activity.items.length <= 48, true);
    assert.equal(typeof overview.windows.overview, "string");
    assert.equal(typeof overview.timingMs, "number");
  });
});

test("dashboard overview attention lane stays evidence-backed", () => {
  withTestDb((db) => {
    seedUsers(db);
    const users = db.prepare("SELECT id, plex_username FROM users WHERE enabled = 1 ORDER BY id").all();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO playback_observations
      (user_id,rating_key,media_type,library_name,title,watched_at,percent_complete,duration,completed,created_at,updated_at)
      VALUES (?, 'movie-attention', 'movie', 'Movies', 'Attention Movie', ?, 40, 3600000, 0, ?, ?)`).run(users[0].id, now, now, now);
    db.prepare(`INSERT INTO watch_events
      (source_user_id,rating_key,media_type,title,watched_at,prompt_status,created_at,updated_at)
      VALUES (?, 'movie-attention', 'movie', 'Attention Movie', ?, 'pending', ?, ?)`).run(users[0].id, now, now, now);
    db.prepare(`INSERT INTO sync_failures
      (action,target_user_id,rating_key,error,created_at)
      VALUES ('apply_history_copy', ?, 'movie-attention', 'PLEX_TIMEOUT', ?)`).run(users[1].id, now);

    const overview = new DashboardService(db).getOverview({});
    assert.equal(overview.needsAttention.length >= 1, true);
    assert.equal(overview.needsAttention.some(item => item.kind === "unresolved_prompt"), true);
    assert.equal(overview.needsAttention.some(item => item.kind === "plex_sync_failed"), true);
  });
});

test("artwork endpoint uses transcoding, caching headers, and optimizes loading", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    
    let richMetadataCallCount = 0;
    class TranscodeMockPlexAdapter extends MockPlexAdapter {
      async getRichMetadataByRatingKey(ratingKey, plexGuid) {
        richMetadataCallCount++;
        if (ratingKey === "transcode-test") {
          return {
            ratingKey,
            mediaType: "movie",
            title: "Transcode Test Movie",
            thumb: "/library/metadata/123/thumb/456",
            genres: []
          };
        }
        return super.getRichMetadataByRatingKey(ratingKey, plexGuid);
      }
    }

    const { createApp } = await import("../dist/server/app.js");
    const app = createApp(db, new TranscodeMockPlexAdapter(), { skipStartupUserSync: true });
    const server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    const originalFetch = globalThis.fetch;
    let lastFetchedUrl = null;
    globalThis.fetch = async (url, options) => {
      lastFetchedUrl = String(url);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => new ArrayBuffer(8)
      };
    };

    try {
      // 1. Fetch artwork for the first time
      const res1 = await originalFetch(base + "/api/artwork/transcode-test");
      assert.equal(res1.status, 200);
      assert.equal(res1.headers.get("cache-control"), "private, max-age=604800, immutable");
      
      // Verify the server fetched the transcoded Plex URL
      assert.ok(lastFetchedUrl);
      assert.match(lastFetchedUrl, /\/photo\/\:\/transcode/);
      assert.match(lastFetchedUrl, /width=300/);
      assert.match(lastFetchedUrl, /height=450/);
      assert.match(lastFetchedUrl, /url=%2Flibrary%2Fmetadata%2F123%2Fthumb%2F456/);

      // Verify Plex adapter was called once
      assert.equal(richMetadataCallCount, 1);

      // Reset fetch spy
      lastFetchedUrl = null;

      // 2. Fetch artwork for the second time (should hit in-memory cache)
      const res2 = await originalFetch(base + "/api/artwork/transcode-test");
      assert.equal(res2.status, 200);
      assert.equal(res2.headers.get("cache-control"), "private, max-age=604800, immutable");

      // Verify it still proxy fetched the image, but did NOT resolve metadata again
      assert.ok(lastFetchedUrl);
      assert.equal(richMetadataCallCount, 1); // Should still be 1 (cached!)

    } finally {
      globalThis.fetch = originalFetch;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test("dashboard service meets latency budget under load", async () => {
  await withTestDb(async (db) => {
    seedUsers(db);
    
    const users = db.prepare("SELECT id FROM users ORDER BY id").all();
    const userIds = users.map(u => u.id);

    const now = Date.now();
    const insertStmt = db.prepare(`
      INSERT INTO playback_observations (
        user_id, rating_key, media_type, library_name, title, watched_at, percent_complete, duration, completed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec("BEGIN TRANSACTION");
    for (let i = 0; i < 500; i++) {
      const userId = userIds[i % userIds.length];
      const ratingKey = `movie-${Math.floor(i / 5)}`;
      const watchedAt = new Date(now - i * 15 * 60 * 1000).toISOString();
      insertStmt.run(
        userId,
        ratingKey,
        "movie",
        "Movies",
        `Movie ${ratingKey}`,
        watchedAt,
        100,
        7200000,
        1,
        watchedAt,
        watchedAt
      );
    }
    db.exec("COMMIT");

    const { DashboardService } = await import("../dist/service/dashboardService.js");
    const service = new DashboardService(db);

    const tStart = performance.now();
    const overview = service.getOverview({});
    const duration = performance.now() - tStart;

    console.log(`[Perf] getOverview with 500 rows took ${duration.toFixed(2)} ms`);
    
    assert.ok(duration < 300, `getOverview was too slow: ${duration} ms (limit: 300 ms)`);
  });
});

test("dashboard service progress contract separates observations, sessions, and replays", () => {
  withTestDb((db) => {
    seedUsers(db);
    // Prepare users
    db.prepare("UPDATE users SET dashboard_alias = 'Tony Alias' WHERE plex_username = 'Tony'").run();
    db.prepare("UPDATE users SET dashboard_shown = 0 WHERE plex_username = 'Viewer'").run(); // Hide Viewer

    const users = db.prepare("SELECT id, plex_username, dashboard_alias FROM users").all();
    const byUsername = Object.fromEntries(users.map(u => [u.plex_username, u]));

    const insert = db.prepare(`
      INSERT INTO playback_observations
      (user_id, rating_key, grandparent_rating_key, parent_rating_key, media_type, library_name, title, show_title, watched_at, percent_complete, duration, completed, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    // Insert audiobook cover metadata
    db.prepare(`
      INSERT INTO audiobook_books (id, folder_key, title, cover_url, chapter_count, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (10, 'hobbit-folder', 'The Hobbit', 'http://example.com/hobbit.jpg', 15, 'folder_path', 'pending', '2026-07-06T12:00:00Z', '2026-07-06T12:00:00Z')
    `).run();
    db.prepare(`
      INSERT INTO content_catalog (rating_key, media_type, title, library_title, audiobook_id, source_provenance, refreshed_at)
      VALUES ('track-1', 'track', 'Chapter 1', 'Audiobooks', 10, 'plex', '2026-07-06T12:00:00Z')
    `).run();

    const now = new Date();
    const addObs = (username, key, gpKey, pKey, type, lib, title, showTitle, minutesAgo, completed, progress, duration = 1800000) => {
      const watchedAt = new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
      const u = byUsername[username];
      if (!u) throw new Error(`User not found: ${username}`);
      insert.run(u.id, key, gpKey, pKey, type, lib, title, showTitle, watchedAt, progress, duration, completed ? 1 : 0, watchedAt, watchedAt);
    };

    // 1. Duplicate same-session completion observations must not become a replay.
    addObs("Tony", "ep-1", "show-1", "season-1", "episode", "TV Shows", "Episode 1", "Great Show", 10, true, 100);
    addObs("Tony", "ep-1", "show-1", "season-1", "episode", "TV Shows", "Episode 1", "Great Show", 5, true, 100);

    // 2. Partial play: Tony plays Episode 2 (incomplete)
    addObs("Tony", "ep-2", "show-1", "season-1", "episode", "TV Shows", "Episode 2", "Great Show", 2, false, 45);

    // 3. Hidden user plays: Viewer plays show-1 Episode 3 (should be ignored in progress since Viewer is hidden)
    addObs("Viewer", "ep-3", "show-1", "season-1", "episode", "TV Shows", "Episode 3", "Great Show", 1, true, 100);

    // 4. Audiobook play
    addObs("Tony", "track-1", "gp-audio", "parent-audio", "track", "Audiobooks", "Chapter 1", "The Hobbit", 12, false, 25);

    // Insert TV Show metadata
    db.prepare(`
      INSERT INTO content_catalog (rating_key, media_type, title, library_title, leaf_count, source_provenance, refreshed_at)
      VALUES ('show-1', 'show', 'Great Show', 'TV Shows', 24, 'plex', '2026-07-06T12:00:00Z')
    `).run();

    const service = new DashboardService(db);
    const result = service.getProgress({});

    // Verify response structure
    assert.ok(result.recentlyActive);
    assert.ok(result.continue);
    assert.ok(result.recentlyCompleted);
    assert.ok(Array.isArray(result.recentlyActive.items));
    assert.ok(Array.isArray(result.continue.items));
    assert.ok(Array.isArray(result.recentlyCompleted.items));

    // Verify TV Show aggregation
    const tvGroup = result.recentlyActive.items.find(x => x.title === "Great Show");
    assert.ok(tvGroup);
    assert.equal(tvGroup.category, "tv");
    assert.equal(tvGroup.totalKnown, true);
    assert.equal(tvGroup.totalItems, 24);
    assert.equal(tvGroup.plays, 3); // 2 completed + 1 partial by Tony (Viewer ignored)
    assert.equal(tvGroup.completedPlays, 2);
    assert.equal(tvGroup.partials, 1);
    assert.equal(tvGroup.distinctItems, 2); // ep-1 and ep-2 (Viewer's ep-3 ignored)
    assert.equal(tvGroup.distinctCompleted, 1); // Only ep-1 completed (repeated completed plays did not inflate this!)
    assert.equal(tvGroup.observationCount, 3);
    assert.equal(tvGroup.sessionCount, 2);
    assert.equal(tvGroup.viewingDayCount, 2);
    assert.equal(tvGroup.replayCount, 0);

    // Verify hidden user exclusion and alias application in person context
    assert.equal(tvGroup.people.length, 1); // Only Tony is visible, Viewer excluded
    assert.equal(tvGroup.people[0].displayName, "Tony Alias");
    assert.equal(tvGroup.people[0].plays, 3);
    assert.equal(tvGroup.people[0].observationCount, 3);
    assert.equal(tvGroup.people[0].sessionCount, 2);
    assert.equal(tvGroup.people[0].replayCount, 0);
    assert.equal(tvGroup.people[0].distinctItems, 2);
    assert.equal(tvGroup.people[0].distinctCompleted, 1);

    // Verify Audiobook aggregation and canonical book-cover artwork
    const abGroup = result.recentlyActive.items.find(x => x.title === "The Hobbit");
    assert.ok(abGroup);
    assert.equal(abGroup.category, "audiobook");
    assert.equal(abGroup.totalKnown, false);
    assert.equal(abGroup.totalItems, 15);
    assert.equal(abGroup.progressUnit, "track");
    // Artwork key must use canonical book identity
    assert.equal(abGroup.artworkUrl, abGroup.posterUrl);
    assert.match(abGroup.posterUrl, /^\/api\/artwork\/audiobook%3A10\?variant=poster&v=[a-f0-9]{20}$/);
  });

  tests.push({
    name: "dashboard progress expansion contract verifies lazy-loaded hierarchies, distinct completion, hidden user exclusion, and timingMs",
    fn: () => withTestDb(async (db) => {
      // Seed users (including hidden user and alias)
      db.prepare(`
        INSERT INTO users (plex_username, display_name, dashboard_alias, dashboard_shown, enabled, created_at, updated_at)
        VALUES ('tony-plex', 'Tony', 'Tony Alias', 1, 1, '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
      `).run();
      const tonyId = Number(db.prepare("SELECT last_insert_rowid()").get()["last_insert_rowid()"]);

      db.prepare(`
        INSERT INTO users (plex_username, display_name, dashboard_alias, dashboard_shown, enabled, created_at, updated_at)
        VALUES ('alex-plex', 'Alex', 'Ace', 1, 1, '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
      `).run();
      const alexId = Number(db.prepare("SELECT last_insert_rowid()").get()["last_insert_rowid()"]);

      db.prepare(`
        INSERT INTO users (plex_username, display_name, dashboard_alias, dashboard_shown, enabled, created_at, updated_at)
        VALUES ('hidden-plex', 'Hidden', 'Hidden Alias', 0, 1, '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
      `).run();
      const hiddenId = Number(db.prepare("SELECT last_insert_rowid()").get()["last_insert_rowid()"]);

      // Seed TV Show content catalog grandparent
      db.prepare(`
        INSERT INTO content_catalog (rating_key, media_type, title, library_title, leaf_count, source_provenance, refreshed_at)
        VALUES ('show-1', 'show', 'Great Show', 'TV Shows', 24, 'plex', '2026-07-06T12:00:00Z')
      `).run();

      // Seed TV Show episodes
      db.prepare(`
        INSERT INTO content_catalog (rating_key, media_type, title, library_title, grandparent_rating_key, grandparent_title, parent_title, parent_rating_key, source_provenance, refreshed_at)
        VALUES ('ep-1', 'episode', 'Episode 1', 'TV Shows', 'show-1', 'Great Show', 'Season 1', 'season-1', 'plex', '2026-07-06T12:00:00Z')
      `).run();
      db.prepare(`
        INSERT INTO content_catalog (rating_key, media_type, title, library_title, grandparent_rating_key, grandparent_title, parent_title, parent_rating_key, source_provenance, refreshed_at)
        VALUES ('ep-2', 'episode', 'Episode 2', 'TV Shows', 'show-1', 'Great Show', 'Season 1', 'season-1', 'plex', '2026-07-06T12:00:00Z')
      `).run();

      // Seed audiobook book
      db.prepare(`
        INSERT INTO audiobook_books (id, folder_key, title, series_title, chapter_count, source_provenance, enrichment_status, created_at, updated_at)
        VALUES (10, 'hobbit-folder', 'The Hobbit', 'Middle Earth', 3, 'audnexus', 'enriched', '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
      `).run();

      // Seed audiobook chapters
      db.prepare(`
        INSERT INTO content_catalog (rating_key, media_type, title, library_title, audiobook_id, source_provenance, refreshed_at)
        VALUES ('ch-1', 'track', 'Chapter 1', 'Audiobooks', 10, 'plex', '2026-07-06T12:00:00Z')
      `).run();
      db.prepare(`
        INSERT INTO content_catalog (rating_key, media_type, title, library_title, audiobook_id, source_provenance, refreshed_at)
        VALUES ('ch-2', 'track', 'Chapter 2', 'Audiobooks', 10, 'plex', '2026-07-06T12:00:00Z')
      `).run();

      // Seed TV observations (Tony watched Ep 1 & Ep 2; Alex watched Ep 1; Hidden watched Ep 2)
      db.prepare(`
        INSERT INTO playback_observations (user_id, rating_key, grandparent_rating_key, parent_rating_key, media_type, library_name, title, show_title, watched_at, watched_at_provenance, percent_complete, duration, completed, created_at, updated_at)
        VALUES (${tonyId}, 'ep-1', 'show-1', 'season-1', 'episode', 'TV Shows', 'Episode 1', 'Great Show', '2026-07-06T10:00:00Z', 'plex', 100, 1800000, 1, '2026-07-06T10:00:00Z', '2026-07-06T10:00:00Z')
      `).run();
      db.prepare(`
        INSERT INTO playback_observations (user_id, rating_key, grandparent_rating_key, parent_rating_key, media_type, library_name, title, show_title, watched_at, watched_at_provenance, percent_complete, duration, completed, created_at, updated_at)
        VALUES (${tonyId}, 'ep-2', 'show-1', 'season-1', 'episode', 'TV Shows', 'Episode 2', 'Great Show', '2026-07-06T11:00:00Z', 'plex', 50, 1800000, 0, '2026-07-06T11:00:00Z', '2026-07-06T11:00:00Z')
      `).run();
      db.prepare(`
        INSERT INTO playback_observations (user_id, rating_key, grandparent_rating_key, parent_rating_key, media_type, library_name, title, show_title, watched_at, watched_at_provenance, percent_complete, duration, completed, created_at, updated_at)
        VALUES (${alexId}, 'ep-1', 'show-1', 'season-1', 'episode', 'TV Shows', 'Episode 1', 'Great Show', '2026-07-06T14:00:00Z', 'plex', 100, 1800000, 1, '2026-07-06T14:00:00Z', '2026-07-06T14:00:00Z')
      `).run();
      db.prepare(`
        INSERT INTO playback_observations (user_id, rating_key, grandparent_rating_key, parent_rating_key, media_type, library_name, title, show_title, watched_at, watched_at_provenance, percent_complete, duration, completed, created_at, updated_at)
        VALUES (${hiddenId}, 'ep-2', 'show-1', 'season-1', 'episode', 'TV Shows', 'Episode 2', 'Great Show', '2026-07-06T11:00:00Z', 'plex', 100, 1800000, 1, '2026-07-06T11:00:00Z', '2026-07-06T11:00:00Z')
      `).run();

      // Seed Audiobook observations (Tony listened to Ch 1)
      db.prepare(`
        INSERT INTO playback_observations (user_id, rating_key, media_type, library_name, title, watched_at, watched_at_provenance, percent_complete, duration, completed, created_at, updated_at)
        VALUES (${tonyId}, 'ch-1', 'track', 'Audiobooks', 'Chapter 1', '2026-07-06T12:00:00Z', 'plex', 100, 900000, 1, '2026-07-06T12:00:00Z', '2026-07-06T12:00:00Z')
      `).run();

      const service = new DashboardService(db);

      // 1. Expand TV Show Group Key
      const tvExpansion = service.getProgressExpansion("series:tv:TV Shows:show-1");
      assert.ok(tvExpansion);
      assert.equal(tvExpansion.category, "tv");
      assert.equal(tvExpansion.title, "Great Show");
      assert.equal(tvExpansion.totalKnown, true);
      assert.equal(tvExpansion.totalItems, 24);
      assert.equal(tvExpansion.distinctItems, 2); // ep-1 and ep-2 (plays exist)
      assert.equal(tvExpansion.distinctCompleted, 1); // Only ep-1 completed by Tony & Alex
      assert.ok(tvExpansion.timingMs >= 0);

      // Verify TV Hierarchy Node structure
      assert.equal(tvExpansion.hierarchy.type, "tv");
      const seasons = tvExpansion.hierarchy.seasons;
      assert.equal(seasons.length, 1);
      assert.equal(seasons[0].seasonNumber, 1);
      assert.equal(seasons[0].episodes.length, 2);

      const ep1 = seasons[0].episodes.find(e => e.ratingKey === "ep-1");
      assert.ok(ep1);
      assert.equal(ep1.watchedStates["Tony Alias"], "watched");
      assert.equal(ep1.watchedStates["Ace"], "watched"); // Alias resolved
      assert.equal(ep1.watchedStates["Hidden Alias"], undefined); // Hidden excluded

      const ep2 = seasons[0].episodes.find(e => e.ratingKey === "ep-2");
      assert.ok(ep2);
      assert.equal(ep2.watchedStates["Tony Alias"], "partial"); // 50% complete
      assert.equal(ep2.watchedStates["Hidden Alias"], undefined); // Hidden excluded

      // 2. Expand Audiobook Group Key
      const abExpansion = service.getProgressExpansion("audiobook:Audiobooks:10");
      assert.ok(abExpansion);
      assert.equal(abExpansion.category, "audiobook");
      assert.equal(abExpansion.title, "The Hobbit");
      assert.equal(abExpansion.hierarchy.type, "audiobook");
      assert.equal(abExpansion.hierarchy.series, "Middle Earth");
      assert.equal(abExpansion.hierarchy.chapters.length, 2);

      const ch1 = abExpansion.hierarchy.chapters.find(c => c.ratingKey === "ch-1");
      assert.ok(ch1);
      assert.equal(ch1.watchedStates["Tony Alias"], "watched");
    })
  });
});

test("audiobook chapter import verifies dry-run, apply database caching, and hasVerifiedChapters reporting", async () => {
  await withTestDb(async (db) => {
    db.prepare(`
      INSERT INTO audiobook_books (id, folder_key, title, series_title, chapter_count, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (10, 'hobbit-folder', 'The Hobbit', 'Middle Earth', 3, 'audnexus', 'enriched', '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
    `).run();

    const catalog = new AudiobookCatalogService(db);

    const importData = {
      audiobookId: 10,
      chapters: [
        { index: 1, title: "Chapter 1", start_offset_ms: 0, end_offset_ms: 60000 },
        { index: 2, title: "Chapter 2", start_offset_ms: 60000, end_offset_ms: 120000 }
      ]
    };

    const dryRunResult = catalog.importChapters(importData, { apply: false });
    assert.equal(dryRunResult.success, true);
    assert.equal(dryRunResult.dryRun, true);
    assert.equal(dryRunResult.chaptersCount, 2);

    const dryRunSources = db.prepare("SELECT COUNT(*) AS count FROM audiobook_chapter_sources").get().count;
    assert.equal(dryRunSources, 0);

    const applyResult = catalog.importChapters(importData, { apply: true });
    assert.equal(applyResult.success, true);
    assert.equal(applyResult.dryRun, false);

    const source = db.prepare("SELECT * FROM audiobook_chapter_sources WHERE audiobook_id = 10").get();
    assert.ok(source);
    assert.equal(source.source_type, "audiobook_tool");
    assert.equal(source.source_status, "active");

    const chapters = db.prepare("SELECT * FROM audiobook_chapters WHERE audiobook_id = 10 ORDER BY chapter_index").all();
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].title, "Chapter 1");
    assert.equal(chapters[1].title, "Chapter 2");
    assert.equal(chapters[1].start_offset_ms, 60000);
    const activeRevision = db.prepare(`
      SELECT revision.* FROM audiobook_books book
      JOIN audiobook_chapter_revisions revision ON revision.id = book.active_chapter_revision_id
      WHERE book.id = 10
    `).get();
    assert.ok(activeRevision);
    assert.match(activeRevision.media_revision, /^legacy:/);
    assert.equal(db.prepare(`
      SELECT COUNT(*) AS count FROM audiobook_chapter_revision_items WHERE chapter_revision_id = ?
    `).get(activeRevision.id).count, 2);

    assert.throws(() => catalog.importChapters({
      audiobookId: 10,
      chapters: [
        { index: 1, title: "Duplicate A", start_offset_ms: 0, end_offset_ms: 30000 },
        { index: 1, title: "Duplicate B", start_offset_ms: 30000, end_offset_ms: 60000 }
      ]
    }, { apply: true }));
    assert.deepEqual(
      db.prepare("SELECT title FROM audiobook_chapters WHERE audiobook_id = 10 ORDER BY chapter_index").all()
        .map((row) => row.title),
      ["Chapter 1", "Chapter 2"],
      "failed replacement must preserve the active compatibility cache"
    );

    const { DashboardService } = await import("../dist/service/dashboardService.js");
    const dashboard = new DashboardService(db);

    db.prepare(`
      INSERT INTO users (id, plex_username, display_name, enabled, created_at, updated_at)
      VALUES (1, 'Tony', 'Tony', 1, '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
    `).run();

    db.prepare(`
      INSERT INTO playback_observations (user_id, rating_key, media_type, library_name, title, watched_at, watched_at_provenance, completed, duration, created_at, updated_at)
      VALUES (1, 'ch-1', 'track', 'Audiobooks', 'Chapter 1', '2026-07-06T10:00:00Z', 'plex', 1, 60000, '2026-07-06T10:00:00Z', '2026-07-06T10:00:00Z')
    `).run();

    db.prepare(`
      INSERT INTO content_catalog (rating_key, media_type, title, library_title, audiobook_id, source_provenance, refreshed_at)
      VALUES ('ch-1', 'track', 'Chapter 1', 'Audiobooks', 10, 'plex', '2026-07-06T12:00:00Z')
    `).run();

    const progress = dashboard.getProgress({ user: "Tony" });
    const progressItem = progress.recentlyActive.items.find(x => x.title === "The Hobbit");
    assert.ok(progressItem);
    assert.equal(progressItem.hasVerifiedChapters, true);
    assert.equal(progressItem.progressUnit, "chapter");
    assert.equal(progressItem.progressSource, "audiobook_tool");
    assert.equal(progressItem.progressSourceVerified, true);
    assert.equal(progressItem.totalKnown, true);
    assert.equal(progressItem.totalItems, 2);

    const expansion = dashboard.getProgressExpansion("audiobook:Audiobooks:10");
    assert.ok(expansion);
    assert.equal(expansion.hasVerifiedChapters, true);
    assert.equal(expansion.progressUnit, "chapter");
    assert.equal(expansion.totalKnown, true);

    db.prepare("UPDATE audiobook_books SET current_media_revision = 'replacement-media' WHERE id = 10").run();
    const staleProgress = dashboard.getProgress({ user: "Tony" }).recentlyActive.items.find(x => x.title === "The Hobbit");
    assert.ok(staleProgress);
    assert.equal(staleProgress.hasVerifiedChapters, false);
    assert.equal(staleProgress.progressUnit, "track");
    assert.equal(staleProgress.progressSource, "plex");
    const staleExpansion = dashboard.getProgressExpansion("audiobook:Audiobooks:10");
    assert.ok(staleExpansion);
    assert.equal(staleExpansion.hasVerifiedChapters, false);
    assert.equal(staleExpansion.progressUnit, "track");
  });
});

test("verified audiobook chapter progress maps offsets, book completion, repeats, and source-uncertain fallback", async () => {
  await withTestDb(async (db) => {
    for (const [id, username, alias] of [
      [1, "Tony", "Tony Alias"],
      [2, "Alex", "Ace"],
      [3, "Justin", "Justin"]
    ]) {
      db.prepare(`
        INSERT INTO users (id, plex_username, display_name, dashboard_alias, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
      `).run(id, username, username, alias);
    }

    db.prepare(`
      INSERT INTO audiobook_books (id, folder_key, title, series_title, chapter_count, source_provenance, enrichment_status, created_at, updated_at)
      VALUES (30, 'single-file-folder', 'Single File Book', 'Verified Series', 1, 'fixture', 'enriched', '2026-07-06T00:00:00Z', '2026-07-06T00:00:00Z')
    `).run();
    db.prepare(`
      INSERT INTO audiobook_chapter_sources (audiobook_id, source_type, source_status, confidence, refreshed_at)
      VALUES (30, 'audiobook_tool', 'active', 0.92, '2026-07-06T12:00:00Z')
    `).run();
    for (const [index, title, start, end] of [
      [1, "Verified Chapter 1", 0, 60000],
      [2, "Verified Chapter 2", 60000, 120000],
      [3, "Verified Chapter 3", 120000, 180000]
    ]) {
      db.prepare(`
        INSERT INTO audiobook_chapters (audiobook_id, chapter_index, title, start_offset_ms, end_offset_ms, created_at, updated_at)
        VALUES (30, ?, ?, ?, ?, '2026-07-06T12:00:00Z', '2026-07-06T12:00:00Z')
      `).run(index, title, start, end);
    }
    db.prepare(`
      INSERT INTO content_catalog (rating_key, media_type, title, duration, library_title, audiobook_id, source_provenance, refreshed_at)
      VALUES ('single-file-book', 'track', 'Single File Book', 180000, 'Audiobooks', 30, 'fixture', '2026-07-06T12:00:00Z')
    `).run();

    const insertObservation = db.prepare(`
      INSERT INTO playback_observations
        (user_id, rating_key, media_type, library_name, title, watched_at, watched_at_provenance, percent_complete, percent_complete_provenance, view_offset, duration, completed, created_at, updated_at)
      VALUES (?, 'single-file-book', 'track', 'Audiobooks', 'Single File Book', ?, 'fixture', ?, 'fixture', ?, ?, ?, ?, ?)
    `);
    insertObservation.run(1, '2026-07-06T10:45:00Z', 50, null, 60000, 0, '2026-07-06T10:45:00Z', '2026-07-06T10:45:00Z');
    insertObservation.run(1, '2026-07-06T10:30:00Z', 15, 30000, 180000, 0, '2026-07-06T10:30:00Z', '2026-07-06T10:30:00Z');
    insertObservation.run(1, '2026-07-06T10:15:00Z', 45, null, 60000, 0, '2026-07-06T10:15:00Z', '2026-07-06T10:15:00Z');
    insertObservation.run(2, '2026-07-06T11:00:00Z', null, null, 180000, 1, '2026-07-06T11:00:00Z', '2026-07-06T11:00:00Z');
    insertObservation.run(3, '2026-07-06T12:00:00Z', null, 9999999, 180000, 0, '2026-07-06T12:00:00Z', '2026-07-06T12:00:00Z');

    const { DashboardService } = await import("../dist/service/dashboardService.js");
    const dashboard = new DashboardService(db);

    const tonyProgress = dashboard.getProgress({ user: "Tony" }).recentlyActive.items.find(x => x.title === "Single File Book");
    assert.ok(tonyProgress);
    assert.equal(tonyProgress.progressUnit, "chapter");
    assert.equal(tonyProgress.progressSource, "audiobook_tool");
    assert.equal(tonyProgress.totalKnown, true);
    assert.equal(tonyProgress.totalItems, 3);
    assert.equal(tonyProgress.currentChapterIndex, 2);
    assert.equal(tonyProgress.currentProgressPercent, 50);
    assert.equal(tonyProgress.distinctCompleted, 1);
    assert.equal(tonyProgress.distinctItems, 2);
    assert.equal(tonyProgress.observationCount, 3);
    assert.equal(tonyProgress.sessionCount, 1);
    assert.equal(tonyProgress.viewingDayCount, 1);
    assert.equal(tonyProgress.replayCount, 0);
    assert.equal(tonyProgress.people[0].distinctCompleted, 1);
    assert.equal(tonyProgress.people[0].partials, 1);
    assert.equal(tonyProgress.people[0].observationCount, 3);
    assert.equal(tonyProgress.people[0].sessionCount, 1);
    assert.equal(tonyProgress.people[0].replayCount, 0);

    const expansion = dashboard.getProgressExpansion("audiobook:Audiobooks:30");
    assert.ok(expansion);
    assert.equal(expansion.progressUnit, "chapter");
    assert.equal(expansion.progressSourceVerified, true);
    assert.equal(expansion.totalItems, 3);
    assert.equal(expansion.currentChapterIndex, 3);
    assert.equal(expansion.currentProgressPercent, 100);
    assert.equal(expansion.distinctCompleted, 3);
    assert.equal(expansion.hierarchy.type, "audiobook");

    const [chapter1, chapter2, chapter3] = expansion.hierarchy.chapters;
    assert.equal(chapter1.chapterIndex, 1);
    assert.equal(chapter1.watchedStates["Tony Alias"], "watched");
    assert.equal(chapter1.stateSources["Tony Alias"], "verified_offset");
    assert.equal(chapter1.watcherEvidence.find(row => row.displayName === "Tony Alias").observationCount, 3);
    assert.equal(chapter1.watcherEvidence.find(row => row.displayName === "Tony Alias").sessionCount, 1);
    assert.equal(chapter1.watcherEvidence.find(row => row.displayName === "Tony Alias").replayCount, 0);
    assert.equal(chapter2.watchedStates["Tony Alias"], "partial");
    assert.equal(chapter2.partialPositions["Tony Alias"], 50);
    assert.equal(chapter3.watchedStates["Tony Alias"], "unknown");
    assert.equal(chapter3.watchedStates["Ace"], "watched");
    assert.equal(chapter3.stateSources["Ace"], "book_completion");
    assert.equal(chapter1.watchedStates["Justin"], "source_uncertain");
    assert.equal(chapter1.stateSources["Justin"], "source_uncertain");

    insertObservation.run(1, '2026-07-07T10:45:00Z', 50, null, 60000, 0, '2026-07-07T10:45:00Z', '2026-07-07T10:45:00Z');
    const replayExpansion = dashboard.getProgressExpansion("audiobook:Audiobooks:30");
    const replayChapter = replayExpansion.hierarchy.chapters[0];
    const replayEvidence = replayChapter.watcherEvidence.find(row => row.displayName === "Tony Alias");
    assert.equal(replayChapter.watchedStates["Tony Alias"], "repeated");
    assert.equal(replayEvidence.sessionCount, 2);
    assert.equal(replayEvidence.viewingDayCount, 2);
    assert.equal(replayEvidence.replayCount, 1);
    assert.equal(replayEvidence.replayReason, "different_viewing_day");
  });
});

function proofEnvelope(data, extras = {}) {
  return JSON.stringify({ ok: true, tool: "fixture", data, ...extras });
}

function proofErrorEnvelope(code, message) {
  return JSON.stringify({ ok: false, tool: "fixture", error: { code, message } });
}

function fakeProofProcess(responses, calls) {
  return (_executable, args, spawnOptions) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.pid = 4321;
    child.kill = () => true;
    const command = args[1];
    calls.push({ command, args: [...args], options: spawnOptions });
    const response = responses.shift() ?? {};
    queueMicrotask(() => {
      if (response.error) {
        child.emit("error", new Error(response.error));
        return;
      }
      if (response.stdout !== undefined) child.stdout.write(response.stdout);
      if (response.stderr !== undefined) child.stderr.write(response.stderr);
      if (!response.hang) child.emit("close", response.exitCode ?? 0);
    });
    return child;
  };
}

const cleanValidation = {
  chapter_count: 2,
  has_chapters: true,
  overlapping_chapters: 0,
  short_chapters: 0,
  duration_gap_s: 0,
  missing_titles: 0,
  duplicate_timestamps: 0,
  duplicate_titles: 0
};

const validEmbeddedChapters = [
  { title: "Opening", start_ms: 0, end_ms: 60_000 },
  { title: "Ending", start_ms: 60_000, end_ms: 120_000 }
];

const validResolvedChapters = validEmbeddedChapters.map((chapter) => ({
  ...chapter,
  source: "audnexus",
  confidence: "high"
}));

test("audiobook proof adapter validates embedded chapters and skips resolve", async () => {
  const calls = [];
  let activation = null;
  const adapter = new AudiobookProofAdapter({
    executablePath: "python.exe",
    scriptPath: "C:\\trusted\\audiobook\\src\\repairchapters.py",
    spawnProcess: fakeProofProcess([
      { stdout: proofEnvelope({ duration_s: 120, chapter_count: 2, chapters: validEmbeddedChapters, tags: { private: "ignored" } }) },
      { stdout: proofEnvelope(cleanValidation), exitCode: 7 }
    ], calls),
    killProcessTree: () => assert.fail("valid process must not be killed")
  });
  const result = await adapter.proveAndActivate({
    privateFilePath: "F:\\Private\\Book.m4b",
    durationMs: 120_000
  }, {
    audiobookId: 10,
    mediaRevision: "revision-1",
    activatedAt: "2026-07-12T00:00:00Z"
  }, (input) => { activation = input; });

  assert.equal(result.status, "activatable");
  assert.deepEqual(result.commands, ["inspect", "validate"]);
  assert.equal(result.candidate.sourceType, "embedded");
  assert.equal(activation.sourceStatus, "active");
  assert.equal(activation.mediaRevision, "revision-1");
  assert.deepEqual(calls.map((call) => call.command), ["inspect", "validate"]);
  assert.equal(calls.every((call) => call.options.shell === false), true);
  assert.equal(calls.every((call) => call.options.cwd === "C:\\trusted\\audiobook\\src"), true);
  assert.equal(JSON.stringify(result).includes("F:\\Private"), false);
  assert.equal(JSON.stringify(result).includes("tags"), false);
});

test("audiobook proof adapter normalizes Eric-shaped embedded starts and ignores advisory end-gap checks", async () => {
  const durationMs = 14_326_503;
  const starts = Array.from({ length: 57 }, (_, index) => index <= 5 ? index * 12_000 : 60_000 + (index - 5) * 270_000);
  const chapters = starts.map((start, index) => ({
    title: `Chapter ${index + 1}`,
    start_ms: start,
    end_ms: index < starts.length - 1 ? starts[index + 1] : start + 3_600_000
  }));
  const calls = [];
  let activation = null;
  const adapter = new AudiobookProofAdapter({
    executablePath: "python.exe",
    scriptPath: "C:\\trusted\\repairchapters.py",
    spawnProcess: fakeProofProcess([
      { stdout: proofEnvelope({ duration_s: durationMs / 1_000, chapter_count: chapters.length, chapters }) },
      { stdout: proofEnvelope({
        ...cleanValidation,
        chapter_count: chapters.length,
        short_chapters: 5,
        duration_gap_s: 3_547.655
      }) }
    ], calls),
    killProcessTree: () => assert.fail("valid process must not be killed")
  });

  const result = await adapter.proveAndActivate({
    privateFilePath: "F:\\Private\\Eric.m4b",
    durationMs
  }, {
    audiobookId: 34,
    mediaRevision: "eric-revision",
    activatedAt: "2026-07-12T00:00:00Z"
  }, (input) => { activation = input; });

  assert.equal(result.status, "activatable");
  assert.equal(result.candidate.sourceType, "embedded");
  assert.deepEqual(result.commands, ["inspect", "validate"]);
  assert.deepEqual(calls.map((call) => call.command), ["inspect", "validate"]);
  assert.equal(activation.chapters.length, 57);
  assert.equal(activation.chapters.at(-1).end_offset_ms, durationMs);
  assert.equal(activation.chapters.filter((chapter) => chapter.end_offset_ms - chapter.start_offset_ms < 30_000).length, 5);
  for (let index = 0; index < activation.chapters.length; index++) {
    const chapter = activation.chapters[index];
    assert.ok(chapter.end_offset_ms > chapter.start_offset_ms);
    assert.ok(chapter.end_offset_ms <= durationMs);
    if (index < activation.chapters.length - 1) {
      assert.equal(chapter.end_offset_ms, activation.chapters[index + 1].start_offset_ms);
    }
  }
  assert.equal(JSON.stringify(result).includes("Private"), false);
});

test("audiobook proof adapter resolves missing chapters and activates only approved evidence", async () => {
  const calls = [];
  let activations = 0;
  const adapter = new AudiobookProofAdapter({
    executablePath: "python.exe",
    scriptPath: "C:\\trusted\\repairchapters.py",
    spawnProcess: fakeProofProcess([
      { stdout: proofEnvelope({ duration_s: 120, chapter_count: 0, chapters: [] }) },
      { stdout: proofEnvelope({
        source: "audnexus", whisper_verified: false, whisper_available: true, total_duration_ms: 120_000,
        warnings: ["bounded warning"], chapters: validResolvedChapters
      }) }
    ], calls),
    killProcessTree: () => {}
  });
  const result = await adapter.proveAndActivate({
    privateFilePath: "F:\\Private\\Book.m4b",
    durationMs: 120_000,
    asin: "b012345678"
  }, { audiobookId: 11, mediaRevision: "revision-2", activatedAt: "2026-07-12T00:00:00Z" }, () => {
    activations++;
  });
  assert.equal(result.status, "activatable");
  assert.equal(result.candidate.sourceType, "audnexus");
  assert.deepEqual(result.commands, ["inspect", "resolve"]);
  assert.equal(activations, 1);
  assert.deepEqual(calls.map((call) => call.command), ["inspect", "resolve"]);
  assert.ok(calls[1].args.includes("B012345678"));
  assert.equal(calls[1].args.includes("--whisper"), false);

  const invalidAsin = await adapter.prove({
    privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000, asin: "bad/path"
  });
  assert.deepEqual(invalidAsin, { status: "failed", code: "INVALID_ASIN", retryable: false, commands: [] });
});

test("audiobook proof adapter resolves invalid embedded starts and preserves an allowlisted rejection warning", async () => {
  const calls = [];
  const adapter = new AudiobookProofAdapter({
    executablePath: "python.exe",
    scriptPath: "C:\\trusted\\repairchapters.py",
    spawnProcess: fakeProofProcess([
      { stdout: proofEnvelope({
        duration_s: 120,
        chapter_count: 2,
        chapters: [validEmbeddedChapters[0], { ...validEmbeddedChapters[1], start_ms: 0 }]
      }) },
      { stdout: proofEnvelope({ ...cleanValidation, duplicate_timestamps: 1 }) },
      { stdout: proofEnvelope({
        source: "audnexus", whisper_verified: false, whisper_available: true,
        total_duration_ms: 120_000, warnings: [], chapters: validResolvedChapters
      }) }
    ], calls),
    killProcessTree: () => {}
  });
  const result = await adapter.prove({ privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000 });
  assert.equal(result.status, "activatable");
  assert.deepEqual(result.commands, ["inspect", "validate", "resolve"]);
  assert.deepEqual(calls.map((call) => call.command), ["inspect", "validate", "resolve"]);
  assert.deepEqual(result.candidate.warnings, ["EMBEDDED_STARTS_INVALID"]);
});

test("audiobook proof adapter rejects malformed embedded starts without clamping and retains low-confidence provenance", async () => {
  const invalidCases = [
    [validEmbeddedChapters[0], { ...validEmbeddedChapters[1], start_ms: 0 }],
    [validEmbeddedChapters[0], { ...validEmbeddedChapters[1], start_ms: -1 }],
    [validEmbeddedChapters[0], { ...validEmbeddedChapters[1], start_ms: 60_000.5 }],
    [validEmbeddedChapters[0], { ...validEmbeddedChapters[1], start_ms: 120_000 }],
    [validEmbeddedChapters[0], { ...validEmbeddedChapters[1], title: "" }],
    [
      { title: "One", start_ms: 0, end_ms: 80_000 },
      { title: "Two", start_ms: 80_000, end_ms: 100_000 },
      { title: "Three", start_ms: 60_000, end_ms: 120_000 }
    ]
  ];
  for (const chapters of invalidCases) {
    let activations = 0;
    const adapter = new AudiobookProofAdapter({
      executablePath: "python.exe",
      scriptPath: "C:\\trusted\\repairchapters.py",
      spawnProcess: fakeProofProcess([
        { stdout: proofEnvelope({ duration_s: 120, chapter_count: chapters.length, chapters }) },
        { stdout: proofEnvelope({ ...cleanValidation, chapter_count: chapters.length }) },
        { stdout: proofEnvelope({
          source: "silence_detection", whisper_verified: false, whisper_available: false,
          total_duration_ms: 120_000, warnings: [],
          chapters: validResolvedChapters.map((chapter) => ({ ...chapter, source: "silence_detection", confidence: "low" }))
        }) }
      ], []),
      killProcessTree: () => {}
    });
    const result = await adapter.proveAndActivate({
      privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000
    }, { audiobookId: 12, mediaRevision: "invalid-embedded", activatedAt: "2026-07-12T00:00:00Z" }, () => {
      activations++;
    });
    assert.equal(result.status, "diagnostic");
    assert.equal(result.code, "LOW_CONFIDENCE");
    assert.deepEqual(result.commands, ["inspect", "validate", "resolve"]);
    assert.ok(result.diagnostic.warnings.includes("EMBEDDED_STARTS_INVALID"));
    assert.equal(activations, 0);
  }
});

test("audiobook proof adapter rejects malformed validation contracts and embedded duration mismatch", async () => {
  const malformedValidationAdapter = new AudiobookProofAdapter({
    executablePath: "python.exe",
    scriptPath: "C:\\trusted\\repairchapters.py",
    spawnProcess: fakeProofProcess([
      { stdout: proofEnvelope({ duration_s: 120, chapter_count: 2, chapters: validEmbeddedChapters }) },
      { stdout: proofEnvelope({ ...cleanValidation, duration_gap_s: "unknown" }) }
    ], []),
    killProcessTree: () => {}
  });
  const malformed = await malformedValidationAdapter.prove({ privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000 });
  assert.equal(malformed.status, "failed");
  assert.equal(malformed.code, "MALFORMED_EXTERNAL_OUTPUT");

  const mismatchAdapter = new AudiobookProofAdapter({
    executablePath: "python.exe",
    scriptPath: "C:\\trusted\\repairchapters.py",
    spawnProcess: fakeProofProcess([
      { stdout: proofEnvelope({ duration_s: 131, chapter_count: 2, chapters: validEmbeddedChapters }) }
    ], []),
    killProcessTree: () => {}
  });
  const mismatch = await mismatchAdapter.prove({ privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000 });
  assert.equal(mismatch.status, "failed");
  assert.equal(mismatch.code, "DURATION_MISMATCH");
  assert.deepEqual(mismatch.commands, ["inspect"]);
});

test("audiobook proof adapter rejects unsafe envelopes and redacts child diagnostics", async () => {
  for (const [stdout, code] of [
    [proofErrorEnvelope("PROBE_FAILED", "F:\\Private\\Book.m4b token=secret"), "EXTERNAL_ERROR_ENVELOPE"],
    [proofEnvelope({ duration_s: 120, chapter_count: 0, chapters: [] }, { version: 2 }), "UNSUPPORTED_CONTRACT_VERSION"],
    ["not json F:\\Private\\Book.m4b", "MALFORMED_EXTERNAL_OUTPUT"]
  ]) {
    const adapter = new AudiobookProofAdapter({
      executablePath: "python.exe",
      scriptPath: "C:\\trusted\\repairchapters.py",
      spawnProcess: fakeProofProcess([{ stdout, stderr: "secret path F:\\Private\\Book.m4b" }], []),
      killProcessTree: () => {}
    });
    const result = await adapter.prove({ privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000 });
    assert.equal(result.status, "failed");
    assert.equal(result.code, code);
    assert.equal(JSON.stringify(result).includes("Private"), false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("audiobook proof adapter rejects invalid and uncertain chapter candidates before activation", async () => {
  const cases = [
    { chapters: [validResolvedChapters[0]], duration: 60_000, code: "INVALID_CHAPTERS" },
    { chapters: [validResolvedChapters[0], { ...validResolvedChapters[1], start_ms: 50_000 }], duration: 120_000, code: "INVALID_CHAPTERS" },
    { chapters: [validResolvedChapters[0], { ...validResolvedChapters[1], end_ms: 130_000 }], duration: 120_000, code: "INVALID_CHAPTERS" },
    { chapters: validResolvedChapters.map((chapter, index) => index === 1 ? { ...chapter, end_ms: 100_000 } : chapter), duration: 120_000, code: "DURATION_MISMATCH" },
    {
      chapters: validResolvedChapters.map((chapter) => ({ ...chapter, confidence: "medium" })),
      duration: 120_000,
      code: "LOW_CONFIDENCE",
      warnings: ["private file F:\\Private\\Book.m4b token=secret"]
    },
    { chapters: validResolvedChapters.map((chapter) => ({ ...chapter, title: "" })), duration: 120_000, code: "INVALID_CHAPTERS" }
  ];
  for (const fixture of cases) {
    let activations = 0;
    const adapter = new AudiobookProofAdapter({
      executablePath: "python.exe",
      scriptPath: "C:\\trusted\\repairchapters.py",
      spawnProcess: fakeProofProcess([
        { stdout: proofEnvelope({ duration_s: fixture.duration / 1_000, chapter_count: 0, chapters: [] }) },
        { stdout: proofEnvelope({
          source: "audnexus", whisper_verified: false, whisper_available: true, total_duration_ms: fixture.duration,
          warnings: fixture.warnings ?? [], chapters: fixture.chapters
        }) }
      ], []),
      killProcessTree: () => {}
    });
    const result = await adapter.proveAndActivate({
      privateFilePath: "F:\\Private\\Book.m4b", durationMs: fixture.duration
    }, { audiobookId: 12, mediaRevision: "revision-3", activatedAt: "2026-07-12T00:00:00Z" }, () => {
      activations++;
    });
    assert.notEqual(result.status, "activatable");
    assert.equal(result.code, fixture.code);
    assert.equal(activations, 0);
    assert.equal(JSON.stringify(result).includes("Private"), false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});

test("audiobook proof adapter enforces output bounds and timeout with process-tree termination", async () => {
  for (const response of [
    { stdout: Buffer.alloc(2 * 1024 * 1024 + 1, 65) },
    { stderr: Buffer.alloc(64 * 1024 + 1, 65), hang: true },
    { hang: true }
  ]) {
    let kills = 0;
    const adapter = new AudiobookProofAdapter({
      executablePath: "python.exe",
      scriptPath: "C:\\trusted\\repairchapters.py",
      timeoutMs: response.stdout || response.stderr ? 100 : 5,
      spawnProcess: fakeProofProcess([response], []),
      killProcessTree: () => { kills++; }
    });
    const result = await adapter.prove({ privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000 });
    assert.equal(result.status, "failed");
    assert.equal(result.code, response.hang && !response.stderr ? "EXTERNAL_TIMEOUT" : "EXTERNAL_OUTPUT_LIMIT");
    assert.equal(kills, 1);
  }
});

test("audiobook proof adapter keeps Whisper opt-in and accepts verified results when enabled", async () => {
  const calls = [];
  const adapter = new AudiobookProofAdapter({
    executablePath: "python.exe",
    scriptPath: "C:\\trusted\\repairchapters.py",
    whisperEnabled: true,
    spawnProcess: fakeProofProcess([
      { stdout: proofEnvelope({ duration_s: 120, chapter_count: 0, chapters: [] }) },
      { stdout: proofEnvelope({
        source: "silence_detection", whisper_verified: true, whisper_available: true, total_duration_ms: 120_000,
        warnings: [], chapters: validResolvedChapters.map((chapter) => ({ ...chapter, confidence: "medium" }))
      }) }
    ], calls),
    killProcessTree: () => {}
  });
  const result = await adapter.prove({
    privateFilePath: "F:\\Private\\Book.m4b", durationMs: 120_000, whisper: true
  });
  assert.equal(result.status, "activatable");
  assert.equal(result.candidate.sourceType, "whisper_verified");
  assert.ok(calls[1].args.includes("--whisper"));
});

function seedProofRevision(db, {
  audiobookId = 200,
  revision = "proof-revision-1",
  status = "ready",
  currentRevision = revision,
  privatePath = "F:\\Private\\Proof Book.m4b",
  durationMs = 120_000
} = {}) {
  db.prepare(`
    INSERT OR IGNORE INTO audiobook_books
      (id, folder_key, title, source_provenance, enrichment_status, identity_status,
       current_media_revision, created_at, updated_at)
    VALUES (?, ?, 'Proof Book', 'fixture', 'enriched', 'identified', ?,
      '2026-07-12T00:00:00Z', '2026-07-12T00:00:00Z')
  `).run(audiobookId, `proof-${audiobookId}`, currentRevision);
  db.prepare("UPDATE audiobook_books SET current_media_revision = ? WHERE id = ?").run(currentRevision, audiobookId);
  const inserted = db.prepare(`
    INSERT INTO audiobook_media_revisions
      (audiobook_id, media_revision, track_count, file_count, total_duration_ms, manifest_status, created_at)
    VALUES (?, ?, 1, 1, ?, ?, '2026-07-12T00:00:00Z')
  `).run(audiobookId, revision, durationMs, status);
  db.prepare(`
    INSERT INTO audiobook_media_revision_items
      (revision_id, item_order, stable_identity, duration_ms, private_file_path, path_hash)
    VALUES (?, 0, 'guid:proof', ?, ?, 'safe-hash')
  `).run(Number(inserted.lastInsertRowid), durationMs, privatePath);
  db.prepare(`
    INSERT INTO audiobook_discovery_outbox
      (audiobook_id, media_revision, trigger_reason, created_at, manifest_status)
    VALUES (?, ?, 'manual', '2026-07-12T00:00:00Z', ?)
  `).run(audiobookId, revision, status);
}

function activatableProofResult(activate, activationBase) {
  const candidate = {
    chapters: [
      { index: 1, title: "Opening", start_offset_ms: 0, end_offset_ms: 60_000 },
      { index: 2, title: "Ending", start_offset_ms: 60_000, end_offset_ms: 120_000 }
    ],
    sourceType: "audnexus",
    confidence: 0.95,
    contractVersion: 1,
    warnings: []
  };
  activate({ ...activationBase, ...candidate, sourceStatus: "active" });
  return { status: "activatable", candidate, commands: ["inspect", "resolve"] };
}

test("audiobook proof worker materializes one durable job per revision and classifies unsupported media", async () => {
  await withTestDb(async (db) => {
    seedProofRevision(db);
    seedProofRevision(db, { audiobookId: 201, revision: "multi-revision", status: "unsupported_multi_file" });
    const worker = new AudiobookProofWorkerService(db, { proveAndActivate: async () => assert.fail("materialization must not invoke adapter") }, true,
      () => new Date("2026-07-12T01:00:00Z"));
    assert.equal(worker.materializeOutbox(new Date("2026-07-12T01:00:00Z")), 2);
    assert.equal(worker.materializeOutbox(new Date("2026-07-12T01:01:00Z")), 0);
    const jobs = db.prepare("SELECT audiobook_id, state, safe_result_code FROM audiobook_proof_jobs ORDER BY audiobook_id").all();
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].state, "pending");
    assert.equal(jobs[1].state, "unsupported_multi_file");
    assert.equal(jobs[1].safe_result_code, "UNSUPPORTED_MULTI_FILE");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_discovery_outbox WHERE consumed_at IS NULL").get().count, 0);
  });
});

test("audiobook proof worker activates one job, throttles the next cycle, and skips unchanged verified revisions", async () => {
  await withTestDb(async (db) => {
    seedProofRevision(db);
    let adapterCalls = 0;
    const adapter = {
      proveAndActivate: async (_input, activationBase, activate) => {
        adapterCalls++;
        return activatableProofResult(activate, activationBase);
      }
    };
    const now = new Date("2026-07-12T01:00:00Z");
    const worker = new AudiobookProofWorkerService(db, adapter, true, () => now);
    const first = await worker.runOnce({ force: true, now });
    assert.equal(first.state, "succeeded");
    assert.equal(first.safeCode, "VERIFIED");
    assert.equal(adapterCalls, 1);
    assert.ok(db.prepare("SELECT active_chapter_revision_id FROM audiobook_books WHERE id = 200").get().active_chapter_revision_id);
    const throttled = await worker.runOnce({ now: new Date(now.getTime() + 60_000) });
    assert.equal(throttled.status, "throttled");

    db.prepare(`UPDATE audiobook_proof_jobs SET state = 'pending', attempt_count = 0, completed_at = NULL,
      safe_result_code = NULL WHERE audiobook_id = 200`).run();
    db.prepare("UPDATE audiobook_proof_state SET next_run_at = NULL").run();
    const skipped = await worker.runOnce({ force: true, now: new Date(now.getTime() + 120_000) });
    assert.equal(skipped.safeCode, "ALREADY_VERIFIED");
    assert.equal(adapterCalls, 1);

    seedProofRevision(db, { audiobookId: 200, revision: "proof-revision-2", currentRevision: "proof-revision-2" });
    assert.equal(worker.materializeOutbox(new Date(now.getTime() + 180_000)), 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audiobook_proof_jobs WHERE audiobook_id = 200").get().count, 2);
    db.prepare("UPDATE audiobook_books SET current_media_revision = 'proof-revision-3' WHERE id = 200").run();
    db.prepare("UPDATE audiobook_proof_state SET next_run_at = NULL").run();
    const superseded = await worker.runOnce({ force: true, now: new Date(now.getTime() + 240_000) });
    assert.equal(superseded.safeCode, "SUPERSEDED_REVISION");
    assert.equal(superseded.state, "failed_terminal");
    assert.equal(adapterCalls, 1, "superseded work must not invoke the adapter");
  });
});

test("audiobook proof worker applies deterministic retry delays and terminates the fifth failure", async () => {
  await withTestDb(async (db) => {
    seedProofRevision(db);
    const adapter = {
      proveAndActivate: async () => ({ status: "failed", code: "EXTERNAL_TIMEOUT", retryable: true, commands: ["inspect"] })
    };
    const worker = new AudiobookProofWorkerService(db, adapter, true, () => new Date("2026-07-12T01:00:00Z"));
    const delays = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];
    let now = new Date("2026-07-12T01:00:00Z");
    for (let attempt = 1; attempt <= 5; attempt++) {
      const result = await worker.runOnce({ force: true, now });
      const job = db.prepare("SELECT * FROM audiobook_proof_jobs WHERE audiobook_id = 200").get();
      assert.equal(job.attempt_count, attempt);
      if (attempt < 5) {
        assert.equal(result.state, "retry_wait");
        assert.equal(job.next_attempt_at, new Date(now.getTime() + delays[attempt - 1]).toISOString());
        now = new Date(job.next_attempt_at);
      } else {
        assert.equal(result.state, "failed_terminal");
        assert.equal(job.next_attempt_at, null);
      }
    }
  });
});

test("audiobook proof worker recovers expired leases, prevents overlap, and requeue is confirmed idempotent", async () => {
  await withTestDb(async (db) => {
    seedProofRevision(db);
    const now = new Date("2026-07-12T01:00:00Z");
    const worker = new AudiobookProofWorkerService(db, {
      proveAndActivate: async () => ({
        status: "diagnostic", code: "LOW_CONFIDENCE", retryable: false,
        diagnostic: { source: "audnexus", confidence: "medium", chapterCount: 2, warnings: ["EXTERNAL_WARNING"] },
        commands: ["inspect", "resolve"]
      })
    }, true, () => now);
    worker.materializeOutbox(now);
    db.prepare(`UPDATE audiobook_proof_state SET lease_owner = 'other', lease_expires_at = ? WHERE id = 1`)
      .run(new Date(now.getTime() + 60_000).toISOString());
    assert.equal((await worker.runOnce({ force: true, now })).status, "lease_held");
    db.prepare("UPDATE audiobook_proof_state SET lease_expires_at = ? WHERE id = 1")
      .run(new Date(now.getTime() - 60_000).toISOString());
    db.prepare(`UPDATE audiobook_proof_jobs SET state = 'running', attempt_count = 1,
      lease_owner = 'dead', lease_expires_at = ? WHERE audiobook_id = 200`)
      .run(new Date(now.getTime() - 60_000).toISOString());
    const recovered = await worker.runOnce({ force: true, now });
    assert.equal(recovered.state, "failed_terminal");
    assert.equal(recovered.safeCode, "LOW_CONFIDENCE");
    const job = db.prepare("SELECT * FROM audiobook_proof_jobs WHERE audiobook_id = 200").get();
    assert.equal(job.attempt_count, 2);
    assert.equal(job.diagnostic_source, "audnexus");
    assert.equal(JSON.stringify(worker.getStatus()).includes("Private"), false);

    const preview = worker.requeue(job.id, { apply: false, confirm: false });
    assert.equal(preview.dryRun, true);
    const applied = worker.requeue(job.id, { apply: true, confirm: true });
    assert.equal(applied.changed, true);
    const repeated = worker.requeue(job.id, { apply: true, confirm: true });
    assert.equal(repeated.changed, false);
    assert.throws(() => worker.requeue(job.id, { apply: true, confirm: false }), /PROOF_REQUEUE_CONFIRM_REQUIRED/);
    const audits = db.prepare("SELECT payload_json FROM audit_log WHERE action LIKE 'audiobook_proof_%'").all();
    assert.equal(JSON.stringify(audits).includes("Private"), false);
  });
});

test("audiobook proof health and runtime seams remain bounded while automatic proof is disabled by default", async () => {
  await withTestDb(async (db) => {
    seedProofRevision(db);
    const health = new HealthService(db).getHealth();
    assert.equal(health.audiobookProof.status, "disabled");
    assert.equal(health.audiobookProof.pending, 0);
    assert.equal(JSON.stringify(health.audiobookProof).includes("Private"), false);
    let calls = 0;
    const runtime = new AudiobookProofRuntime({
      runOnce: async () => { calls++; return { ok: true, status: "idle" }; }
    });
    await runtime.runOnce({ force: true });
    assert.equal(calls, 1);
    runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    runtime.stop();
    assert.ok(calls >= 2);
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
