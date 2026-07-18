import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { appConfig } from "../utils/config.js";
import { canonicalizeAudiobookSeriesTitle } from "../service/audiobookService.js";

export type Db = DatabaseSync;

export function openDatabase(sqlitePath = appConfig.SQLITE_PATH): Db {
  const absolutePath = path.resolve(sqlitePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const db = new DatabaseSync(absolutePath);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function migrateDatabase(db: Db): void {
  const sourceSchema = path.resolve("src/db/schema.sql");
  const builtSchema = new URL("./schema.sql", import.meta.url);
  const schema = fs.existsSync(sourceSchema)
    ? fs.readFileSync(sourceSchema, "utf8")
    : fs.readFileSync(builtSchema, "utf8");
  db.exec(schema);
  ensureColumn(db, "watch_events", "discord_prompt_channel_id", "TEXT");
  ensureColumn(db, "watch_events", "discord_prompt_message_id", "TEXT");
  ensureColumn(db, "watch_events", "discord_prompt_sent_at", "TEXT");
  ensureColumn(db, "copy_job_items", "plex_guid", "TEXT");
  ensureColumn(db, "users", "is_home_user", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "users", "dashboard_alias", "TEXT");
  ensureColumn(db, "users", "dashboard_shown", "INTEGER NOT NULL DEFAULT 1");
  migrateDashboardPreferences(db);
  migrateAudiobooks(db);
  normalizeAudiobookSeriesTitles(db);
  migrateAudiobookHierarchy(db);
  migrateCowatchAdjudications(db);
  migrateCowatchReviewPrompts(db);
  migrateContentCatalogHierarchyIndexes(db);
  migrateAudiobookChapters(db);
  migrateAudiobookDiscovery(db);
  migrateAudiobookRevisionManifests(db);
  migrateAudiobookProofJobs(db);
  migrateContentCatalogArtworkFingerprints(db);
}

function migrateCowatchReviewPrompts(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 11").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cowatch_review_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'resolved', 'failed', 'cancelled')),
        requested_by TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        discord_channel_id TEXT,
        discord_message_id TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_cowatch_review_prompts_candidate
        ON cowatch_review_prompts(candidate_id, id DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cowatch_review_prompts_open
        ON cowatch_review_prompts(candidate_id) WHERE status IN ('pending', 'sent');
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (11, ?)").run("cowatch_review_prompts");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateCowatchAdjudications(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 10").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cowatch_adjudications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT NOT NULL,
        source_user_id INTEGER NOT NULL,
        target_user_id INTEGER NOT NULL,
        rating_key TEXT NOT NULL,
        rule_version TEXT NOT NULL,
        supporting_observation_ids_json TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('yes', 'no', 'not_sure', 'clear')),
        actor_kind TEXT NOT NULL,
        method TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY(source_user_id) REFERENCES users(id),
        FOREIGN KEY(target_user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_cowatch_adjudications_candidate
        ON cowatch_adjudications(candidate_id, id DESC);
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (10, ?)").run("cowatch_adjudications");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateDashboardPreferences(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 9").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE users
      SET
        dashboard_alias = CASE
          WHEN trim(coalesce(display_name, '')) = '' THEN NULL
          WHEN trim(display_name) = trim(plex_username) THEN NULL
          ELSE display_name
        END,
        dashboard_shown = enabled,
        updated_at = COALESCE(updated_at, datetime('now'))
    `).run();
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (9, ?)").run("dashboard_preferences");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobooks(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 5").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_key TEXT NOT NULL UNIQUE,
        asin TEXT,
        isbn TEXT,
        google_books_id TEXT,
        title TEXT NOT NULL,
        subtitle TEXT,
        authors_json TEXT NOT NULL DEFAULT '[]',
        narrators_json TEXT NOT NULL DEFAULT '[]',
        series_title TEXT,
        series_index REAL,
        year INTEGER,
        description TEXT,
        cover_url TEXT,
        genres_json TEXT NOT NULL DEFAULT '[]',
        language TEXT,
        total_duration_seconds INTEGER,
        chapter_count INTEGER,
        source_provenance TEXT NOT NULL,
        folder_path_hint TEXT,
        enrichment_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ab_asin
        ON audiobook_books(asin) WHERE asin IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_ab_series
        ON audiobook_books(series_title) WHERE series_title IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_ab_enrichment
        ON audiobook_books(enrichment_status);
    `);
    ensureColumn(db, "content_catalog", "file_path", "TEXT");
    ensureColumn(db, "content_catalog", "audiobook_id", "INTEGER REFERENCES audiobook_books(id)");
    db.exec(`CREATE INDEX IF NOT EXISTS idx_content_catalog_audiobook
      ON content_catalog(audiobook_id) WHERE audiobook_id IS NOT NULL`);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (5, ?)").run("audiobook_catalog_initial");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}


function normalizeAudiobookSeriesTitles(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 6").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    const canonicalSeries = canonicalizeAudiobookSeriesTitle("The Wheel of Time");
    if (canonicalSeries) {
      db.prepare(`
        UPDATE audiobook_books
        SET series_title = ?
        WHERE lower(trim(COALESCE(series_title, ''))) IN ('wheel of time', 'the wheel of time')
      `).run(canonicalSeries);
      db.prepare(`
        UPDATE content_catalog
        SET grandparent_title = ?
        WHERE audiobook_id IN (
          SELECT id FROM audiobook_books
          WHERE lower(trim(COALESCE(series_title, ''))) = lower(trim(?))
        )
      `).run(canonicalSeries, canonicalSeries);
    }
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (6, ?)").run("audiobook_series_title_normalization");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobookHierarchy(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 7").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "audiobook_books", "parent_series_title", "TEXT");
    ensureColumn(db, "audiobook_books", "subseries_title", "TEXT");
    ensureColumn(db, "audiobook_books", "related_work_classification", "TEXT");
    ensureColumn(db, "audiobook_books", "hierarchy_provenance", "TEXT");
    db.exec(`CREATE INDEX IF NOT EXISTS idx_audiobook_books_parent_series
      ON audiobook_books(parent_series_title) WHERE parent_series_title IS NOT NULL`);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (7, ?)").run("audiobook_hierarchy");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ensureColumn(db: Db, tableName: string, columnName: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export function openMigratedDatabase(sqlitePath = appConfig.SQLITE_PATH): Db {
  const db = openDatabase(sqlitePath);
  migrateDatabase(db);
  return db;
}

