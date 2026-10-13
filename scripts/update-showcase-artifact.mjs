import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AchievementService } from '../dist/achievements/service.js';

const dbPath = path.resolve('./data/plex-cowatch-sync.sqlite');
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec('PRAGMA busy_timeout = 5000;');

const service = new AchievementService(db);

const users = db.prepare(`
  SELECT id, display_name, plex_username
  FROM users
  WHERE enabled = 1
  ORDER BY id
`).all();

console.log('Evaluating users:', users.map(u => `${u.display_name} (${u.id})`));

const usersData = {};

for (const u of users) {
  const payload = service.getAchievements({ user: u.id });
  usersData[u.id] = {
    name: u.display_name,
    results: payload.results
  };
}

const artifactPath = 'C:/Users/antho/.gemini/antigravity/brain/5cba3a66-1f9f-4bce-8c12-c425a8703bde/achievements_showcase_preview.html';
let html = fs.readFileSync(artifactPath, 'utf8');

const regex = /const USERS_DATA = \{[\s\S]*?\};\n\s*let activeUserId/;

if (!regex.test(html)) {
  console.error('Could not find USERS_DATA block in HTML artifact!');
  process.exit(1);
}

const replacement = `const USERS_DATA = ${JSON.stringify(usersData)};\n    let activeUserId`;
html = html.replace(regex, replacement);

fs.writeFileSync(artifactPath, html, 'utf8');
console.log('Updated achievements_showcase_preview.html with clean deduplicated achievements!');

for (const [id, data] of Object.entries(usersData)) {
  const earned = data.results.filter(r => r.state === 'earned').length;
  const inProgress = data.results.filter(r => r.state === 'in_progress').length;
  console.log(`- ${data.name} (${id}): ${earned} Mastered, ${inProgress} In Progress`);
}

db.close();
