import fs from "node:fs";
import path from "node:path";
import { openMigratedDatabase } from "../../dist/db/database.js";
import { MockPlexAdapter } from "../../dist/adapters/plexAdapter.js";
import { createApp } from "../../dist/server/app.js";

const port = Number(process.env.DASHBOARD_E2E_PORT || 18791);
const fixtureDir = path.resolve(".tmp/dashboard-e2e");
fs.rmSync(fixtureDir, { recursive: true, force: true });
fs.mkdirSync(fixtureDir, { recursive: true });
const db = openMigratedDatabase(path.join(fixtureDir, "fixture.sqlite"));
const now = Date.now();
const isoMinutesAgo = (minutes) => new Date(now - minutes * 60_000).toISOString();

const insertUser = db.prepare(`INSERT INTO users
  (plex_user_id,plex_username,display_name,dashboard_alias,dashboard_shown,is_source_user,is_typical_cowatcher,enabled,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
const userIds = {};
for (const user of [
  ["tony-plex", "Tony", "Tony", null, 1, 1, 0, 1],
  ["justin-plex", "Justin", "Justin", null, 1, 0, 1, 1],
  ["alex-plex", "Alex", "Alex", "Ace", 1, 0, 1, 1],
  ["legacy-plex", "Legacy", "Legacy", null, 1, 0, 0, 0],
  ["tony-archive-plex", "Tony Archive", "Tony Archive", "Tony", 1, 0, 0, 1],
  ["hidden-plex", "Hidden", "Hidden Viewer", "Secret", 0, 0, 1, 1]
]) {
  const result = insertUser.run(...user, isoMinutesAgo(240), isoMinutesAgo(240));
  userIds[user[1]] = Number(result.lastInsertRowid);
}

const insertObservation = db.prepare(`INSERT INTO playback_observations
  (user_id,rating_key,grandparent_rating_key,parent_rating_key,media_type,library_name,title,show_title,season_number,episode_number,watched_at,watched_at_provenance,percent_complete,percent_complete_provenance,duration,completed,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const addEpisode = ({ user, ratingKey, title, minutesAgo, percent = 100, completed = 1 }) => {
  const watchedAt = isoMinutesAgo(minutesAgo);
  insertObservation.run(userIds[user], ratingKey, "show-regression", "season-regression", "episode", "TV Shows", title, "Regression Show", 1, Number(ratingKey.slice(-1)), watchedAt, "fixture", percent, "fixture", 1_800_000, completed, watchedAt, watchedAt);
  return watchedAt;
};

const confirmedWatchedAt = addEpisode({ user: "Tony", ratingKey: "episode-regression-1", title: "Confirmed Episode", minutesAgo: 30, percent: 93, completed: 0 });
addEpisode({ user: "Alex", ratingKey: "episode-regression-2", title: "Different Episode", minutesAgo: 90 });
addEpisode({ user: "Hidden", ratingKey: "episode-regression-3", title: "Hidden Episode", minutesAgo: 120 });

const movieWatchedAt = isoMinutesAgo(150);
insertObservation.run(userIds.Tony, "movie-regression", null, null, "movie", "Movies", "Fixture Movie", null, null, null, movieWatchedAt, "fixture", 100, "fixture", 7_200_000, 1, movieWatchedAt, movieWatchedAt);
const reviewSourceAt = isoMinutesAgo(210);
const reviewTargetAt = isoMinutesAgo(205);
insertObservation.run(userIds.Tony, "review-movie", null, null, "movie", "Movies", "Review Movie", null, null, null, reviewSourceAt, "fixture", 100, "fixture", 7_200_000, 1, reviewSourceAt, reviewSourceAt);
insertObservation.run(userIds.Alex, "review-movie", null, null, "movie", "Movies", "Review Movie", null, null, null, reviewTargetAt, "fixture", 100, "fixture", 7_200_000, 1, reviewTargetAt, reviewTargetAt);

db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,leaf_count,source_provenance,refreshed_at)
  VALUES ('show-regression','show','Regression Show',1800000,'2','TV Shows','[]',3,'fixture',?)`).run(isoMinutesAgo(5));
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,source_provenance,refreshed_at)
  VALUES ('movie-regression','movie','Fixture Movie',7200000,'1','Movies','[]','fixture',?)`).run(isoMinutesAgo(5));
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,source_provenance,refreshed_at)
  VALUES ('review-movie','movie','Review Movie',7200000,'1','Movies','[]','fixture',?)`).run(isoMinutesAgo(5));

const event = db.prepare(`INSERT INTO watch_events
  (source_user_id,rating_key,grandparent_rating_key,parent_rating_key,media_type,library_name,title,show_title,season_number,episode_number,watched_at,prompt_status,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  userIds.Tony, "episode-regression-1", "show-regression", "season-regression", "episode", "TV Shows", "Confirmed Episode", "Regression Show", 1, 1, confirmedWatchedAt, "resolved", confirmedWatchedAt, confirmedWatchedAt
);
db.prepare(`INSERT INTO cowatch_confirmations
  (watch_event_id,target_user_id,confirmation_method,status,plex_sync_status,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?)`).run(Number(event.lastInsertRowid), userIds.Justin, "fixture", "confirmed", "marked_watched", confirmedWatchedAt, confirmedWatchedAt);

db.prepare(`INSERT INTO watch_events
  (source_user_id,rating_key,media_type,library_name,title,watched_at,prompt_status,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?)`).run(
  userIds.Tony, "movie-regression", "movie", "Movies", "Fixture Movie", movieWatchedAt, "pending", movieWatchedAt, movieWatchedAt
);

const app = createApp(db, new MockPlexAdapter(), { skipStartupUserSync: true, discordReviewAvailable: true });
const server = app.listen(port, "127.0.0.1");
export const ready = new Promise((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});

export async function stopFixtureServer() {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
