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
console.log(`=== PRUNE DUPLICATE PLEX OBSERVATIONS (${isApply ? 'APPLY' : 'DRY RUN'}) ===\n`);

if (isApply) {
  const backupFile = path.join(backupDir, `plex-cowatch-sync-before-dedupe-${Date.now()}.sqlite`);
  fs.copyFileSync(dbPath, backupFile);
  console.log(`Database backup created at: ${backupFile}\n`);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// 1. Identify same-day duplicate plex_historical_last_view rows
const duplicates = db.prepare(`
  SELECT DISTINCT p.id, p.user_id, u.display_name, p.show_title, p.title, p.rating_key, p.watched_at
  FROM playback_observations p
  JOIN playback_observations t ON t.user_id = p.user_id
    AND (
      t.rating_key = p.rating_key
      OR (t.plex_guid = p.plex_guid AND t.plex_guid IS NOT NULL)
    )
    AND t.id != p.id
    AND t.watched_at_provenance != 'plex_historical_last_view'
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.watched_at_provenance = 'plex_historical_last_view'
    AND abs(strftime('%s', p.watched_at) - strftime('%s', t.watched_at)) <= 86400
  ORDER BY p.user_id, p.show_title, p.title
`).all();

console.log(`Found ${duplicates.length} same-day duplicate Plex observations.`);

const byUser = new Map();
for (const d of duplicates) {
  const user = d.display_name || `User ${d.user_id}`;
  byUser.set(user, (byUser.get(user) || 0) + 1);
}
console.log('Breakdown of duplicate rows by user:');
for (const [user, count] of byUser.entries()) {
  console.log(`  - ${user}: ${count} rows`);
}

if (isApply && duplicates.length > 0) {
  console.log('\nPruning duplicate rows from playback_observations...');
  db.exec(`
    DELETE FROM playback_observations
    WHERE id IN (
      SELECT DISTINCT p.id
      FROM playback_observations p
      JOIN playback_observations t ON t.user_id = p.user_id
        AND (
          t.rating_key = p.rating_key
          OR (t.plex_guid = p.plex_guid AND t.plex_guid IS NOT NULL)
        )
        AND t.id != p.id
        AND t.watched_at_provenance != 'plex_historical_last_view'
      WHERE p.watched_at_provenance = 'plex_historical_last_view'
        AND abs(strftime('%s', p.watched_at) - strftime('%s', t.watched_at)) <= 86400
    )
  `);
  console.log('Pruning complete!');
}

// 2. Count genuine retained Plex observations
const retained = db.prepare(`
  SELECT p.user_id, u.display_name, count(*) as count
  FROM playback_observations p
  LEFT JOIN users u ON u.id = p.user_id
  WHERE p.watched_at_provenance = 'plex_historical_last_view'
  GROUP BY p.user_id
`).all();

console.log('\nGenuinely retained Plex observations:');
for (const r of retained) {
  console.log(`  - ${r.display_name || `User ${r.user_id}`}: ${r.count} rows`);
}

// 3. Evaluate achievements for Tony and Wes
console.log('\nEvaluating achievements for verification...');
const service = new AchievementService(db);
const tonyPayload = service.getAchievements({ user: 7 });
const wesPayload = service.getAchievements({ user: 414 });

console.log('\nTony Show Mastery for Wonder Man & Turkey:');
for (const res of tonyPayload.results) {
  const str = JSON.stringify(res);
  if (str.includes('Wonder Man') || str.includes('Turkey!')) {
    console.log(`  - [${res.state}] ${res.badge?.title} (${res.badge?.tier}): ${res.badge?.description}`);
    console.log('    Stats:', JSON.stringify(res.badge?.stats));
  }
}

console.log('\nWesley Mastered Badges count:');
const wesMastered = wesPayload.results.filter(r => r.state === 'earned');
console.log(`  Total Mastered Badges for Wes: ${wesMastered.length}`);
for (const b of wesMastered) {
  console.log(`  - ${b.badge?.title}`);
}

db.close();
console.log('\nDone.');
