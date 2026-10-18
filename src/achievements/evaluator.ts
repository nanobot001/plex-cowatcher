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
  SupportingEvidenceRef,
  CanonicalPlay,
  BadgeTier,
  ShowProgressEvidence,
  NextTierProgress,
  EpisodeReplayDetail
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
      case 'obsession_spotlight':
        result = evaluateObsessionSpotlight(rule, subject);
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

  // Dynamic Trophy Shelf: generate show-specific completion and in-progress badges with poster art & rewatch ribbons
  if (subject.showProgress) {
    for (const show of subject.showProgress.values()) {
      if (show.totalEpisodes !== null && show.completedEpisodeKeys.size > 0) {
        const dynamicRuleId = `show_mastery_${show.grandparentRatingKey}`;
        if (!results.some((r) => r.ruleId === dynamicRuleId)) {
          const isRunning = show.seriesStatus === 'running' || Boolean(show.nextAirAt);
          const isComplete = !isRunning &&
            (show.missingOffServerCount ?? 0) === 0 &&
            !show.isCaughtUpOnPlex &&
            show.totalEpisodes !== null &&
            show.completedEpisodeKeys.size >= show.totalEpisodes &&
            (show.lastCompletedWatchedAt !== null || show.allCompletedPlays.length > 0);
          if (isComplete) {
            let minReplay = 0;
            if (show.completedEpisodeKeys.size > 0) {
              const replays = [...show.completedEpisodeKeys].map((k) => show.replaysByEpisode.get(k) ?? 0);
              minReplay = Math.min(...replays);
            }
            const avgReplay = Math.floor(show.allCompletedPlays.length / show.totalEpisodes) - 1;
            const rewatchCount = Math.max(0, Math.max(minReplay, avgReplay));

            let tier: BadgeTier = 'bronze';
            let rewatchSuffix = '';
            let rewatchDesc = '';
            let nextTier: BadgeTier | null = 'silver';
            let nextTierName: string | null = 'Silver (2x Replay)';
            let nextTierReqReplays = 1;

            if (rewatchCount >= 3) {
              tier = 'platinum';
              rewatchSuffix = ' (4x+)';
              rewatchDesc = ` Rewatched ${rewatchCount} times.`;
              nextTier = null;
              nextTierName = null;
              nextTierReqReplays = rewatchCount + 1;
            } else if (rewatchCount === 2) {
              tier = 'gold';
              rewatchSuffix = ' (3x)';
              rewatchDesc = ' Rewatched 2 times.';
              nextTier = 'platinum';
              nextTierName = 'Platinum (4x+ Replay)';
              nextTierReqReplays = 3;
            } else if (rewatchCount === 1) {
              tier = 'silver';
              rewatchSuffix = ' (2x)';
              rewatchDesc = ' Rewatched once.';
              nextTier = 'gold';
              nextTierName = 'Gold (3x Replay)';
              nextTierReqReplays = 2;
            }

            const epList = show.episodeReplayDetails ?? [];
            const rewatchedCount = epList.filter((ep) => ep.replayCount >= nextTierReqReplays).length;
            const targetCount = show.totalEpisodes;
            const remainingCount = nextTier ? Math.max(0, targetCount - rewatchedCount) : 0;
            const percentComplete = targetCount > 0 ? Math.min(100, Math.round((rewatchedCount / targetCount) * 100)) : 0;

            const nextTierProgress: NextTierProgress | null = nextTier ? {
              currentTier: tier,
              nextTier,
              nextTierName,
              rewatchedCount,
              targetCount,
              remainingCount,
              percentComplete
            } : null;

            results.push({
              userId: subject.userId,
              ruleId: dynamicRuleId,
              version: 1,
              facet: 'trophy_shelf',
              badge: {
                badgeKey: `show_mastery_${show.grandparentRatingKey}`,
                tier,
                title: `Show Mastery: ${show.showTitle}${rewatchSuffix}`,
                description: `Completed 100% of ${show.showTitle}.${rewatchDesc}`,
                posterUrl: show.posterUrl,
                iconHint: show.category === 'anime' ? 'anime' : 'series',
                stats: {
                  totalPlays: show.allCompletedPlays.length,
                  completedItems: show.completedEpisodeKeys.size,
                  rewatchCount,
                  availableOnPlex: show.availableOnPlex ?? null,
                  missingOffServerCount: show.missingOffServerCount ?? 0,
                  airedEpisodesCount: show.airedEpisodesCount ?? null,
                  nextAirAt: show.nextAirAt ?? null,
                  isCaughtUpOnPlex: false,
                  seriesStatus: show.seriesStatus ?? null,
                  mediaCategory: show.category === 'anime' ? 'anime' : 'tv',
                  firstCompletedAt: show.lastCompletedWatchedAt || (show.allCompletedPlays[show.allCompletedPlays.length - 1]?.watchedAt ?? null),
                  latestWatchedAt: show.latestWatchedAt || (show.allCompletedPlays[show.allCompletedPlays.length - 1]?.watchedAt ?? null),
                  firstCompletedEpisodeTitle: show.firstCompletedEpisodeTitle ?? null,
                  firstCompletedEpisodeSeason: show.firstCompletedEpisodeSeason ?? null,
                  firstCompletedEpisodeNumber: show.firstCompletedEpisodeNumber ?? null,
                  nextTierProgress,
                  episodeReplayDetails: epList
                }
              },
              state: 'earned',
              progress: {
                current: show.completedEpisodeKeys.size,
                target: show.totalEpisodes,
                unit: 'episode'
              },
              earnedAt: show.lastCompletedWatchedAt || (show.allCompletedPlays[show.allCompletedPlays.length - 1]?.watchedAt ?? new Date().toISOString()),
              supportingEvidence: show.allCompletedPlays.slice(0, 10).map((p) => ({
                kind: p.sourceKind,
                id: p.id,
                eventTime: p.watchedAt,
                title: p.title
              })),
              reason: `Completed all ${show.totalEpisodes} episodes of ${show.showTitle}`
            });
          } else {
            const isCaughtUp = show.isCaughtUpOnPlex ?? (show.availableOnPlex != null && show.completedEpisodeKeys.size >= show.availableOnPlex);
            const epList = show.episodeReplayDetails ?? [];
            const targetCount = show.totalEpisodes || (show.availableOnPlex ?? 0);
            const watchedCount = show.completedEpisodeKeys.size;
            const remainingCount = Math.max(0, targetCount - watchedCount);
            const percentComplete = targetCount > 0 ? Math.min(100, Math.round((watchedCount / targetCount) * 100)) : 0;
            const missingCount = show.missingOffServerCount ?? 0;
            const airedCount = show.airedEpisodesCount ?? null;
            const unairedCount = airedCount != null ? Math.max(0, targetCount - airedCount) : 0;

            const nextTierProgress: NextTierProgress = {
              currentTier: 'bronze',
              nextTier: 'bronze',
              nextTierName: 'Bronze (100% Completion)',
              rewatchedCount: watchedCount,
              targetCount,
              remainingCount,
              percentComplete
            };

            let progressDescription = `Watched ${watchedCount} of ${show.totalEpisodes} episodes of ${show.showTitle} (${Math.round((watchedCount / show.totalEpisodes) * 100)}%).`;
            if (isCaughtUp) {
              if (missingCount === 0 && unairedCount > 0 && airedCount != null) {
                progressDescription = `Caught up on broadcast (${watchedCount} of ${airedCount} aired on Plex; ${unairedCount} upcoming in season). Series trophy unlocks once all ${show.totalEpisodes} episodes air and are completed.`;
              } else {
                progressDescription = `Caught up on Plex (${watchedCount} of ${show.availableOnPlex} available; ${missingCount} off-server). Series trophy locked until full series is acquired and completed.`;
              }
            } else if (airedCount != null && airedCount < show.totalEpisodes && show.availableOnPlex != null) {
              progressDescription = `Watched ${watchedCount} of ${show.availableOnPlex} available on Plex (${airedCount} of ${show.totalEpisodes} aired to date; ${unairedCount} upcoming).`;
            }

            results.push({
              userId: subject.userId,
              ruleId: dynamicRuleId,
              version: 1,
              facet: 'trophy_shelf',
              badge: {
                badgeKey: `show_mastery_${show.grandparentRatingKey}`,
                tier: 'bronze',
                title: `Series Progress: ${show.showTitle}`,
                description: progressDescription,
                posterUrl: show.posterUrl,
                iconHint: show.category === 'anime' ? 'anime' : 'series',
                stats: {
                  totalPlays: show.allCompletedPlays.length,
                  completedItems: show.completedEpisodeKeys.size,
                  rewatchCount: 0,
                  availableOnPlex: show.availableOnPlex ?? null,
                  missingOffServerCount: missingCount,
                  airedEpisodesCount: airedCount,
                  nextAirAt: show.nextAirAt ?? null,
                  isCaughtUpOnPlex: isCaughtUp,
                  seriesStatus: show.seriesStatus ?? null,
                  mediaCategory: show.category === 'anime' ? 'anime' : 'tv',
                  latestWatchedAt: show.latestWatchedAt || (show.allCompletedPlays[show.allCompletedPlays.length - 1]?.watchedAt ?? null),
                  nextTierProgress,
                  episodeReplayDetails: epList
                }
              },
              state: 'in_progress',
              progress: {
                current: show.completedEpisodeKeys.size,
                target: show.totalEpisodes,
                unit: 'episode'
              },
              earnedAt: null,
              supportingEvidence: show.allCompletedPlays.slice(0, 10).map((p) => ({
                kind: p.sourceKind,
                id: p.id,
                eventTime: p.watchedAt,
                title: p.title
              })),
              reason: isCaughtUp
                ? (missingCount === 0 && unairedCount > 0 && airedCount != null
                    ? `Caught up on broadcast (${watchedCount}/${airedCount} aired on Plex; ${unairedCount} upcoming)`
                    : `Caught up on Plex (${watchedCount}/${show.availableOnPlex} eps); ${missingCount} off-server`)
                : `${watchedCount} of ${show.totalEpisodes} episodes completed`
            });
          }
        }
      }
    }
  }

  // Dynamic Trophy Shelf: Audiobooks (Book Mastery & In-Progress)
  if (subject.audiobookProgress) {
    for (const book of subject.audiobookProgress.values()) {
      const dynamicRuleId = `book_mastery_${book.audiobookId}`;
      if (results.some((r) => r.ruleId === dynamicRuleId)) continue;

      const isComplete = book.isCompleted;
      const rewatchCount = book.relistenCount;
      let tier: BadgeTier = 'bronze';
      let rewatchSuffix = '';
      let rewatchDesc = '';

      if (rewatchCount >= 3) {
        tier = 'platinum';
        rewatchSuffix = ' (4x+)';
        rewatchDesc = ` Re-listened ${rewatchCount} times.`;
      } else if (rewatchCount === 2) {
        tier = 'gold';
        rewatchSuffix = ' (3x)';
        rewatchDesc = ' Re-listened 2 times.';
      } else if (rewatchCount === 1) {
        tier = 'silver';
        rewatchSuffix = ' (2x)';
        rewatchDesc = ' Re-listened once.';
      }

      const totalHours = Math.round((book.totalDurationSeconds / 3600) * 10) / 10;
      const listenedHours = Math.round((book.viewOffsetSeconds / 3600) * 10) / 10;

      if (isComplete) {
        results.push({
          userId: subject.userId,
          ruleId: dynamicRuleId,
          version: 1,
          facet: 'trophy_shelf',
          badge: {
            badgeKey: `book_mastery_${book.audiobookId}`,
            tier,
            title: `Book Mastery: ${book.title}${rewatchSuffix}`,
            description: `Completed 100% of ${book.title}.${rewatchDesc}`,
            posterUrl: book.posterUrl,
            iconHint: 'audiobook',
            stats: {
              totalHours,
              totalPlays: 1 + rewatchCount,
              completedItems: 1,
              rewatchCount,
              mediaCategory: 'audiobook',
              audiobookId: book.audiobookId,
              authors: book.authors,
              seriesTitle: book.seriesTitle,
              seriesIndex: book.seriesIndex,
              totalDurationSeconds: book.totalDurationSeconds,
              viewOffsetSeconds: book.viewOffsetSeconds,
              percentComplete: 100,
              chapterCount: book.chapterCount,
              latestWatchedAt: book.latestWatchedAt,
              firstCompletedAt: book.firstCompletedAt
            }
          },
          state: 'earned',
          progress: {
            current: book.totalDurationSeconds,
            target: book.totalDurationSeconds,
            unit: 'second' as any
          },
          earnedAt: book.firstCompletedAt || book.latestWatchedAt || new Date().toISOString(),
          supportingEvidence: [],
          reason: `Completed 100% of audiobook ${book.title}`
        });
      } else {
        results.push({
          userId: subject.userId,
          ruleId: dynamicRuleId,
          version: 1,
          facet: 'trophy_shelf',
          badge: {
            badgeKey: `book_mastery_${book.audiobookId}`,
            tier: 'bronze',
            title: `Audiobook Progress: ${book.title}`,
            description: `Listened to ${listenedHours} of ${totalHours} hrs (${book.percentComplete}%).`,
            posterUrl: book.posterUrl,
            iconHint: 'audiobook',
            stats: {
              totalHours,
              totalPlays: 1,
              completedItems: 0,
              rewatchCount: 0,
              mediaCategory: 'audiobook',
              audiobookId: book.audiobookId,
              authors: book.authors,
              seriesTitle: book.seriesTitle,
              seriesIndex: book.seriesIndex,
              totalDurationSeconds: book.totalDurationSeconds,
              viewOffsetSeconds: book.viewOffsetSeconds,
              percentComplete: book.percentComplete,
              chapterCount: book.chapterCount,
              latestWatchedAt: book.latestWatchedAt
            }
          },
          state: 'in_progress',
          progress: {
            current: book.viewOffsetSeconds,
            target: book.totalDurationSeconds,
            unit: 'second' as any
          },
          earnedAt: null,
          supportingEvidence: [],
          reason: `Listened to ${book.percentComplete}% of ${book.title}`
        });
      }
    }
  }

  // Dynamic Trophy Shelf: Movie Franchises (Franchise Mastery & Progress)
  if (subject.movieCollectionProgress) {
    for (const col of subject.movieCollectionProgress.values()) {
      const dynamicRuleId = `collection_mastery_${col.collectionKey}`;
      if (results.some((r) => r.ruleId === dynamicRuleId)) continue;

      const isComplete = col.completedFilmKeys.size >= col.totalFilms && col.missingOffServerCount === 0;
      const isCaughtUp = !isComplete && col.availableOnPlex > 0 && col.completedFilmKeys.size >= col.availableOnPlex;
      const percentComplete = col.totalFilms > 0 ? Math.round((col.completedFilmKeys.size / col.totalFilms) * 100) : 0;

      if (isComplete) {
        results.push({
          userId: subject.userId,
          ruleId: dynamicRuleId,
          version: 1,
          facet: 'trophy_shelf',
          badge: {
            badgeKey: `collection_mastery_${col.collectionKey}`,
            tier: 'bronze',
            title: `Franchise Mastery: ${col.collectionTitle}`,
            description: `Completed all ${col.totalFilms} films in the ${col.collectionTitle}.`,
            posterUrl: col.posterUrl,
            iconHint: 'movie',
            stats: {
              totalPlays: col.allCompletedPlays.length,
              completedItems: col.completedFilmKeys.size,
              rewatchCount: 0,
              availableOnPlex: col.availableOnPlex,
              missingOffServerCount: 0,
              isCaughtUpOnPlex: false,
              mediaCategory: 'movie_collection',
              collectionKey: col.collectionKey,
              collectionFilms: col.filmDetails,
              latestWatchedAt: col.latestWatchedAt,
              firstCompletedAt: col.latestWatchedAt
            }
          },
          state: 'earned',
          progress: {
            current: col.completedFilmKeys.size,
            target: col.totalFilms,
            unit: 'movie'
          },
          earnedAt: col.latestWatchedAt || new Date().toISOString(),
          supportingEvidence: col.allCompletedPlays.slice(0, 10).map((p) => ({
            kind: p.sourceKind,
            id: p.id,
            eventTime: p.watchedAt,
            title: p.title
          })),
          reason: `Completed all ${col.totalFilms} films in ${col.collectionTitle}`
        });
      } else {
        let desc = `Watched ${col.completedFilmKeys.size} of ${col.totalFilms} films in ${col.collectionTitle} (${percentComplete}%).`;
        if (isCaughtUp) {
          desc = `Caught up on Plex (${col.completedFilmKeys.size} of ${col.availableOnPlex} available; ${col.missingOffServerCount} off-server). Franchise trophy locked until full collection is acquired.`;
        }

        results.push({
          userId: subject.userId,
          ruleId: dynamicRuleId,
          version: 1,
          facet: 'trophy_shelf',
          badge: {
            badgeKey: `collection_mastery_${col.collectionKey}`,
            tier: 'bronze',
            title: `Franchise Progress: ${col.collectionTitle}`,
            description: desc,
            posterUrl: col.posterUrl,
            iconHint: 'movie',
            stats: {
              totalPlays: col.allCompletedPlays.length,
              completedItems: col.completedFilmKeys.size,
              rewatchCount: 0,
              availableOnPlex: col.availableOnPlex,
              missingOffServerCount: col.missingOffServerCount,
              isCaughtUpOnPlex: isCaughtUp,
              mediaCategory: 'movie_collection',
              collectionKey: col.collectionKey,
              collectionFilms: col.filmDetails,
              latestWatchedAt: col.latestWatchedAt
            }
          },
          state: 'in_progress',
          progress: {
            current: col.completedFilmKeys.size,
            target: col.totalFilms,
            unit: 'movie'
          },
          earnedAt: null,
          supportingEvidence: col.allCompletedPlays.slice(0, 10).map((p) => ({
            kind: p.sourceKind,
            id: p.id,
            eventTime: p.watchedAt,
            title: p.title
          })),
          reason: isCaughtUp ? 'Caught up on available Plex films' : `${col.completedFilmKeys.size} of ${col.totalFilms} films completed`
        });
      }
    }
  }

  // Dynamic Trophy Shelf: Movie Favorites (Rewatched 2x+ across distinct sessions)
  if (subject.movieReplayProgress) {
    for (const movie of subject.movieReplayProgress.values()) {
      const dynamicRuleId = `movie_favorite_${movie.ratingKey}`;
      if (results.some((r) => r.ruleId === dynamicRuleId)) continue;

      const rep = movie.replayCount;
      let tier: BadgeTier = 'silver';
      let nextTier: BadgeTier | null = 'gold';
      let nextTierName: string | null = 'Gold (3x Replay)';
      let suffix = ' (2x)';

      if (rep >= 3) {
        tier = 'platinum';
        nextTier = null;
        nextTierName = null;
        suffix = ` (${rep + 1}x+)`;
      } else if (rep === 2) {
        tier = 'gold';
        nextTier = 'platinum';
        nextTierName = 'Platinum (4x+ Replay)';
        suffix = ' (3x)';
      }

      results.push({
        userId: subject.userId,
        ruleId: dynamicRuleId,
        version: 1,
        facet: 'trophy_shelf',
        badge: {
          badgeKey: `movie_favorite_${movie.ratingKey}`,
          tier,
          title: `Movie Favorite: ${movie.title}${suffix}`,
          description: `Rewatched ${rep} time${rep > 1 ? 's' : ''} across distinct viewing sessions.`,
          posterUrl: movie.posterUrl,
          iconHint: 'movie',
          stats: {
            totalPlays: movie.playCount,
            completedItems: 1,
            rewatchCount: rep,
            mediaCategory: 'movie',
            latestWatchedAt: movie.latestWatchedAt,
            firstCompletedAt: movie.firstWatchedAt,
            lastCompletedWatchedAt: movie.lastCompletedWatchedAt || movie.latestWatchedAt,
            nextTierProgress: nextTier ? {
              currentTier: tier,
              nextTier,
              nextTierName,
              rewatchedCount: rep,
              targetCount: rep + 1,
              remainingCount: 1,
              percentComplete: Math.round((rep / (rep + 1)) * 100)
            } : null
          }
        },
        state: 'earned',
        progress: {
          current: movie.playCount,
          target: movie.playCount,
          unit: 'movie'
        },
        earnedAt: movie.lastCompletedWatchedAt || movie.latestWatchedAt || new Date().toISOString(),
        supportingEvidence: movie.allCompletedPlays.slice(0, 10).map((p) => ({
          kind: p.sourceKind,
          id: p.id,
          eventTime: p.watchedAt,
          title: p.title
        })),
        reason: `Rewatched ${rep} times across distinct viewing sessions`
      });
    }
  }

  // Dynamic Trophy Shelf: In-Progress Movies
  if (subject.movieProgress) {
    for (const movie of subject.movieProgress.values()) {
      const dynamicRuleId = `movie_progress_${movie.ratingKey}`;
      if (results.some((r) => r.ruleId === dynamicRuleId)) continue;

      const totalHours = Math.round((movie.totalDurationSeconds / 3600) * 10) / 10;
      const watchedHours = Math.round((movie.viewOffsetSeconds / 3600) * 10) / 10;

      results.push({
        userId: subject.userId,
        ruleId: dynamicRuleId,
        version: 1,
        facet: 'trophy_shelf',
        badge: {
          badgeKey: `movie_progress_${movie.ratingKey}`,
          tier: 'bronze',
          title: `Movie Progress: ${movie.title}`,
          description: `Watched ${watchedHours} of ${totalHours} hrs (${movie.percentComplete}%).`,
          posterUrl: movie.posterUrl,
          iconHint: 'movie',
          stats: {
            totalHours,
            totalPlays: 1,
            completedItems: 0,
            rewatchCount: 0,
            mediaCategory: 'movie',
            totalDurationSeconds: movie.totalDurationSeconds,
            viewOffsetSeconds: movie.viewOffsetSeconds,
            percentComplete: movie.percentComplete,
            latestWatchedAt: movie.latestWatchedAt
          }
        },
        state: 'in_progress',
        progress: {
          current: movie.viewOffsetSeconds,
          target: movie.totalDurationSeconds,
          unit: 'hour'
        },
        earnedAt: null,
        supportingEvidence: movie.latestWatchedAt ? [{
          kind: 'playback_observation',
          id: 0,
          eventTime: movie.latestWatchedAt,
          title: movie.title
        }] : [],
        reason: `Watched ${movie.percentComplete}% of ${movie.title}`
      });
    }
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
  const isAudiobookPlay = rule.scope?.category === 'audiobook' && rule.unit === 'play';
  const matchingPlays = subject.plays
    .filter((play) => (isAudiobookPlay ? play.category === 'audiobook' : play.completed))
    .filter((play) => !rule.scope?.category || play.category === rule.scope.category)
    .filter(
      (play) =>
        !rule.scope?.genre ||
        (play.genres && play.genres.some((g) => g.toLowerCase() === rule.scope!.genre!.toLowerCase()))
    )
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
  // 1. Evidence requirements check: unknown denominator
  if (rule.evidenceRequirements?.requiresKnownDenominator && subject.hasUnknownDenominator) {
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'unknown',
      progress: { current: 0, target: rule.threshold, unit: rule.unit },
      earnedAt: null,
      supportingEvidence: [],
      reason: 'Denominator is unverified or unknown'
    };
  }

  // 2. Ambiguous identity check
  const ambiguousPlay = subject.plays.find(
    (p) =>
      (!rule.scope?.category || p.category === rule.scope.category) &&
      (!p.ratingKey || p.ratingKey.includes('ambiguous'))
  );
  if (ambiguousPlay) {
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'blocked',
      progress: { current: 0, target: rule.threshold, unit: rule.unit },
      earnedAt: null,
      supportingEvidence: [],
      reason: 'Blocked by ambiguous or unverified media identity'
    };
  }

  // 3. Audiobook books milestone: NEVER count individual track observations as books
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

  // Filter matching plays for this rule
  const matchingPlays = subject.plays.filter((play) => {
    if (!play.completed) return false;
    if (rule.scope?.category && play.category !== rule.scope.category) return false;
    if (
      rule.scope?.genre &&
      (!play.genres || !play.genres.some((g) => g.toLowerCase() === rule.scope!.genre!.toLowerCase()))
    ) {
      return false;
    }
    return true;
  });

  // Calculate duration and flavor stats
  let totalDurationSec = 0;
  for (const play of matchingPlays) {
    totalDurationSec += play.durationSeconds ?? 0;
  }
  if (rule.scope?.category === 'audiobook' && subject.totalAudiobookSeconds) {
    totalDurationSec = Math.max(totalDurationSec, subject.totalAudiobookSeconds);
  }
  const totalHours = Math.round((totalDurationSec / 3600) * 10) / 10;

  // 4. Hour-based milestones
  if (rule.unit === 'hour') {
    const earned = totalHours >= rule.threshold;
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: {
        ...rule.badge,
        stats: {
          totalHours,
          totalPlays: matchingPlays.length,
          completedItems: new Set(matchingPlays.map((p) => p.ratingKey)).size
        }
      },
      state: earned ? 'earned' : totalHours > 0 ? 'in_progress' : 'not_earned',
      progress: { current: totalHours, target: rule.threshold, unit: rule.unit },
      earnedAt: earned ? matchingPlays[matchingPlays.length - 1]?.watchedAt ?? null : null,
      supportingEvidence: matchingPlays.slice(0, 10).map((p) => ({
        kind: p.sourceKind,
        id: p.id,
        eventTime: p.watchedAt,
        title: p.title
      })),
      reason: earned
        ? `Logged ${totalHours} hours`
        : `${totalHours} of ${rule.threshold} hours logged`
    };
  }

  // 5. Distinct item milestones (movies, episodes, etc.)
  const distinctPlaysByRatingKey = new Map<string, typeof subject.plays[0]>();
  for (const play of matchingPlays) {
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

  const badgeWithStats = {
    ...rule.badge,
    stats: {
      totalHours,
      totalPlays: matchingPlays.length,
      completedItems: count
    }
  };

  return {
    userId: subject.userId,
    ruleId: rule.ruleId,
    version: rule.version,
    badge: badgeWithStats,
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

  // Case A: specific show requested by rule.scope?.seriesId
  if (rule.scope?.seriesId) {
    const show = subject.showProgress?.get(rule.scope.seriesId);
    if (!show) {
      return {
        userId: subject.userId,
        ruleId: rule.ruleId,
        version: rule.version,
        badge: rule.badge,
        state: 'not_earned',
        progress: { current: 0, target: rule.threshold, unit: rule.unit },
        earnedAt: null,
        supportingEvidence: [],
        reason: `No activity found for series '${rule.scope.seriesId}'`
      };
    }

    if (show.totalEpisodes === null) {
      return {
        userId: subject.userId,
        ruleId: rule.ruleId,
        version: rule.version,
        badge: { ...rule.badge, posterUrl: show.posterUrl },
        state: 'unknown',
        progress: { current: show.completedEpisodeKeys.size, target: rule.threshold, unit: rule.unit },
        earnedAt: null,
        supportingEvidence: [],
        reason: 'Unknown denominator or missing show catalog prevents completion evaluation'
      };
    }

    const current = show.completedEpisodeKeys.size;
    const target = show.totalEpisodes;
    const earned = current >= target && show.lastCompletedWatchedAt !== null;

    let minReplay = 0;
    if (show.completedEpisodeKeys.size > 0) {
      const replays = [...show.completedEpisodeKeys].map((k) => show.replaysByEpisode.get(k) ?? 0);
      minReplay = Math.min(...replays);
    }
    const avgReplay = Math.floor(show.allCompletedPlays.length / show.totalEpisodes) - 1;
    const rewatchCount = Math.max(0, Math.max(minReplay, avgReplay));

    let tier: BadgeTier = rule.badge.tier;
    let rewatchSuffix = '';
    if (rewatchCount >= 3) {
      tier = 'platinum';
      rewatchSuffix = ' (4x+)';
    } else if (rewatchCount === 2) {
      tier = 'gold';
      rewatchSuffix = ' (3x)';
    } else if (rewatchCount === 1) {
      tier = 'silver';
      rewatchSuffix = ' (2x)';
    }

    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: {
        ...rule.badge,
        tier,
        title: `${rule.badge.title}${rewatchSuffix}`,
        posterUrl: show.posterUrl,
        stats: {
          totalPlays: show.allCompletedPlays.length,
          completedItems: current,
          rewatchCount
        }
      },
      state: earned ? 'earned' : current > 0 ? 'in_progress' : 'not_earned',
      progress: { current, target, unit: rule.unit },
      earnedAt: earned ? show.lastCompletedWatchedAt : null,
      supportingEvidence: show.allCompletedPlays.slice(0, 10).map((p) => ({
        kind: p.sourceKind,
        id: p.id,
        eventTime: p.watchedAt,
        title: p.title
      })),
      reason: earned
        ? `Completed all ${show.totalEpisodes} episodes of ${show.showTitle}`
        : `${current} of ${show.totalEpisodes} episodes completed`
    };
  }

  // Case B: General series completion threshold (e.g. show_mastery_first, show_mastery_5)
  const completedShows: ShowProgressEvidence[] = [];
  let hasUnknownShow = false;

  if (subject.showProgress) {
    for (const show of subject.showProgress.values()) {
      if (show.totalEpisodes === null) {
        hasUnknownShow = true;
      } else if (show.completedEpisodeKeys.size >= show.totalEpisodes && show.lastCompletedWatchedAt !== null) {
        completedShows.push(show);
      }
    }
  }

  const count = completedShows.length;
  const earned = count >= rule.threshold;

  if (earned) {
    completedShows.sort((a, b) => {
      if (!a.lastCompletedWatchedAt && !b.lastCompletedWatchedAt) return 0;
      if (!a.lastCompletedWatchedAt) return 1;
      if (!b.lastCompletedWatchedAt) return -1;
      return a.lastCompletedWatchedAt.localeCompare(b.lastCompletedWatchedAt);
    });

    const crossing = completedShows[rule.threshold - 1];
    const earnedAt = crossing?.lastCompletedWatchedAt ?? null;
    const supporting: SupportingEvidenceRef[] = [];
    for (const s of completedShows.slice(0, rule.threshold)) {
      supporting.push(...s.allCompletedPlays.slice(0, 5).map((p: CanonicalPlay) => ({
        kind: p.sourceKind,
        id: p.id,
        eventTime: p.watchedAt,
        title: p.title
      })));
    }

    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'earned',
      progress: { current: count, target: rule.threshold, unit: rule.unit },
      earnedAt,
      supportingEvidence: supporting.slice(0, 10),
      reason: `Completed ${count} series`
    };
  }

  if (count > 0) {
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      badge: rule.badge,
      state: 'in_progress',
      progress: { current: count, target: rule.threshold, unit: rule.unit },
      earnedAt: null,
      supportingEvidence: [],
      reason: `${count} of ${rule.threshold} series completed`
    };
  }

  if (hasUnknownShow && (subject.hasUnknownDenominator || rule.evidenceRequirements?.requiresKnownDenominator)) {
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

function evaluateObsessionSpotlight(
  rule: AchievementRule,
  subject: SubjectEvidence
): AchievementResult {
  const showMap = new Map<
    string,
    { title: string; category: string; durationSeconds: number; plays: CanonicalPlay[]; ratingKeys: Set<string> }
  >();

  for (const play of subject.plays) {
    if (play.category === 'movie' || play.category === 'audiobook') continue;
    const showTitle = play.showTitle || play.title;
    if (!showTitle) continue;
    const entry = showMap.get(showTitle) ?? {
      title: showTitle,
      category: play.category,
      durationSeconds: 0,
      plays: [],
      ratingKeys: new Set<string>()
    };
    entry.durationSeconds += play.durationSeconds ?? 0;
    entry.plays.push(play);
    entry.ratingKeys.add(play.ratingKey);
    showMap.set(showTitle, entry);
  }

  if (subject.audiobookProgress) {
    for (const book of subject.audiobookProgress.values()) {
      if (book.viewOffsetSeconds > 0) {
        showMap.set(book.title, {
          title: book.title,
          category: 'audiobook',
          durationSeconds: book.viewOffsetSeconds,
          plays: [],
          ratingKeys: new Set([String(book.audiobookId)])
        });
      }
    }
  }

  if (subject.movieCollectionProgress) {
    for (const col of subject.movieCollectionProgress.values()) {
      let franchiseDuration = 0;
      for (const play of col.allCompletedPlays) {
        franchiseDuration += play.durationSeconds ?? 0;
      }
      if (franchiseDuration > 0) {
        showMap.set(col.collectionTitle, {
          title: col.collectionTitle,
          category: 'movie_collection',
          durationSeconds: franchiseDuration,
          plays: col.allCompletedPlays,
          ratingKeys: new Set(col.completedFilmKeys)
        });
      }
    }
  }

  if (subject.movieReplayProgress) {
    for (const movie of subject.movieReplayProgress.values()) {
      let movieDuration = 0;
      for (const play of movie.allCompletedPlays) {
        movieDuration += play.durationSeconds ?? 0;
      }
      if (movieDuration > 0 && !showMap.has(movie.title)) {
        showMap.set(movie.title, {
          title: movie.title,
          category: 'movie',
          durationSeconds: movieDuration,
          plays: movie.allCompletedPlays,
          ratingKeys: new Set([movie.ratingKey])
        });
      }
    }
  }

  const shows = [...showMap.values()].sort(
    (a, b) => b.durationSeconds - a.durationSeconds || b.plays.length - a.plays.length
  );

  const topShow = shows[0];
  const runnerUp = shows[1];
  if (!topShow) {
    return {
      userId: subject.userId,
      ruleId: rule.ruleId,
      version: rule.version,
      facet: 'obsession_spotlight',
      badge: rule.badge,
      state: 'not_earned',
      progress: { current: 0, target: rule.threshold, unit: 'hour' },
      earnedAt: null,
      supportingEvidence: [],
      reason: 'No playback recorded'
    };
  }

  const topHours = Math.round((topShow.durationSeconds / 3600) * 10) / 10;
  const runnerUpHours = runnerUp ? Math.round((runnerUp.durationSeconds / 3600) * 10) / 10 : undefined;
  const earned = topHours >= rule.threshold;

  const categoryLabel = topShow.category === 'audiobook'
    ? 'Audiobook'
    : topShow.category === 'movie_collection'
      ? 'Franchise'
      : topShow.category === 'movie'
        ? 'Movie'
        : 'Series';

  const unitLabel = topShow.category === 'audiobook'
    ? 'listening to'
    : topShow.category === 'movie_collection'
      ? `across ${topShow.ratingKeys.size} films of`
      : topShow.category === 'movie'
        ? `across ${topShow.plays.length} viewings of`
        : `across ${topShow.plays.length} episodes of`;

  const runnerUpSuffix = runnerUp
    ? ` Runner-up: ${runnerUp.title} (${runnerUpHours} hours).`
    : '';

  return {
    userId: subject.userId,
    ruleId: rule.ruleId,
    version: rule.version,
    facet: 'obsession_spotlight',
    badge: {
      ...rule.badge,
      title: `${categoryLabel} Obsession: ${topShow.title}`,
      description: `Logged ${topHours} hours ${unitLabel} ${topShow.title}.${runnerUpSuffix}`,
      stats: {
        totalHours: topHours,
        totalPlays: topShow.plays.length || topShow.ratingKeys.size,
        completedItems: topShow.ratingKeys.size,
        topTitle: topShow.title,
        runnerUpTitle: runnerUp?.title,
        runnerUpHours,
        runnerUpPlays: runnerUp?.plays.length,
        mediaCategory: topShow.category as any
      }
    },
    state: earned ? 'earned' : topHours > 0 ? 'in_progress' : 'not_earned',
    progress: { current: topHours, target: rule.threshold, unit: 'hour' },
    earnedAt: earned ? topShow.plays[topShow.plays.length - 1]?.watchedAt ?? null : null,
    supportingEvidence: topShow.plays.slice(0, 10).map((p) => ({
      kind: p.sourceKind,
      id: p.id,
      eventTime: p.watchedAt,
      title: p.title
    })),
    reason: earned
      ? `Most dedicated media is ${topShow.title} with ${topHours} hours logged`
      : `${topShow.title} has ${topHours} of ${rule.threshold} hours logged`
  };
}

