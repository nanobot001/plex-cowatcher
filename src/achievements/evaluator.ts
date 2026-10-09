/**
 * Pure, deterministic Achievements Evaluator.
 *
 * Implements (rules, evidence, context) => results with zero side-effects
 * and zero external runtime dependencies.
 */

import type {
  AchievementRule,
  AchievementResult,
  AchievementEvaluationPayload,
  EvidenceWatermark,
  EvaluationContext,
  SubjectEvidence,
  SupportingEvidenceRef
} from './types.js';

/**
 * Evaluates achievements for a single subject against the rule catalog.
 */
export function evaluateSubjectAchievements(
  rules: AchievementRule[],
  subject: SubjectEvidence,
  _context: EvaluationContext
): AchievementResult[] {
  const results: AchievementResult[] = [];

  for (const rule of rules) {
    let result: AchievementResult;

    switch (rule.family) {
      case 'first_watch':
        result = evaluateFirstWatch(rule, subject);
        break;
      case 'watch_count':
        result = evaluateWatchCount(rule, subject);
        break;
      case 'rewatch':
        result = evaluateRewatch(rule, subject);
        break;
      case 'confirmed_cowatch':
        result = evaluateConfirmedCoWatch(rule, subject);
        break;
      case 'completion':
        result = evaluateCompletion(rule, subject);
        break;
      default:
        result = {
          userId: subject.userId,
          ruleId: rule.ruleId,
          version: rule.version,
          badge: rule.badge,
          state: 'unknown',
          progress: { current: 0, target: rule.threshold, unit: rule.unit },
          earnedAt: null,
          supportingEvidence: [],
          reason: `Unrecognized rule family '${(rule as any).family}'`
        };
    }

    if (rule.facet) {
      result.facet = rule.facet;
    }

    results.push(result);
  }

  // Stable sort by ruleId, version
  results.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.version - b.version);
  return results;
}

/**
 * Evaluates all visible subjects and returns the versioned contract payload.
 */
export function evaluateAllAchievements(
  rules: AchievementRule[],
  subjects: SubjectEvidence[],
  watermark: EvidenceWatermark,
  context: EvaluationContext
): AchievementEvaluationPayload {
  const allResults: AchievementResult[] = [];

  for (const subject of subjects) {
    const subjectResults = evaluateSubjectAchievements(rules, subject, context);
    allResults.push(...subjectResults);
  }

  // Stable deterministic ordering: userId ASC, ruleId ASC, version ASC
  allResults.sort((a, b) => {
    if (a.userId !== b.userId) return a.userId - b.userId;
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
    return a.version - b.version;
  });

  return {
    contractVersion: 1,
    watermark,
    timezone: context.timezone,
    evaluatedAt: context.nowIso ?? new Date().toISOString(),
    results: allResults
  };
}

function evaluateFirstWatch(rule: AchievementRule, subject: SubjectEvidence): AchievementResult {
  const matchingPlays = subject.plays
    .filter((play) => play.completed)
    .filter((play) => !rule.scope?.category || play.category === rule.scope.category)
    .sort((a, b) => {
      if (!a.watchedAt && !b.watchedAt) return a.id - b.id;
      if (!a.watchedAt) return 1;
      if (!b.watchedAt) return -1;
      return a.watchedAt.localeCompare(b.watchedAt) || a.id - b.id;
    });

  if (matchingPlays.length > 0) {
    const firstPlay = matchingPlays[0];
    const earnedAt = firstPlay.watchedAt ?? null;
    const supporting: SupportingEvidenceRef = {
      kind: firstPlay.sourceKind,
      id: firstPlay.id,
      eventTime: firstPlay.watchedAt,
      title: firstPlay.title
    };

    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'earned',
      progress: { current: 1, target: 1, unit: rule.unit },
      earnedAt,
      supportingEvidence: [supporting],
      reason: `First completed ${rule.unit} recorded`
    };
  }

  return {
    userId: subject.userId,
    ruleId: rule.ruleId,
    version: rule.version,
    badge: rule.badge,
    state: 'not_earned',
    progress: { current: 0, target: 1, unit: rule.unit },
    earnedAt: null,
    supportingEvidence: [],
    reason: `No completed ${rule.unit} found`
  };
}

