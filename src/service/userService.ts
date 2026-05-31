import type { Db } from "../db/database.js";
import type { ConfiguredUser } from "../types/index.js";
import { readConfiguredUsers } from "../utils/config.js";
import { nowIso } from "../utils/time.js";

export class UserService {
  constructor(private readonly db: Db) {}

  syncConfiguredUsers(users = readConfiguredUsers()): void {
    const now = nowIso();
    const upsert = this.db.prepare(`
      INSERT INTO users (
        plex_user_id, plex_username, display_name, discord_user_id,
        is_source_user, is_typical_cowatcher, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(plex_username) DO UPDATE SET
        plex_user_id = excluded.plex_user_id,
        display_name = excluded.display_name,
        discord_user_id = excluded.discord_user_id,
        is_source_user = excluded.is_source_user,
        is_typical_cowatcher = excluded.is_typical_cowatcher,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `);

    this.db.exec("BEGIN");
    try {
      for (const user of users) {
        upsert.run(
          user.plexUserId ?? null,
          user.plexUsername,
          user.displayName,
          user.discordUserId ?? null,
          user.isSourceUser ? 1 : 0,
          user.isTypicalCowatcher ? 1 : 0,
          user.enabled === false ? 0 : 1,
          now,
          now
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listConfigured(): unknown[] {
    return this.db.prepare("SELECT * FROM users ORDER BY is_source_user DESC, display_name ASC").all();
  }

  listTypicalCowatchers(): unknown[] {
    return this.db
      .prepare("SELECT * FROM users WHERE enabled = 1 AND is_typical_cowatcher = 1 ORDER BY display_name ASC")
      .all();
  }

  findById(id: number): { id: number; plex_user_id: string | null; plex_username: string; display_name: string } | undefined {
    return this.db.prepare("SELECT * FROM users WHERE id = ? AND enabled = 1").get(id) as
      | { id: number; plex_user_id: string | null; plex_username: string; display_name: string }
      | undefined;
  }

  findByUsername(username: string): { id: number; plex_username: string } | undefined {
    return this.db.prepare("SELECT id, plex_username FROM users WHERE plex_username = ? AND enabled = 1").get(username) as
      | { id: number; plex_username: string }
      | undefined;
  }
}
