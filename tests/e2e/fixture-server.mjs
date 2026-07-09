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
const addEpisodic = ({ user, ratingKey, grandparentRatingKey, parentRatingKey, libraryName, title, showTitle, minutesAgo, percent = 100, completed = 1, duration = 1_800_000 }) => {
  const watchedAt = isoMinutesAgo(minutesAgo);
  insertObservation.run(userIds[user], ratingKey, grandparentRatingKey, parentRatingKey, "episode", libraryName, title, showTitle, 1, Number(ratingKey.match(/(\d+)$/)?.[1] || 1), watchedAt, "fixture", percent, "fixture", duration, completed, watchedAt, watchedAt);
  return watchedAt;
};
const addEpisode = ({ user, ratingKey, title, minutesAgo, percent = 100, completed = 1 }) => addEpisodic({
  user,
  ratingKey,
  grandparentRatingKey: "show-regression",
  parentRatingKey: "season-regression",
  libraryName: "TV Shows",
  title,
  showTitle: "Regression Show",
  minutesAgo,
  percent,
  completed
});

const confirmedWatchedAt = addEpisode({ user: "Tony", ratingKey: "episode-regression-1", title: "Confirmed Episode", minutesAgo: 30, percent: 93, completed: 0 });
addEpisode({ user: "Alex", ratingKey: "episode-regression-2", title: "Different Episode", minutesAgo: 90 });
addEpisode({ user: "Hidden", ratingKey: "episode-regression-3", title: "Hidden Episode", minutesAgo: 120 });
addEpisodic({ user: "Tony", ratingKey: "classic-regression-1", grandparentRatingKey: "classic-regression", parentRatingKey: "classic-season-1", libraryName: "Classic TV", title: "Episode 1: Analog Start", showTitle: "Classic Regression", minutesAgo: 42, percent: 45, completed: 0, duration: 0 });
addEpisodic({ user: "Alex", ratingKey: "classic-regression-2", grandparentRatingKey: "classic-regression", parentRatingKey: "classic-season-1", libraryName: "Classic TV", title: "Episode 2: Broadcast Finish", showTitle: "Classic Regression", minutesAgo: 44, percent: 100, completed: 1, duration: 0 });
addEpisodic({ user: "Tony", ratingKey: "anime-regression-1", grandparentRatingKey: "anime-regression", parentRatingKey: "anime-season-1", libraryName: "Anime", title: "Episode 1: Pilot Light", showTitle: "Anime Regression", minutesAgo: 48, percent: 100, completed: 1, duration: 0 });
addEpisodic({ user: "Tony", ratingKey: "anime-regression-1", grandparentRatingKey: "anime-regression", parentRatingKey: "anime-season-1", libraryName: "Anime", title: "Episode 1: Pilot Light", showTitle: "Anime Regression", minutesAgo: 46, percent: 100, completed: 1, duration: 0 });

