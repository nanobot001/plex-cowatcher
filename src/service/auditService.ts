import type { Db } from "../db/database.js";
import { nowIso } from "../utils/time.js";

export class AuditService {
  constructor(private readonly db: Db) {}

  record(action: string, actor: string | undefined, status: string, payload: unknown, error?: string): void {
    this.db
      .prepare(
        "INSERT INTO audit_log (action, actor, status, payload_json, error, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(action, actor ?? null, status, JSON.stringify(payload), error ?? null, nowIso());
  }

  list(days = 7): unknown[] {
    return this.db
      .prepare(
        "SELECT * FROM audit_log WHERE created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT 200"
      )
      .all(`-${days} days`);
  }
}
