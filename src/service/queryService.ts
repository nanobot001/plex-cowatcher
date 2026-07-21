import type { Db } from "../db/database.js";
import { z } from "zod";

// Validation schema
export const queryParamsSchema = z.object({
  user: z.string().optional(),
  ratingKey: z.string().optional(),
  showRatingKey: z.string().optional(),
  mediaType: z.string().optional(),
  genre: z.string().optional(),
  localDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format YYYY-MM-DD").optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  timezone: z.string().regex(/^[+-]\d{2}:\d{2}$/, "Invalid timezone format [+-]HH:MM").optional(),
  completed: z.preprocess((val) => {
    if (val === "true" || val === "1") return true;
    if (val === "false" || val === "0") return false;
    return val;
  }, z.boolean().optional()),
  limit: z.preprocess((val) => val !== undefined ? Number(val) : undefined, z.number().int().positive().default(50)),
  offset: z.preprocess((val) => val !== undefined ? Number(val) : undefined, z.number().int().nonnegative().default(0))
});

export type QueryParams = z.infer<typeof queryParamsSchema>;

function getSystemTimezoneOffset(): string {
  const offsetMinutes = new Date().getTimezoneOffset();
  const absOffset = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const minutes = String(absOffset % 60).padStart(2, '0');
  const sign = offsetMinutes <= 0 ? '+' : '-';
  return `${sign}${hours}:${minutes}`;
}

export class QueryService {
  constructor(private readonly db: Db) {}

  queryHistory(params: unknown) {
    const parsed = queryParamsSchema.safeParse(params);
    if (!parsed.success) {
      throw new Error(`Validation Error: ${parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`);
    }

    const {
      user,
      ratingKey,
      showRatingKey,
      mediaType,
      genre,
      localDay,
      dateFrom,
      dateTo,
      timezone,
      completed,
      limit,
      offset
    } = parsed.data;

    let sql = `
      SELECT 
        po.*,
        u.plex_username,
        u.display_name,
        we.id AS watch_event_id,
        we.source_user_id,
        we.prompt_status,
        cc.status AS confirmation_status,
        cc.plex_sync_status,
        cc.plex_sync_error,
        cat.genres_json,
        recovery.source_status AS historical_source_status
      FROM playback_observations po
      JOIN users u ON po.user_id = u.id
      LEFT JOIN content_catalog cat ON po.rating_key = cat.rating_key
      LEFT JOIN watch_events we ON 
        we.rating_key = po.rating_key 
        AND we.watched_at >= strftime('%Y-%m-%dT%H:%M:%fZ', po.watched_at, '-600 seconds')
        AND we.watched_at <= strftime('%Y-%m-%dT%H:%M:%fZ', po.watched_at, '+600 seconds')
      LEFT JOIN cowatch_confirmations cc ON 
        cc.watch_event_id = we.id 
        AND cc.target_user_id = po.user_id
      LEFT JOIN plex_historical_recovery_items recovery ON
        recovery.imported_observation_id = po.id
        AND recovery.media_type = po.media_type
      WHERE 1=1
    `;

    const args: any[] = [];

    if (user) {
      sql += " AND u.plex_username = ?";
      args.push(user);
    }

    if (ratingKey) {
      sql += " AND po.rating_key = ?";
      args.push(ratingKey);
    }

    if (showRatingKey) {
      sql += " AND po.grandparent_rating_key = ?";
      args.push(showRatingKey);
    }

    if (mediaType) {
      sql += " AND po.media_type = ?";
      args.push(mediaType);
    }

    if (completed !== undefined) {
      sql += " AND po.completed = ?";
      args.push(completed ? 1 : 0);
    }

    if (localDay) {
      const tzOffset = timezone || getSystemTimezoneOffset();
      const startUtc = new Date(`${localDay}T00:00:00${tzOffset}`).toISOString();
      const endUtc = new Date(`${localDay}T23:59:59.999${tzOffset}`).toISOString();
      sql += " AND po.watched_at >= ? AND po.watched_at <= ?";
      args.push(startUtc, endUtc);
    } else {
      if (dateFrom) {
        sql += " AND po.watched_at >= ?";
        args.push(new Date(dateFrom).toISOString());
      }
      if (dateTo) {
        sql += " AND po.watched_at <= ?";
        args.push(new Date(dateTo).toISOString());
      }
    }

    sql += " ORDER BY po.watched_at DESC, po.id DESC";
    sql += " LIMIT ? OFFSET ?";
    args.push(limit, offset);

    const rows = this.db.prepare(sql).all(...args) as any[];

    let results = rows.map((row) => {
      let genres: string[] = [];
      if (row.genres_json) {
        try {
          genres = JSON.parse(row.genres_json);
        } catch (_) {}
      }

      const isSourceUser = row.user_id === row.source_user_id;
      const isConfirmed = row.confirmation_status === "confirmed";
      const isPlexSynced = isSourceUser || ["marked_watched", "already_watched"].includes(row.plex_sync_status);

      return {
        id: row.id,
        userId: row.user_id,
        username: row.plex_username,
        displayName: row.display_name,
        ratingKey: row.rating_key,
        grandparentRatingKey: row.grandparent_rating_key,
        parentRatingKey: row.parent_rating_key,
        plexGuid: row.plex_guid,
        mediaType: row.media_type,
        libraryName: row.library_name,
        title: row.title,
        showTitle: row.show_title,
        seasonNumber: row.season_number,
        episodeNumber: row.episode_number,
        watchedAt: row.watched_at,
        percentComplete: row.percent_complete,
        viewOffset: row.view_offset,
        duration: row.duration,
        completed: row.completed === 1,
        genres,
        evidence: {
          observed: true,
          confirmed: isConfirmed,
          plexSynced: isPlexSynced,
          inferred: false,
          sourceStatus: row.historical_source_status
            || (row.watched_at_provenance === "plex_historical_last_view" ? "plex_only" : "tautulli_backed"),
          provenance: {
            watchedAt: row.watched_at_provenance || "unknown",
            percentComplete: row.percent_complete_provenance || "unknown"
          }
        }
      };
    });

    if (genre) {
      results = results.filter(r => r.genres.some(g => g.toLowerCase() === genre.toLowerCase()));
    }

    return results;
  }
}