const movieWatchedAt = isoMinutesAgo(150);
insertObservation.run(userIds.Tony, "movie-regression", null, null, "movie", "Movies", "Fixture Movie", null, null, null, movieWatchedAt, "fixture", 100, "fixture", 7_200_000, 1, movieWatchedAt, movieWatchedAt);
const audiobookWatchedAt = isoMinutesAgo(52);
insertObservation.run(userIds.Tony, "audio-regression-1", null, null, "track", "Audiobooks", "Chapter 1: Open", "Fixture Audiobook", null, null, audiobookWatchedAt, "fixture", 65, "fixture", 0, 0, audiobookWatchedAt, audiobookWatchedAt);
const verifiedAudiobookWatchedAt = isoMinutesAgo(50);
db.prepare(`INSERT INTO playback_observations
  (user_id,rating_key,media_type,library_name,title,show_title,watched_at,watched_at_provenance,percent_complete,percent_complete_provenance,view_offset,duration,completed,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  userIds.Tony, "verified-audio-file", "track", "Audiobooks", "Verified Single File", "Verified Fixture Audiobook", verifiedAudiobookWatchedAt, "fixture", 50, "fixture", 90000, 180000, 0, verifiedAudiobookWatchedAt, verifiedAudiobookWatchedAt
);
const reviewSourceAt = isoMinutesAgo(210);
const reviewTargetAt = isoMinutesAgo(205);
insertObservation.run(userIds.Tony, "review-movie", null, null, "movie", "Movies", "Review Movie", null, null, null, reviewSourceAt, "fixture", 100, "fixture", 7_200_000, 1, reviewSourceAt, reviewSourceAt);
insertObservation.run(userIds.Alex, "review-movie", null, null, "movie", "Movies", "Review Movie", null, null, null, reviewTargetAt, "fixture", 100, "fixture", 7_200_000, 1, reviewTargetAt, reviewTargetAt);

db.prepare(`INSERT INTO audiobook_books
  (id,folder_key,title,series_title,chapter_count,source_provenance,enrichment_status,created_at,updated_at)
  VALUES (20,'fixture-audiobook','Fixture Audiobook','Fixture Series',2,'fixture','enriched',?,?)`).run(isoMinutesAgo(5), isoMinutesAgo(5));
db.prepare(`INSERT INTO audiobook_books
  (id,folder_key,title,series_title,chapter_count,source_provenance,enrichment_status,created_at,updated_at)
  VALUES (21,'verified-fixture-audiobook','Verified Fixture Audiobook','Fixture Series',3,'fixture','enriched',?,?)`).run(isoMinutesAgo(5), isoMinutesAgo(5));
db.prepare(`INSERT INTO audiobook_chapter_sources
  (audiobook_id,source_type,source_status,confidence,refreshed_at)
  VALUES (21,'audiobook_tool','active',0.96,?)`).run(isoMinutesAgo(5));
for (const [chapterIndex, title, startOffset, endOffset] of [
  [1, "Verified Chapter 1", 0, 60000],
  [2, "Verified Chapter 2", 60000, 120000],
  [3, "Verified Chapter 3", 120000, 180000]
]) {
  db.prepare(`INSERT INTO audiobook_chapters
    (audiobook_id,chapter_index,title,start_offset_ms,end_offset_ms,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`).run(21, chapterIndex, title, startOffset, endOffset, isoMinutesAgo(5), isoMinutesAgo(5));
}
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,leaf_count,source_provenance,refreshed_at)
  VALUES ('show-regression','show','Regression Show',1800000,'2','TV Shows','[]',3,'fixture',?)`).run(isoMinutesAgo(5));
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,leaf_count,source_provenance,refreshed_at)
  VALUES ('classic-regression','show','Classic Regression',1800000,'3','Classic TV','[]',2,'fixture',?)`).run(isoMinutesAgo(5));
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,leaf_count,source_provenance,refreshed_at)
  VALUES ('anime-regression','show','Anime Regression',1800000,'4','Anime','[]',2,'fixture',?)`).run(isoMinutesAgo(5));
for (const [ratingKey, title, libraryTitle, showKey, showTitle, seasonKey] of [
  ["episode-regression-1", "Episode 1: Confirmed Episode", "TV Shows", "show-regression", "Regression Show", "season-regression"],
  ["episode-regression-2", "Episode 2: Different Episode", "TV Shows", "show-regression", "Regression Show", "season-regression"],
  ["episode-regression-3", "Episode 3: Hidden Episode", "TV Shows", "show-regression", "Regression Show", "season-regression"],
  ["classic-regression-1", "Episode 1: Analog Start", "Classic TV", "classic-regression", "Classic Regression", "classic-season-1"],
  ["classic-regression-2", "Episode 2: Broadcast Finish", "Classic TV", "classic-regression", "Classic Regression", "classic-season-1"],
  ["anime-regression-1", "Episode 1: Pilot Light", "Anime", "anime-regression", "Anime Regression", "anime-season-1"],
  ["anime-regression-2", "Episode 2: Unwatched Future", "Anime", "anime-regression", "Anime Regression", "anime-season-1"]
]) {
  db.prepare(`INSERT INTO content_catalog
    (rating_key,media_type,title,duration,library_title,grandparent_rating_key,grandparent_title,parent_rating_key,parent_title,source_provenance,refreshed_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(ratingKey, "episode", title, 1_800_000, libraryTitle, showKey, showTitle, seasonKey, "Season 1", "fixture", isoMinutesAgo(5));
}
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,audiobook_id,source_provenance,refreshed_at)
  VALUES ('audio-regression-1','track','Chapter 1: Open',1200000,'5','Audiobooks','[]',20,'fixture',?)`).run(isoMinutesAgo(5));
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,audiobook_id,source_provenance,refreshed_at)
  VALUES ('audio-regression-2','track','Chapter 2: Later',1200000,'5','Audiobooks','[]',20,'fixture',?)`).run(isoMinutesAgo(5));
db.prepare(`INSERT INTO content_catalog
  (rating_key,media_type,title,duration,library_id,library_title,genres_json,audiobook_id,source_provenance,refreshed_at)
  VALUES ('verified-audio-file','track','Verified Single File',180000,'5','Audiobooks','[]',21,'fixture',?)`).run(isoMinutesAgo(5));
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
