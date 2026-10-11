/**
 * Achievements Service.
 *
 * Coordinates evidence reading and pure evaluation over canonical rules.
 * Provides the unified read interface for HTTP routes, CLI tools, and future clients.
 */

import type { Db } from '../db/database.js';
import type {
  AchievementRule,
  AchievementEvaluationPayload,
  ShowcaseFacet
} from './types.js';
import { AchievementEvidenceReader } from './evidenceReader.js';
import { evaluateAllAchievements } from './evaluator.js';
import { DEFAULT_ACHIEVEMENT_RULES } from './ruleCatalog.js';

export interface GetAchievementsOptions {
  user?: string | number;
  facet?: ShowcaseFacet;
  timezone?: string;
  nowIso?: string;
}

export class AchievementService {
  private readonly reader: AchievementEvidenceReader;

  constructor(
    private readonly db: Db,
    private readonly rules: AchievementRule[] = DEFAULT_ACHIEVEMENT_RULES
  ) {
    this.reader = new AchievementEvidenceReader(db);
  }

  public getAchievements(options: GetAchievementsOptions = {}): AchievementEvaluationPayload {
    const watermark = this.reader.getWatermark();
    let subjects = this.reader.readAllSubjects({ nowIso: options.nowIso });

    if (options.user != null) {
      const target = String(options.user).trim().toLowerCase();
      subjects = subjects.filter((s) => {
        if (/^\d+$/.test(target)) {
          return s.userId === Number(target);
        }
        return (
          s.username.toLowerCase() === target ||
          s.displayName.toLowerCase() === target
        );
      });
    }

    const context = {
      timezone: options.timezone || 'UTC',
      nowIso: options.nowIso
    };

    let payload = evaluateAllAchievements(this.rules, subjects, watermark, context);

    if (options.facet) {
      const facet = options.facet;
      payload = {
        ...payload,
        results: payload.results.filter((r) => r.facet === facet)
      };
    }

    return payload;
  }
}
