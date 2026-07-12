import { createHash } from "node:crypto";
import type { Db } from "../db/database.js";

export interface ChapterActivationItem {
  index: number;
  title: string;
  start_offset_ms: number;
  end_offset_ms: number;
}

export interface ChapterActivationInput {
  audiobookId: number;
  chapters: ChapterActivationItem[];
  sourceType: string;
  sourceStatus: string;
  confidence: number;
  mediaRevision?: string;
  contractVersion?: number;
  resolverVersion?: string;
  warnings?: string[];
  activatedAt: string;
}

export class AudiobookChapterActivationService {
  constructor(private readonly db: Db) {}

  activate(input: ChapterActivationInput): number {
    const canonical = JSON.stringify(input.chapters.map((chapter) => [
      chapter.index, chapter.title, chapter.start_offset_ms, chapter.end_offset_ms
    ]));
    const digest = createHash("sha256").update(canonical).digest("hex");
    const book = this.db.prepare(`
      SELECT current_media_revision FROM audiobook_books WHERE id = ?
    `).get(input.audiobookId) as { current_media_revision: string | null } | undefined;
    if (!book) throw new Error("AUDIOBOOK_NOT_FOUND");
    const mediaRevision = input.mediaRevision ?? book.current_media_revision ?? `legacy:${digest}`;
    const durationMs = input.chapters.length > 0
      ? Math.max(...input.chapters.map((chapter) => chapter.end_offset_ms))
      : null;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO audiobook_chapter_revisions
          (audiobook_id, media_revision, source_type, source_status, confidence, chapter_digest,
           duration_ms, contract_version, resolver_version, warnings_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(input.audiobookId, mediaRevision, input.sourceType, input.sourceStatus, input.confidence,
        digest, durationMs, input.contractVersion ?? 1, input.resolverVersion ?? null,
        JSON.stringify(input.warnings ?? []), input.activatedAt);
      const revision = this.db.prepare(`
        SELECT id FROM audiobook_chapter_revisions
        WHERE audiobook_id = ? AND media_revision = ? AND source_type = ? AND chapter_digest = ?
      `).get(input.audiobookId, mediaRevision, input.sourceType, digest) as { id: number };

      const existingItems = this.db.prepare(`
        SELECT COUNT(*) AS count FROM audiobook_chapter_revision_items WHERE chapter_revision_id = ?
      `).get(revision.id) as { count: number };
      if (existingItems.count === 0) {
        const insertRevisionItem = this.db.prepare(`
          INSERT INTO audiobook_chapter_revision_items
            (chapter_revision_id, chapter_index, title, start_offset_ms, end_offset_ms)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const chapter of input.chapters) {
          insertRevisionItem.run(revision.id, chapter.index, chapter.title,
            chapter.start_offset_ms, chapter.end_offset_ms);
        }
      }

      this.db.prepare(`
        UPDATE audiobook_chapter_revisions
        SET source_status = 'superseded', invalidated_at = COALESCE(invalidated_at, ?)
        WHERE audiobook_id = ? AND id <> ? AND source_status = 'active'
      `).run(input.activatedAt, input.audiobookId, revision.id);
      this.db.prepare(`
        UPDATE audiobook_chapter_revisions
        SET source_status = ?, confidence = ?, activated_at = ?, invalidated_at = NULL
        WHERE id = ?
      `).run(input.sourceStatus, input.confidence,
        input.sourceStatus === "active" ? input.activatedAt : null, revision.id);

      this.db.prepare(`
        INSERT INTO audiobook_chapter_sources
          (audiobook_id, source_type, source_status, confidence, refreshed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(audiobook_id, source_type) DO UPDATE SET
          source_status = excluded.source_status,
          confidence = excluded.confidence,
          refreshed_at = excluded.refreshed_at
      `).run(input.audiobookId, input.sourceType, input.sourceStatus, input.confidence, input.activatedAt);
      this.db.prepare(`
        UPDATE audiobook_chapter_sources SET source_status = 'superseded'
        WHERE audiobook_id = ? AND source_type <> ? AND source_status = 'active'
      `).run(input.audiobookId, input.sourceType);
      this.db.prepare("DELETE FROM audiobook_chapters WHERE audiobook_id = ?").run(input.audiobookId);
      const insertActiveItem = this.db.prepare(`
        INSERT INTO audiobook_chapters
          (audiobook_id, chapter_index, title, start_offset_ms, end_offset_ms, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const chapter of input.chapters) {
        insertActiveItem.run(input.audiobookId, chapter.index, chapter.title,
          chapter.start_offset_ms, chapter.end_offset_ms, input.activatedAt, input.activatedAt);
      }
      this.db.prepare("UPDATE audiobook_books SET active_chapter_revision_id = ? WHERE id = ?")
        .run(input.sourceStatus === "active" ? revision.id : null, input.audiobookId);
      this.db.exec("COMMIT");
      return revision.id;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
