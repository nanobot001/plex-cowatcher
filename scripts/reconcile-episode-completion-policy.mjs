import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AchievementService } from '../dist/achievements/service.js';

const dbPath = path.resolve('./data/plex-cowatch-sync.sqlite');
const backupDir = path.resolve('./data/backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const isApply = process.argv.includes('--apply');
console.log(`=== EPISODE COMPLETION POLICY RECONCILIATION (${isApply ? 'APPLY' : 'DRY RUN'}) ===\n`);

// 1. Backup DB if apply
if (isApply) {
  const backupFile = path.join(backupDir, `plex-cowatch-sync-before-completion-policy-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, backupFile);
  console.log(`Database backup created at: ${backupFile}\n`);
}

const db = new DatabaseSync(dbPath);

// A. Find single sessions >= 80% that are completed = 0
const singleSessions = db.prepare(`
  SELECT 
    po.id,
    po.user_id,
    u.plex_username,
    po.show_title,
    po.title,
    po.season_number,
    po.episode_number,
    po.rating_key,
    po.grandparent_rating_key,
    po.percent_complete,
    po.watched_at
  FROM playback_observations po
  LEFT JOIN users u ON u.id = po.user_id
  WHERE po.media_type = 'episode' 
    AND po.completed = 0 
    AND po.percent_complete >= 80
  ORDER BY po.user_id, po.show_title, po.season_number, po.episode_number
`).all();

console.log(`Found ${singleSessions.length} single episode sessions with percent_complete >= 80% and completed = 0:`);
const singleByShow = {};
for (const s of singleSessions) {
  const key = `${s.show_title} (${s.plex_username})`;
  singleByShow[key] = (singleByShow[key] || 0) + 1;
}
console.table(Object.entries(singleByShow).map(([showUser, count]) => ({ showUser, count })));

// B. Find multi-sessions on same calendar day summing to >= 80%
const multiSessionGroups = db.prepare(`
  SELECT 
    po.user_id,
    u.plex_username,
    po.show_title,
    po.rating_key,
    po.grandparent_rating_key,
    po.season_number,
    po.episode_number,
    SUBSTR(po.watched_at, 1, 10) as watch_date,
    COUNT(*) as session_count,
    SUM(po.percent_complete) as total_percent,
    MAX(po.completed) as max_completed,
    GROUP_CONCAT(po.id || ':' || po.percent_complete || '%') as details
  FROM playback_observations po
  LEFT JOIN users u ON u.id = po.user_id
  WHERE po.media_type = 'episode'
  GROUP BY po.user_id, po.rating_key, SUBSTR(po.watched_at, 1, 10)
  HAVING session_count > 1 AND max_completed = 0 AND total_percent >= 80
`).all();

console.log(`\nFound ${multiSessionGroups.length} multi-session same-day groups summing to >= 80% with completed = 0:`);
console.table(multiSessionGroups.map(g => ({
  user: g.plex_username,
  show: g.show_title,
  ep: `S${g.season_number}E${g.episode_number}`,
  sessions: g.session_count,
  totalPercent: `${g.total_percent}%`,
  date: g.watch_date
})));

if (!isApply) {
  console.log('\nDRY RUN complete. Re-run with --apply to commit changes.');
  process.exit(0);
}

// APPLY CHANGES IN A TRANSACTION
console.log('\n--- APPLYING RECONCILIATION UPDATES ---');
db.exec('BEGIN IMMEDIATE');

try {
  let singleUpdated = 0;
  const updateSingleStmt = db.prepare(`
    UPDATE playback_observations
    SET completed = 1,
        percent_complete_provenance = COALESCE(percent_complete_provenance, 'source') || ':reconciled_threshold_80',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const s of singleSessions) {
    updateSingleStmt.run(s.id);
    singleUpdated++;
  }
  console.log(`Updated ${singleUpdated} single-session playback observations to completed = 1.`);

  let multiUpdated = 0;
  const findLatestSessionStmt = db.prepare(`
    SELECT id, percent_complete 
    FROM playback_observations
    WHERE user_id = ? AND rating_key = ? AND SUBSTR(watched_at, 1, 10) = ?
    ORDER BY watched_at DESC, id DESC
    LIMIT 1
  `);
  const updateMultiStmt = db.prepare(`
    UPDATE playback_observations
    SET completed = 1,
        percent_complete = CASE WHEN percent_complete < 100 THEN 100 ELSE percent_complete END,
        percent_complete_provenance = 'session_aggregate_reconciled',
        updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const g of multiSessionGroups) {
    const latest = findLatestSessionStmt.get(g.user_id, g.rating_key, g.watch_date);
    if (latest) {
      updateMultiStmt.run(latest.id);
      multiUpdated++;
    }
  }
  console.log(`Updated ${multiUpdated} latest multi-session playback observations to completed = 1.`);

  // C. Sync watch_events for source user (Tony, user_id = 7)
  const newlyCompletedTonyObs = db.prepare(`
    SELECT po.* 
    FROM playback_observations po
    WHERE po.user_id = 7 AND po.completed = 1 AND po.media_type = 'episode'
      AND NOT EXISTS (
        SELECT 1 FROM watch_events we 
        WHERE we.source_user_id = 7 AND we.rating_key = po.rating_key
      )
  `).all();

  console.log(`Found ${newlyCompletedTonyObs.length} completed Tony observations missing watch_events.`);
  const insertWatchEventStmt = db.prepare(`
    INSERT OR IGNORE INTO watch_events (
      source_user_id, tautulli_row_id, rating_key, grandparent_rating_key, parent_rating_key,
      plex_guid, media_type, library_name, title, show_title, season_number, episode_number,
      watched_at, prompt_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', datetime('now'), datetime('now'))
  `);

  let watchEventsInserted = 0;
  for (const obs of newlyCompletedTonyObs) {
    insertWatchEventStmt.run(
      7,
      obs.tautulli_row_id,
      obs.rating_key,
      obs.grandparent_rating_key,
      obs.parent_rating_key,
      obs.plex_guid,
      obs.media_type,
      obs.library_name,
      obs.title,
      obs.show_title,
      obs.season_number,
      obs.episode_number,
      obs.watched_at
    );
    watchEventsInserted++;
  }
  console.log(`Inserted ${watchEventsInserted} watch_events for Tony.`);

  // D. Co-watch linkage between Tony and Justin
  // If Tony and Justin both have completed observations for the same episode within 12 hours of each other
  const cowatchCandidates = db.prepare(`
    SELECT DISTINCT
      we.id as watch_event_id,
      po_t.rating_key,
      po_t.show_title,
      po_t.title,
      po_t.watched_at as tony_time,
      po_j.watched_at as justin_time
    FROM playback_observations po_t
    JOIN watch_events we ON we.source_user_id = 7 AND we.rating_key = po_t.rating_key
    JOIN playback_observations po_j ON po_j.user_id = 185 AND po_j.rating_key = po_t.rating_key AND po_j.completed = 1
    WHERE po_t.user_id = 7 AND po_t.completed = 1
      AND ABS(strftime('%s', po_t.watched_at) - strftime('%s', po_j.watched_at)) <= 12 * 3600
      AND NOT EXISTS (
        SELECT 1 FROM cowatch_confirmations cc 
        WHERE cc.watch_event_id = we.id AND cc.target_user_id = 185
      )
  `).all();

  console.log(`Found ${cowatchCandidates.length} eligible co-watch pairings between Tony and Justin.`);
  const insertCowatchStmt = db.prepare(`
    INSERT INTO cowatch_confirmations (
      watch_event_id, target_user_id, confirmation_method, status, created_at, updated_at
    ) VALUES (?, 185, 'policy_reconciliation', 'confirmed', datetime('now'), datetime('now'))
  `);

  let cowatchInserted = 0;
  for (const c of cowatchCandidates) {
    insertCowatchStmt.run(c.watch_event_id);
    cowatchInserted++;
  }
  console.log(`Inserted ${cowatchInserted} cowatch_confirmations linking Justin to Tony.`);

  db.exec('COMMIT');
  console.log('\nTransaction successfully committed to SQLite database.');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('Error during reconciliation, rolled back:', err);
  process.exit(1);
}

// E. Recalculate Achievements
console.log('\n--- RECALCULATING ACHIEVEMENTS ---');
const service = new AchievementService(db);
const visibleUsers = [
  { id: 7, name: 'Tony' },
  { id: 185, name: 'Justin' },
  { id: 2, name: 'Ian' },
  { id: 414, name: 'Wes' },
  { id: 683, name: 'garnertam' }
];

const newUsersData = {};
for (const u of visibleUsers) {
  const result = service.getAchievements({ user: u.id });
  newUsersData[String(u.id)] = {
    name: u.name,
    results: result.results
  };
  const earnedTrophies = result.results.filter(r => r.facet === 'trophy_shelf' && r.state === 'earned');
  const inProgressTrophies = result.results.filter(r => r.facet === 'trophy_shelf' && r.state === 'in_progress');
  console.log(`User ${u.name} (${u.id}): ${earnedTrophies.length} Mastered Badges, ${inProgressTrophies.length} In Progress`);
}

// Update showcase preview file
const previewPath = path.resolve('C:/Users/antho/.gemini/antigravity/brain/5cba3a66-1f9f-4bce-8c12-c425a8703bde/achievements_showcase_preview.html');
if (fs.existsSync(previewPath)) {
  let content = fs.readFileSync(previewPath, 'utf8');
  content = content.replace(/const USERS_DATA = \{[\s\S]*?\};\s*let activeUserId/, `const USERS_DATA = ${JSON.stringify(newUsersData)};\n    let activeUserId`);
  fs.writeFileSync(previewPath, content, 'utf8');
  console.log(`Updated achievements_showcase_preview.html with fresh achievement evaluations.`);
}

console.log('\n=== RECONCILIATION COMPLETE ===');
