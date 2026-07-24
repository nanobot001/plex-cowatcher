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
  migratePlexHistoricalMovieBackfill(db);
  migrateArchiveOwnedViewRecovery(db);
  migrateArchiveExternalObservationLinks(db);
  migrateArchiveIdentityReview(db);
  migrateTautulliIngestionReconciliation(db);
  migrateCanonicalPlexMovieIdentity(db);
  migratePlexSupplementalHistoricalRecovery(db);
  migratePlexPlayHistoryRecovery(db);
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

function migratePlexHistoricalMovieBackfill(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 18").get();
  if (applied) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS plex_historical_backfill_runs (
        id TEXT PRIMARY KEY,
        cutoff_at TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT
      );
      CREATE TABLE IF NOT EXISTS plex_historical_backfill_users (
        run_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        plex_user_id TEXT,
        plex_username TEXT NOT NULL,
        visibility_status TEXT NOT NULL,
        status TEXT NOT NULL,
        movie_count INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        duplicate_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (run_id, user_id),
        FOREIGN KEY(run_id) REFERENCES plex_historical_backfill_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS plex_historical_movie_snapshots (
        snapshot_key TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        plex_user_id TEXT,
        rating_key TEXT NOT NULL,
        plex_guid TEXT,
        title TEXT NOT NULL,
        library_name TEXT,
        view_count INTEGER,
        last_viewed_at TEXT,
        cutoff_at TEXT NOT NULL,
        queried_at TEXT NOT NULL,
        outcome TEXT NOT NULL,
        error_code TEXT,
        imported_observation_id INTEGER,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        seen_count INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(run_id) REFERENCES plex_historical_backfill_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(imported_observation_id) REFERENCES playback_observations(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plex_historical_snapshots_user_time
        ON plex_historical_movie_snapshots(user_id, last_viewed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_plex_historical_snapshots_guid
        ON plex_historical_movie_snapshots(plex_guid);
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (18, ?)")
      .run("plex_historical_movie_backfill");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateArchiveOwnedViewRecovery(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 19").get();
  if (applied) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS archive_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canonical_key TEXT NOT NULL UNIQUE,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        status TEXT NOT NULL DEFAULT 'resolved' CHECK (status IN ('resolved', 'unresolved', 'ambiguous', 'removed', 'metadata_incomplete')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS archive_media_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_media_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        alias_type TEXT NOT NULL,
        alias_value TEXT NOT NULL,
        title_snapshot TEXT,
        year_snapshot INTEGER,
        resolution_method TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        UNIQUE(source, alias_type, alias_value),
        FOREIGN KEY(archive_media_id) REFERENCES archive_media(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_archive_alias_lookup ON archive_media_aliases(alias_type, alias_value);
      CREATE TABLE IF NOT EXISTS archive_watch_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_media_id INTEGER,
        user_id INTEGER,
        source TEXT NOT NULL,
        source_record_key TEXT NOT NULL,
        source_account_key TEXT,
        source_guid TEXT,
        source_rating_key TEXT,
        title_snapshot TEXT NOT NULL,
        event_time TEXT,
        event_time_precision TEXT NOT NULL CHECK (event_time_precision IN ('second', 'day', 'unknown')),
        completed INTEGER,
        view_count INTEGER,
        resolution_status TEXT NOT NULL CHECK (resolution_status IN ('resolved', 'unresolved', 'ambiguous', 'metadata_incomplete')),
        captured_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(source, source_record_key),
        FOREIGN KEY(archive_media_id) REFERENCES archive_media(id) ON DELETE SET NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_archive_events_media_time ON archive_watch_events(archive_media_id, event_time DESC);
      CREATE INDEX IF NOT EXISTS idx_archive_events_user_time ON archive_watch_events(user_id, event_time DESC);
      CREATE TABLE IF NOT EXISTS archive_event_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        left_event_id INTEGER NOT NULL,
        right_event_id INTEGER NOT NULL,
        relation TEXT NOT NULL CHECK (relation IN ('same_event', 'same_media', 'duplicate')),
        method TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
        created_at TEXT NOT NULL,
        UNIQUE(left_event_id, right_event_id, relation),
        FOREIGN KEY(left_event_id) REFERENCES archive_watch_events(id) ON DELETE CASCADE,
        FOREIGN KEY(right_event_id) REFERENCES archive_watch_events(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS archive_ingest_runs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT
      );
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (19, ?)").run("archive_owned_view_recovery");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateArchiveExternalObservationLinks(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 20").get();
  if (applied) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS archive_observation_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_event_id INTEGER NOT NULL,
        playback_observation_id INTEGER NOT NULL,
        relation TEXT NOT NULL CHECK (relation IN ('same_event', 'same_media', 'duplicate')),
        method TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
        created_at TEXT NOT NULL,
        UNIQUE(archive_event_id, playback_observation_id, relation),
        FOREIGN KEY(archive_event_id) REFERENCES archive_watch_events(id) ON DELETE CASCADE,
        FOREIGN KEY(playback_observation_id) REFERENCES playback_observations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_archive_observation_links_observation
        ON archive_observation_links(playback_observation_id);
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (20, ?)")
      .run("archive_external_observation_links");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateArchiveIdentityReview(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 21").get();
  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "archive_watch_events", "account_resolution_method", "TEXT NOT NULL DEFAULT 'unknown'");
    ensureColumn(db, "archive_watch_events", "account_confidence", "TEXT NOT NULL DEFAULT 'unknown'");
    db.exec(`
      CREATE TABLE IF NOT EXISTS archive_identity_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        archive_media_id INTEGER NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('assign', 'unrelated', 'unresolved')),
        target_rating_key TEXT,
        method TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
        actor TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(archive_media_id) REFERENCES archive_media(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_archive_identity_decisions_media
        ON archive_identity_decisions(archive_media_id, id DESC);
      UPDATE archive_watch_events
      SET account_resolution_method = 'exact_account_key', account_confidence = 'high'
      WHERE user_id IS NOT NULL AND trim(COALESCE(source_account_key, '')) <> ''
        AND EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = archive_watch_events.user_id
            AND lower(u.plex_username) = lower(archive_watch_events.source_account_key)
        );
    `);
    if (!applied) {
      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (21, ?)").run("archive_identity_review");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateTautulliIngestionReconciliation(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 22").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tautulli_ingestion_runs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'tautulli',
        mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'incomplete', 'failed')),
        requested_user_id INTEGER,
        page_size INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT,
        FOREIGN KEY(requested_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS tautulli_ingestion_users (
        run_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        plex_username TEXT NOT NULL,
        cursor INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'incomplete')),
        page_count INTEGER NOT NULL DEFAULT 0,
        source_row_count INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        PRIMARY KEY (run_id, user_id),
        FOREIGN KEY(run_id) REFERENCES tautulli_ingestion_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS tautulli_ingestion_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        start_offset INTEGER NOT NULL,
        page_length INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
        source_row_count INTEGER NOT NULL DEFAULT 0,
        imported_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        page_fingerprint TEXT,
        error_code TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(run_id, user_id, start_offset),
        FOREIGN KEY(run_id) REFERENCES tautulli_ingestion_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS tautulli_ingestion_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER NOT NULL,
        run_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        source_row_key TEXT NOT NULL,
        source_row_id TEXT,
        rating_key TEXT NOT NULL,
        plex_guid TEXT,
        identity_key TEXT NOT NULL,
        media_type TEXT NOT NULL,
        watched_at TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('stored', 'already_present', 'failed')),
        observation_id INTEGER,
        error_code TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(run_id, user_id, source_row_key),
        FOREIGN KEY(page_id) REFERENCES tautulli_ingestion_pages(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES tautulli_ingestion_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(observation_id) REFERENCES playback_observations(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_runs_status
        ON tautulli_ingestion_runs(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_users_status
        ON tautulli_ingestion_users(run_id, status);
      CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_pages_user_start
        ON tautulli_ingestion_pages(run_id, user_id, start_offset);
      CREATE INDEX IF NOT EXISTS idx_tautulli_ingestion_rows_identity
        ON tautulli_ingestion_rows(run_id, user_id, identity_key);
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (22, ?)")
      .run("tautulli_ingestion_reconciliation");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateCanonicalPlexMovieIdentity(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 23").get();
  if (applied) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS movie_canonical_identities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plex_guid TEXT NOT NULL UNIQUE,
        canonical_rating_key TEXT NOT NULL,
        title_snapshot TEXT,
        status TEXT NOT NULL CHECK (status IN ('resolved', 'ambiguous', 'unresolved')),
        resolution_method TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS movie_identity_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canonical_movie_id INTEGER NOT NULL,
        rating_key TEXT NOT NULL UNIQUE,
        alias_role TEXT NOT NULL CHECK (alias_role IN ('canonical', 'stale', 'observed')),
        title_snapshot TEXT,
        resolution_method TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unknown')),
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        FOREIGN KEY(canonical_movie_id) REFERENCES movie_canonical_identities(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_movie_identity_aliases_canonical
        ON movie_identity_aliases(canonical_movie_id, alias_role, rating_key);
      CREATE INDEX IF NOT EXISTS idx_movie_identity_aliases_rating_key
        ON movie_identity_aliases(rating_key);
    `);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (23, ?)").run("canonical_plex_movie_identity");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migratePlexSupplementalHistoricalRecovery(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 24").get();
  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "plex_historical_backfill_users", "episode_count", "INTEGER NOT NULL DEFAULT 0");
    db.exec(`
      CREATE TABLE IF NOT EXISTS plex_historical_recovery_items (
        snapshot_key TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        plex_user_id TEXT,
        media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'episode')),
        rating_key TEXT NOT NULL,
        plex_guid TEXT,
        grandparent_rating_key TEXT,
        parent_rating_key TEXT,
        title TEXT NOT NULL,
        show_title TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        library_name TEXT,
        view_count INTEGER,
        last_viewed_at TEXT,
        cutoff_at TEXT NOT NULL,
        queried_at TEXT NOT NULL,
        outcome TEXT NOT NULL,
        source_status TEXT NOT NULL CHECK (source_status IN ('unknown', 'plex_only', 'tautulli_backed', 'reconciled')),
        error_code TEXT,
        imported_observation_id INTEGER,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        seen_count INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(run_id) REFERENCES plex_historical_backfill_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(imported_observation_id) REFERENCES playback_observations(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plex_historical_recovery_items_user_type
        ON plex_historical_recovery_items(user_id, media_type, last_viewed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_plex_historical_recovery_items_guid
        ON plex_historical_recovery_items(plex_guid, media_type);
    `);
    if (!applied) {
      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (24, ?)").run("plex_supplemental_historical_recovery");
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migratePlexPlayHistoryRecovery(db: Db): void {
  const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = 25").get();
  db.exec("BEGIN IMMEDIATE");
  try {
    ensureColumn(db, "playback_observations", "session_start_at", "TEXT");
    ensureColumn(db, "playback_observations", "session_end_at", "TEXT");
    ensureColumn(db, "tautulli_ingestion_rows", "session_start_at", "TEXT");
    ensureColumn(db, "tautulli_ingestion_rows", "session_end_at", "TEXT");
    db.exec(`
      CREATE TABLE IF NOT EXISTS plex_history_ingestion_runs (
        id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'apply')),
        status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'incomplete', 'failed')),
        requested_user_id INTEGER, media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'episode', 'all')),
        page_size INTEGER NOT NULL, date_from TEXT, date_to TEXT, started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, completed_at TEXT, summary_json TEXT,
        FOREIGN KEY(requested_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS plex_history_ingestion_users (
        run_id TEXT NOT NULL, user_id INTEGER NOT NULL, plex_username TEXT NOT NULL,
        local_account_id TEXT, cursor INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'incomplete')),
        first_page_fingerprint TEXT, source_total INTEGER, page_count INTEGER NOT NULL DEFAULT 0,
        returned_count INTEGER NOT NULL DEFAULT 0, imported_count INTEGER NOT NULL DEFAULT 0,
        already_present_count INTEGER NOT NULL DEFAULT 0, linked_count INTEGER NOT NULL DEFAULT 0,
        unresolved_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT, updated_at TEXT NOT NULL, completed_at TEXT,
        PRIMARY KEY (run_id, user_id),
        FOREIGN KEY(run_id) REFERENCES plex_history_ingestion_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS plex_history_ingestion_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, user_id INTEGER NOT NULL,
        start_offset INTEGER NOT NULL, page_length INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')), page_fingerprint TEXT,
        error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(run_id, user_id, start_offset),
        FOREIGN KEY(run_id) REFERENCES plex_history_ingestion_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS plex_history_ingestion_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT, page_id INTEGER NOT NULL, run_id TEXT NOT NULL,
        user_id INTEGER NOT NULL, source_record_key TEXT NOT NULL, archive_event_id INTEGER,
        media_type TEXT NOT NULL, viewed_at TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('imported', 'already_present', 'unresolved', 'failed')),
        error_code TEXT, created_at TEXT NOT NULL, UNIQUE(run_id, user_id, source_record_key),
        FOREIGN KEY(page_id) REFERENCES plex_history_ingestion_pages(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES plex_history_ingestion_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(archive_event_id) REFERENCES archive_watch_events(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plex_history_runs_status ON plex_history_ingestion_runs(status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_plex_history_users_status ON plex_history_ingestion_users(run_id, status);
      CREATE INDEX IF NOT EXISTS idx_plex_history_pages_cursor ON plex_history_ingestion_pages(run_id, user_id, start_offset);
      CREATE INDEX IF NOT EXISTS idx_plex_history_rows_event ON plex_history_ingestion_rows(archive_event_id);
    `);
    if (!applied) db.prepare("INSERT INTO schema_migrations (version, name) VALUES (25, ?)").run("plex_play_history_recovery");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