function evaluateWatchCount(rule: AchievementRule, subject: SubjectEvidence): AchievementResult {
  if (rule.unit === 'audiobook_book') {
    const count = subject.completedAudiobookCount;
    const earned = count >= rule.threshold;
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: earned ? 'earned' : count > 0 ? 'in_progress' : 'not_earned',
      progress: { current: count, target: rule.threshold, unit: rule.unit },
      earnedAt: null,
      supportingEvidence: [],
      reason: earned
        ? `Completed ${count} audiobook books`
        : `Completed ${count} of ${rule.threshold} audiobook books`
    };
  }

  // For movie and tv watch counts, count distinct completed items to reward distinct titles
  const distinctPlaysByRatingKey = new Map<string, typeof subject.plays[0]>();
  for (const play of subject.plays) {
    if (!play.completed) continue;
    if (rule.scope?.category && play.category !== rule.scope.category) continue;
    if (!distinctPlaysByRatingKey.has(play.ratingKey)) {
      distinctPlaysByRatingKey.set(play.ratingKey, play);
    }
  }

  const qualifying = [...distinctPlaysByRatingKey.values()].sort((a, b) => {
    if (!a.watchedAt && !b.watchedAt) return a.id - b.id;
    if (!a.watchedAt) return 1;
    if (!b.watchedAt) return -1;
    return a.watchedAt.localeCompare(b.watchedAt) || a.id - b.id;
  });

  const count = qualifying.length;
  const earned = count >= rule.threshold;

  let earnedAt: string | null = null;
  if (earned && rule.threshold > 0) {
    const crossingItem = qualifying[rule.threshold - 1];
    earnedAt = crossingItem?.watchedAt ?? null;
  }

  const supporting: SupportingEvidenceRef[] = qualifying.slice(0, rule.threshold).map((p) => ({
    kind: p.sourceKind,
    id: p.id,
    eventTime: p.watchedAt,
    title: p.title
  }));

  return {
    userId: subject.userId,
    ruleId: rule.ruleId,
    version: rule.version,
    badge: rule.badge,
    state: earned ? 'earned' : count > 0 ? 'in_progress' : 'not_earned',
    progress: { current: count, target: rule.threshold, unit: rule.unit },
    earnedAt,
    supportingEvidence: supporting,
    reason: earned
      ? `Reached ${rule.threshold} ${rule.unit}s`
      : `${count} of ${rule.threshold} ${rule.unit}s completed`
  };
}

function evaluateRewatch(rule: AchievementRule, subject: SubjectEvidence): AchievementResult {
  let totalReplays = 0;
  const supporting: SupportingEvidenceRef[] = [];

  for (const [ratingKey, replayCount] of subject.replaysByRatingKey.entries()) {
    // If scope filter is provided, check matching play category
    if (rule.scope?.category) {
      const samplePlay = subject.plays.find((p) => p.ratingKey === ratingKey);
      if (samplePlay && samplePlay.category !== rule.scope.category) {
        continue;
      }
    }
    totalReplays += replayCount;
    const refs = subject.replayEvidenceByRatingKey?.get(ratingKey) ?? [];
    supporting.push(...refs);
  }

  const earned = totalReplays >= rule.threshold;
  const crossingRef = supporting[rule.threshold - 1];
  const earnedAt = earned && crossingRef ? crossingRef.eventTime ?? null : null;

  return {
    userId: subject.userId,
    ruleId: rule.ruleId,
    version: rule.version,
    badge: rule.badge,
    state: earned ? 'earned' : totalReplays > 0 ? 'in_progress' : 'not_earned',
    progress: { current: totalReplays, target: rule.threshold, unit: rule.unit },
    earnedAt,
    supportingEvidence: supporting.slice(0, rule.threshold),
    reason: earned
      ? `Completed ${totalReplays} rewatches`
      : `${totalReplays} of ${rule.threshold} rewatches completed`
  };
}

function evaluateConfirmedCoWatch(rule: AchievementRule, subject: SubjectEvidence): AchievementResult {
  const count = subject.confirmedCoWatches.length;
  const earned = count >= rule.threshold;

  if (earned) {
    const crossing = subject.confirmedCoWatches[rule.threshold - 1];
    const earnedAt = crossing?.watchedAt ?? null;
    const supporting: SupportingEvidenceRef[] = subject.confirmedCoWatches.slice(0, rule.threshold).map((c) => ({
      kind: c.sourceKind,
      id: c.id,
      eventTime: c.watchedAt,
      title: c.title
    }));

    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'earned',
      progress: { current: count, target: rule.threshold, unit: rule.unit },
      earnedAt,
      supportingEvidence: supporting,
      reason: `Confirmed ${count} co-watches`
    };
  }

  if (count > 0) {
    const supporting: SupportingEvidenceRef[] = subject.confirmedCoWatches.map((c) => ({
      kind: c.sourceKind,
      id: c.id,
      eventTime: c.watchedAt,
      title: c.title
    }));

    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'in_progress',
      progress: { current: count, target: rule.threshold, unit: rule.unit },
      earnedAt: null,
      supportingEvidence: supporting,
      reason: `${count} of ${rule.threshold} confirmed co-watches`
    };
  }

  // Count is 0: check if user has inferred co-watching without confirmed co-watches
  if (subject.hasInferredCoWatchOnly) {
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'blocked',
      progress: { current: 0, target: rule.threshold, unit: rule.unit },
      earnedAt: null,
      supportingEvidence: [],
      reason: 'Inferred co-watching cannot satisfy confirmed co-watch rules'
    };
  }

  return {
    userId: subject.userId,
    ruleId: rule.ruleId,
    version: rule.version,
    badge: rule.badge,
    state: 'not_earned',
    progress: { current: 0, target: rule.threshold, unit: rule.unit },
    earnedAt: null,
    supportingEvidence: [],
    reason: 'No confirmed co-watches recorded'
  };
}

function evaluateCompletion(rule: AchievementRule, subject: SubjectEvidence): AchievementResult {
  if (subject.hasUnknownDenominator) {
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'unknown',
      progress: { current: 0, target: rule.threshold, unit: rule.unit },
      earnedAt: null,
      supportingEvidence: [],
      reason: 'Unknown denominator or missing classification prevents completion evaluation'
    };
  }

  return {
    userId: subject.userId,
    ruleId: rule.ruleId,
    version: rule.version,
    badge: rule.badge,
    state: 'not_earned',
    progress: { current: 0, target: rule.threshold, unit: rule.unit },
    earnedAt: null,
    supportingEvidence: [],
    reason: 'Completion criteria not yet met'
  };
}
