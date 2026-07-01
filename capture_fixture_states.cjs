const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const rootDir = __dirname;
const outDir = path.join(rootDir, "captures", "fixtures");
const desktopViewport = { width: 1440, height: 900 };
const narrowViewport = { width: 430, height: 1200 };

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isoNow() {
  return new Date().toISOString();
}

async function withFixtureServer(seedFn, runFn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "plex-cowatcher-capture-"));
  const dbPath = path.join(tempDir, "state.sqlite");
  let db;
  let server;

  try {
    const { openMigratedDatabase } = await import("./dist/db/database.js");
    const { createApp } = await import("./dist/server/app.js");
    const { MockPlexAdapter } = await import("./dist/adapters/plexAdapter.js");
    const { UserService } = await import("./dist/service/userService.js");

    db = openMigratedDatabase(dbPath);
    const userService = new UserService(db);
    userService.syncConfiguredUsers([
      { plexUsername: "Tony", displayName: "Tony", isSourceUser: true, isTypicalCowatcher: false, enabled: true },
      { plexUsername: "Alex", displayName: "Alex", isSourceUser: true, isTypicalCowatcher: false, enabled: true },
      { plexUsername: "Viewer", displayName: "Viewer", isSourceUser: false, isTypicalCowatcher: true, enabled: true }
    ]);

    await seedFn(db);

    const app = createApp(db, new MockPlexAdapter());
    await new Promise((resolve) => setTimeout(resolve, 100));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const address = server.address();
    await runFn(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (db) db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function captureState(name, seedFn) {
  await withFixtureServer(seedFn, async (baseUrl) => {
    const browser = await chromium.launch();
    try {
      const desktop = await browser.newPage({ viewport: desktopViewport });
      await desktop.goto(`${baseUrl}/#overview`, { waitUntil: "networkidle" });
      await desktop.screenshot({
        path: path.join(outDir, `${name}_desktop.png`),
        fullPage: true
      });
      await desktop.close();

      const narrow = await browser.newPage({ viewport: narrowViewport });
      await narrow.goto(`${baseUrl}/#overview`, { waitUntil: "networkidle" });
      await narrow.screenshot({
        path: path.join(outDir, `${name}_narrow.png`),
        fullPage: true
      });
      await narrow.close();
    } finally {
      await browser.close();
    }
  });
}

function insertObservation(db, values) {
  db.prepare(`
    INSERT INTO playback_observations
      (user_id, rating_key, media_type, library_name, title, show_title, watched_at, percent_complete, duration, completed, created_at, updated_at)
    VALUES
      (@user_id, @rating_key, @media_type, @library_name, @title, @show_title, @watched_at, @percent_complete, @duration, @completed, @created_at, @updated_at)
  `).run(values);
}

async function seedEmpty() {}

async function seedPartialFailure(db) {
  const users = db.prepare("SELECT id, plex_username FROM users ORDER BY id").all();
  const byName = Object.fromEntries(users.map((user) => [user.plex_username, user]));
  const now = isoNow();
  const earlier = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();

  insertObservation(db, {
    user_id: byName.Tony.id,
    rating_key: "movie-attention",
    media_type: "movie",
    library_name: "Movies",
    title: "Attention Movie",
    show_title: null,
    watched_at: now,
    percent_complete: 40,
    duration: 7200000,
    completed: 0,
    created_at: now,
    updated_at: now
  });

  insertObservation(db, {
    user_id: byName.Alex.id,
    rating_key: "anime-complete",
    media_type: "episode",
    library_name: "Anime",
    title: "Episode 7",
    show_title: "Skyward",
    watched_at: earlier,
    percent_complete: 100,
    duration: 1500000,
    completed: 1,
    created_at: earlier,
    updated_at: earlier
  });

  db.prepare(`
    INSERT INTO watch_events
      (source_user_id, rating_key, media_type, title, watched_at, prompt_status, created_at, updated_at)
    VALUES
      (?, 'movie-attention', 'movie', 'Attention Movie', ?, 'pending', ?, ?)
  `).run(byName.Tony.id, now, now, now);

  db.prepare(`
    INSERT INTO sync_failures
      (action, target_user_id, rating_key, error, created_at)
    VALUES
      ('apply_history_copy', ?, 'movie-attention', 'PLEX_TIMEOUT', ?)
  `).run(byName.Alex.id, now);

  db.prepare(`
    INSERT INTO audit_log
      (action, actor, status, payload_json, error, created_at)
    VALUES
      ('create_cowatch_prompt', 'system', 'error', ?, 'DISCORD_TIMEOUT', ?)
  `).run(JSON.stringify({ watchEventId: 1 }), now);
}

(async () => {
  ensureDir(outDir);
  await captureState("empty", seedEmpty);
  await captureState("partial_failure", seedPartialFailure);
  console.log(`Fixture captures saved to ${outDir}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
