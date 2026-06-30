import type { Db } from "../db/database.js";
import { nowIso } from "../utils/time.js";

export interface DashboardPreferenceUserRow {
  id: number;
  plex_username: string;
  alias: string | null;
  shown: boolean;
}

export interface DashboardPreferenceUpdateRow {
  id: number;
  alias: string | null;
  shown: boolean;
}

export class DashboardPreferenceService {
  constructor(private readonly db: Db) {}

  listUsers(): DashboardPreferenceUserRow[] {
    return this.db.prepare(`
      SELECT
        id,
        plex_username,
        dashboard_alias AS alias,
        COALESCE(dashboard_shown, enabled) AS shown
      FROM users
      ORDER BY plex_username ASC, id ASC
    `).all().map((row) => ({
      id: Number(row.id),
      plex_username: String(row.plex_username),
      alias: row.alias == null || String(row.alias).trim() === "" ? null : String(row.alias),
      shown: Number(row.shown) === 1
    })) as DashboardPreferenceUserRow[];
  }

  saveUsers(updatedUsers: DashboardPreferenceUpdateRow[]): void {
    const stmt = this.db.prepare(`
      UPDATE users
      SET dashboard_alias = ?, dashboard_shown = ?, updated_at = ?
      WHERE id = ?
    `);
    const now = nowIso();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const user of updatedUsers) {
        stmt.run(user.alias, user.shown ? 1 : 0, now, user.id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
