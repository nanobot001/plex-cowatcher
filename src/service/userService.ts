import type { Db } from "../db/database.js";
import type { ConfiguredUser, PlexUser } from "../types/index.js";
import { readConfiguredUsers } from "../utils/config.js";
import { nowIso } from "../utils/time.js";

export class UserService {
  constructor(private readonly db: Db) {}

  syncConfiguredUsers(
    configUsers = readConfiguredUsers(),
    plexUsers: PlexUser[] = []
  ): void {
    const now = nowIso();
    const mergedUsersMap = new Map<string, {
      plexUsername: string;
      displayName: string;
      plexUserId?: string;
      discordUserId?: string;
      isSourceUser: boolean;
      isTypicalCowatcher: boolean;
      enabled: boolean;
    }>();

    // 1. Initialize with config users
    for (const u of configUsers) {
      mergedUsersMap.set(u.plexUsername.toLowerCase(), {
        plexUsername: u.plexUsername,
        displayName: u.displayName,
        plexUserId: u.plexUserId,
        discordUserId: u.discordUserId,
        isSourceUser: u.isSourceUser === true,
        isTypicalCowatcher: u.isTypicalCowatcher !== false,
        enabled: u.enabled !== false
      });
    }

    // 2. Merge users from Plex library
    for (const pu of plexUsers) {
      const key = pu.username.toLowerCase();
      const existing = mergedUsersMap.get(key);
      if (existing) {
        if (!existing.plexUserId || existing.plexUserId === "replace_me") {
          existing.plexUserId = pu.id;
        }
        existing.plexUsername = pu.username; // Use username casing from Plex
      } else {
        mergedUsersMap.set(key, {
          plexUsername: pu.username,
          displayName: pu.displayName || pu.username,
          plexUserId: pu.id,
          discordUserId: undefined,
          isSourceUser: false,
          isTypicalCowatcher: true,
          enabled: true
        });
      }
    }

    // 2b. If plexUsers was provided, disable configured users not present in Plex library
    if (plexUsers.length > 0) {
      const plexUsernamesLower = new Set(plexUsers.map(pu => pu.username.toLowerCase()));
      for (const [key, user] of mergedUsersMap.entries()) {
        if (!plexUsernamesLower.has(key)) {
          user.enabled = false;
          user.isSourceUser = false;
          user.isTypicalCowatcher = false;
        }
      }
    }

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
      // 3. Detect and resolve case-insensitive duplicates in DB
      const allDbUsers = this.db.prepare("SELECT id, plex_username FROM users").all() as { id: number; plex_username: string }[];
      const dbUsersGrouped = new Map<string, typeof allDbUsers>();
      for (const dbu of allDbUsers) {
        const key = dbu.plex_username.toLowerCase();
        if (!dbUsersGrouped.has(key)) {
          dbUsersGrouped.set(key, []);
        }
        dbUsersGrouped.get(key)!.push(dbu);
      }

      for (const [key, dbUsers] of dbUsersGrouped.entries()) {
        if (dbUsers.length > 1) {
          const targetCasing = mergedUsersMap.get(key)?.plexUsername;
          let primaryUser = dbUsers.find(u => u.plex_username === targetCasing);
          if (!primaryUser) {
            primaryUser = dbUsers.sort((a, b) => a.id - b.id)[0]!;
          }

          const primaryId = primaryUser.id;
          const duplicateIds = dbUsers.filter(u => u.id !== primaryId).map(u => u.id);

          console.log(`Merging case-insensitive duplicate users for '${key}': keeping ID ${primaryId}, deleting IDs ${duplicateIds.join(", ")}`);

          for (const dupId of duplicateIds) {
            const tablesToUpdate = [
              { name: "watch_events", col: "source_user_id" },
              { name: "cowatch_confirmations", col: "target_user_id" },
              { name: "copy_jobs", col: "source_user_id" },
              { name: "copy_job_items", col: "target_user_id" },
              { name: "sync_failures", col: "target_user_id" }
            ];

            for (const t of tablesToUpdate) {
              try {
                this.db.prepare(`UPDATE ${t.name} SET ${t.col} = ? WHERE ${t.col} = ?`).run(primaryId, dupId);
              } catch (e) {
                try {
                  this.db.prepare(`DELETE FROM ${t.name} WHERE ${t.col} = ?`).run(dupId);
                } catch (delErr) {
                  // ignore
                }
              }
            }

            this.db.prepare("DELETE FROM users WHERE id = ?").run(dupId);
          }
        }
      }

      // 4. Perform upsert of all active merged users
      const activeUsernames = new Set<string>();
      for (const user of mergedUsersMap.values()) {
        upsert.run(
          user.plexUserId ?? null,
          user.plexUsername,
          user.displayName,
          user.discordUserId ?? null,
          user.isSourceUser ? 1 : 0,
          user.isTypicalCowatcher ? 1 : 0,
          user.enabled ? 1 : 0,
          now,
          now
        );
        activeUsernames.add(user.plexUsername.toLowerCase());
      }

      // 5. Remove or disable users not present in the active merged list
      const updatedDbUsers = this.db.prepare("SELECT id, plex_username FROM users").all() as { id: number; plex_username: string }[];
      for (const dbUser of updatedDbUsers) {
        if (!activeUsernames.has(dbUser.plex_username.toLowerCase())) {
          try {
            this.db.prepare("DELETE FROM users WHERE id = ?").run(dbUser.id);
          } catch (error) {
            if (error instanceof Error && error.message.includes("FOREIGN KEY constraint failed")) {
              this.db.prepare(`
                UPDATE users 
                SET enabled = 0, is_source_user = 0, is_typical_cowatcher = 0, updated_at = ? 
                WHERE id = ?
              `).run(now, dbUser.id);
            } else {
              throw error;
            }
          }
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listConfigured(): unknown[] {
    return this.db.prepare(`
      SELECT * FROM users 
      WHERE is_source_user = 1 OR is_typical_cowatcher = 1 OR enabled = 1
      ORDER BY is_source_user DESC, display_name ASC
    `).all();
  }

  listTypicalCowatchers(): unknown[] {
    return this.db
      .prepare("SELECT * FROM users WHERE enabled = 1 AND is_typical_cowatcher = 1 ORDER BY display_name ASC")
      .all();
  }

  listSourceUsers(): { id: number; plex_username: string }[] {
    return this.db
      .prepare("SELECT id, plex_username FROM users WHERE enabled = 1 AND is_source_user = 1 ORDER BY display_name ASC")
      .all() as { id: number; plex_username: string }[];
  }

  findById(id: number): { id: number; plex_user_id: string | null; plex_username: string; display_name: string } | undefined {
    return this.db.prepare("SELECT * FROM users WHERE id = ? AND enabled = 1").get(id) as
      | { id: number; plex_user_id: string | null; plex_username: string; display_name: string }
      | undefined;
  }

  findByUsername(username: string): { id: number; plex_username: string; plex_user_id: string | null } | undefined {
    return this.db.prepare("SELECT id, plex_username, plex_user_id FROM users WHERE plex_username = ? AND enabled = 1").get(username) as
      | { id: number; plex_username: string; plex_user_id: string | null }
      | undefined;
  }

  findSourceByUsername(username: string): { id: number; plex_username: string; plex_user_id: string | null } | undefined {
    return this.db.prepare("SELECT id, plex_username, plex_user_id FROM users WHERE plex_username = ? AND enabled = 1 AND is_source_user = 1").get(username) as
      | { id: number; plex_username: string; plex_user_id: string | null }
      | undefined;
  }
}