function migrateContentCatalogHierarchyIndexes(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 12").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_content_catalog_grandparent
        ON content_catalog(grandparent_rating_key);
      CREATE INDEX IF NOT EXISTS idx_content_catalog_audiobook
        ON content_catalog(audiobook_id) WHERE audiobook_id IS NOT NULL;
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (12, ?)").run("content_catalog_hierarchy_indexes");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobookChapters(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 13").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_chapter_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audiobook_id INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        source_status TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        refreshed_at TEXT NOT NULL,
        FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
        UNIQUE(audiobook_id, source_type)
      );

      CREATE TABLE IF NOT EXISTS audiobook_chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audiobook_id INTEGER NOT NULL,
        chapter_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_offset_ms INTEGER NOT NULL,
        end_offset_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
        UNIQUE(audiobook_id, chapter_index)
      );

      CREATE INDEX IF NOT EXISTS idx_audiobook_chapters_book ON audiobook_chapters(audiobook_id);
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (13, ?)").run("audiobook_chapters");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobookDiscovery(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 14").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "content_catalog", "last_seen_at", "TEXT");
    ensureColumn(db, "content_catalog", "last_seen_scan_id", "INTEGER");
    ensureColumn(db, "audiobook_books", "identity_status", "TEXT NOT NULL DEFAULT 'pending'");
    ensureColumn(db, "audiobook_books", "identity_provenance", "TEXT");
    ensureColumn(db, "audiobook_books", "current_media_revision", "TEXT");
    ensureColumn(db, "audiobook_books", "media_revision_updated_at", "TEXT");
    ensureColumn(db, "audiobook_books", "enrichment_last_attempt_at", "TEXT");
    ensureColumn(db, "audiobook_books", "enrichment_next_attempt_at", "TEXT");
    ensureColumn(db, "audiobook_books", "enrichment_attempt_count", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(db, "audiobook_books", "enrichment_last_error_code", "TEXT");
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_discovery_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        lease_owner TEXT,
        lease_expires_at TEXT,
        heartbeat_at TEXT,
        last_attempt_at TEXT,
        last_success_at TEXT,
        current_run_id INTEGER,
        next_run_at TEXT
      );
      INSERT OR IGNORE INTO audiobook_discovery_state (id) VALUES (1);

      CREATE TABLE IF NOT EXISTS audiobook_discovery_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_reason TEXT NOT NULL,
        status TEXT NOT NULL,
        library_title TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        safe_error_code TEXT,
        counts_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_audiobook_discovery_runs_started
        ON audiobook_discovery_runs(started_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS audiobook_discovery_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audiobook_id INTEGER NOT NULL,
        media_revision TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_at TEXT,
        FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id),
        UNIQUE(audiobook_id, media_revision)
      );
      CREATE INDEX IF NOT EXISTS idx_audiobook_discovery_outbox_pending
        ON audiobook_discovery_outbox(consumed_at, id);
      CREATE INDEX IF NOT EXISTS idx_content_catalog_guid
        ON content_catalog(guid) WHERE guid IS NOT NULL;
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (14, ?)").run("audiobook_discovery_automation");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobookRevisionManifests(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 15").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "audiobook_books", "active_chapter_revision_id", "INTEGER");
    ensureColumn(db, "audiobook_discovery_outbox", "manifest_status", "TEXT NOT NULL DEFAULT 'pending'");
    ensureColumn(db, "audiobook_discovery_outbox", "safe_outcome_code", "TEXT");
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_media_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audiobook_id INTEGER NOT NULL,
        media_revision TEXT NOT NULL,
        track_count INTEGER NOT NULL,
        file_count INTEGER NOT NULL,
        total_duration_ms INTEGER,
        manifest_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
        UNIQUE(audiobook_id, media_revision)
      );
      CREATE TABLE IF NOT EXISTS audiobook_media_revision_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        revision_id INTEGER NOT NULL,
        item_order INTEGER NOT NULL,
        stable_identity TEXT NOT NULL,
        duration_ms INTEGER,
        private_file_path TEXT,
        path_hash TEXT,
        FOREIGN KEY(revision_id) REFERENCES audiobook_media_revisions(id) ON DELETE CASCADE,
        UNIQUE(revision_id, item_order)
      );
      CREATE TABLE IF NOT EXISTS audiobook_chapter_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audiobook_id INTEGER NOT NULL,
        media_revision TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_status TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        chapter_digest TEXT NOT NULL,
        duration_ms INTEGER,
        contract_version INTEGER NOT NULL DEFAULT 1,
        resolver_version TEXT,
        warnings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        activated_at TEXT,
        invalidated_at TEXT,
        FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
        UNIQUE(audiobook_id, media_revision, source_type, chapter_digest)
      );
      CREATE TABLE IF NOT EXISTS audiobook_chapter_revision_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chapter_revision_id INTEGER NOT NULL,
        chapter_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        start_offset_ms INTEGER NOT NULL,
        end_offset_ms INTEGER NOT NULL,
        FOREIGN KEY(chapter_revision_id) REFERENCES audiobook_chapter_revisions(id) ON DELETE CASCADE,
        UNIQUE(chapter_revision_id, chapter_index)
      );
      CREATE INDEX IF NOT EXISTS idx_audiobook_media_revisions_book
        ON audiobook_media_revisions(audiobook_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audiobook_chapter_revisions_book
        ON audiobook_chapter_revisions(audiobook_id, created_at DESC);
    `);

    const legacySources = db.prepare(`
      SELECT source.audiobook_id, source.source_type, source.source_status, source.confidence,
             source.refreshed_at, book.current_media_revision
      FROM audiobook_chapter_sources source
      JOIN audiobook_books book ON book.id = source.audiobook_id
      WHERE source.source_status = 'active'
    `).all() as Array<any>;
    for (const source of legacySources) {
      const chapters = db.prepare(`
        SELECT chapter_index, title, start_offset_ms, end_offset_ms
        FROM audiobook_chapters WHERE audiobook_id = ?
        ORDER BY chapter_index, start_offset_ms
      `).all(source.audiobook_id) as Array<any>;
      if (chapters.length === 0) continue;
      const canonical = JSON.stringify(chapters.map((chapter) => [
        chapter.chapter_index, chapter.title, chapter.start_offset_ms, chapter.end_offset_ms
      ]));
      const digest = createHash("sha256").update(canonical).digest("hex");
      const mediaRevision = source.current_media_revision ?? `legacy:${digest}`;
      const durationMs = Math.max(...chapters.map((chapter) => Number(chapter.end_offset_ms)));
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO audiobook_chapter_revisions
          (audiobook_id, media_revision, source_type, source_status, confidence, chapter_digest,
           duration_ms, created_at, activated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).run(source.audiobook_id, mediaRevision, source.source_type, source.confidence, digest,
        durationMs, source.refreshed_at, source.refreshed_at);
      const revision = db.prepare(`
        SELECT id FROM audiobook_chapter_revisions
        WHERE audiobook_id = ? AND media_revision = ? AND source_type = ? AND chapter_digest = ?
      `).get(source.audiobook_id, mediaRevision, source.source_type, digest) as { id: number };
      if (Number(inserted.changes) > 0) {
        const insertChapter = db.prepare(`
          INSERT INTO audiobook_chapter_revision_items
            (chapter_revision_id, chapter_index, title, start_offset_ms, end_offset_ms)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const chapter of chapters) {
          insertChapter.run(revision.id, chapter.chapter_index, chapter.title,
            chapter.start_offset_ms, chapter.end_offset_ms);
        }
      }
      db.prepare("UPDATE audiobook_books SET active_chapter_revision_id = ? WHERE id = ?")
        .run(revision.id, source.audiobook_id);
    }

    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (15, ?)")
      .run("audiobook_revision_manifests");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateAudiobookProofJobs(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 16").get();
  if (applied) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audiobook_proof_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        lease_owner TEXT, lease_expires_at TEXT, heartbeat_at TEXT,
        current_job_id INTEGER, last_completed_at TEXT, next_run_at TEXT
      );
      INSERT OR IGNORE INTO audiobook_proof_state (id) VALUES (1);
      CREATE TABLE IF NOT EXISTS audiobook_proof_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audiobook_id INTEGER NOT NULL,
        media_revision TEXT NOT NULL,
        outbox_id INTEGER,
        state TEXT NOT NULL CHECK (state IN ('pending','running','retry_wait','succeeded','failed_terminal','unsupported_multi_file')),
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        lease_owner TEXT, lease_expires_at TEXT, heartbeat_at TEXT,
        safe_result_code TEXT,
        diagnostic_source TEXT, diagnostic_confidence TEXT,
        diagnostic_chapter_count INTEGER,
        diagnostic_warnings_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        started_at TEXT, completed_at TEXT,
        FOREIGN KEY(audiobook_id) REFERENCES audiobook_books(id) ON DELETE CASCADE,
        FOREIGN KEY(outbox_id) REFERENCES audiobook_discovery_outbox(id),
        UNIQUE(audiobook_id, media_revision)
      );
      CREATE INDEX IF NOT EXISTS idx_audiobook_proof_jobs_eligible
        ON audiobook_proof_jobs(state, next_attempt_at, id);
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (16, ?)").run("audiobook_proof_jobs");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateContentCatalogArtworkFingerprints(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 17").get();
  if (applied) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "content_catalog", "artwork_poster_fingerprint", "TEXT");
    ensureColumn(db, "content_catalog", "artwork_backdrop_fingerprint", "TEXT");
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (17, ?)")
      .run("content_catalog_artwork_fingerprints");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

