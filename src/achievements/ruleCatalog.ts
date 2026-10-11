/**
 * Canonical Achievements Rule Catalog.
 *
 * Implements Block 3-6-6C production rules:
 * - Volume Milestones (movie, tv, anime, audiobook)
 * - Taste & Genre Affinity (anime devotion, sci-fi explorer, cinephile)
 * - Obsession Spotlight (#1 most-watched show by hours)
 */

import type { AchievementRule } from './types.js';

export const DEFAULT_ACHIEVEMENT_RULES: AchievementRule[] = [
  // --- First Watch Rules (Trophy Shelf) ---
  {
    ruleId: 'movie_first_watch',
    version: 1,
    family: 'first_watch',
    unit: 'movie',
    threshold: 1,
    scope: { category: 'movie' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'first_movie',
      tier: 'bronze',
      title: 'First Feature',
      description: 'Watched your first movie in the catalog.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'tv_first_watch',
    version: 1,
    family: 'first_watch',
    unit: 'episode',
    threshold: 1,
    scope: { category: 'tv' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'first_tv',
      tier: 'bronze',
      title: 'Pilot Premiere',
      description: 'Watched your first TV episode.',
      iconHint: 'tv'
    }
  },
  {
    ruleId: 'anime_first_watch',
    version: 1,
    family: 'first_watch',
    unit: 'episode',
    threshold: 1,
    scope: { category: 'anime' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'first_anime',
      tier: 'bronze',
      title: 'First Encounter',
      description: 'Watched your first anime episode.',
      iconHint: 'anime'
    }
  },
  {
    ruleId: 'audiobook_first_watch',
    version: 1,
    family: 'first_watch',
    unit: 'play',
    threshold: 1,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'first_audiobook',
      tier: 'bronze',
      title: 'Opening Chapter',
      description: 'Listened to your first audiobook session.',
      iconHint: 'audiobook'
    }
  },

  // --- Volume Milestones (Trophy Shelf) ---
  {
    ruleId: 'movie_count_10',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 10,
    scope: { category: 'movie' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'movie_10',
      tier: 'bronze',
      title: 'Movie Night Regular',
      description: 'Watched 10 distinct movies.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'movie_count_50',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 50,
    scope: { category: 'movie' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'movie_50',
      tier: 'silver',
      title: 'Cinema Connoisseur',
      description: 'Watched 50 distinct movies.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'tv_count_25',
    version: 1,
    family: 'watch_count',
    unit: 'episode',
    threshold: 25,
    scope: { category: 'tv' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'tv_25',
      tier: 'bronze',
      title: 'Season Regular',
      description: 'Watched 25 TV episodes.',
      iconHint: 'tv'
    }
  },
  {
    ruleId: 'tv_count_100',
    version: 1,
    family: 'watch_count',
    unit: 'episode',
    threshold: 100,
    scope: { category: 'tv' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'tv_100',
      tier: 'silver',
      title: 'Binge Apprentice',
      description: 'Watched 100 TV episodes.',
      iconHint: 'tv'
    }
  },
  {
    ruleId: 'anime_count_25',
    version: 1,
    family: 'watch_count',
    unit: 'episode',
    threshold: 25,
    scope: { category: 'anime' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'anime_25',
      tier: 'bronze',
      title: 'Anime Initiate',
      description: 'Watched 25 anime episodes.',
      iconHint: 'anime'
    }
  },
  {
    ruleId: 'anime_count_100',
    version: 1,
    family: 'watch_count',
    unit: 'episode',
    threshold: 100,
    scope: { category: 'anime' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'anime_100',
      tier: 'silver',
      title: 'Anime Enthusiast',
      description: 'Watched 100 anime episodes.',
      iconHint: 'anime'
    }
  },
  {
    ruleId: 'audiobook_count_1',
    version: 1,
    family: 'watch_count',
    unit: 'audiobook_book',
    threshold: 1,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'audiobook_book_1',
      tier: 'bronze',
      title: 'Cover to Cover',
      description: 'Completed your first full audiobook book.',
      iconHint: 'audiobook'
    }
  },
  {
    ruleId: 'audiobook_count_5',
    version: 1,
    family: 'watch_count',
    unit: 'audiobook_book',
    threshold: 5,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'audiobook_book_5',
      tier: 'silver',
      title: 'Avid Listener',
      description: 'Completed 5 full audiobook books.',
      iconHint: 'audiobook'
    }
  },

  // --- Taste & Genre Affinity (Personal Devotion) ---
  {
    ruleId: 'taste_anime_devotee',
    version: 1,
    family: 'watch_count',
    unit: 'episode',
    threshold: 50,
    scope: { category: 'anime' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'anime_devotee',
      tier: 'silver',
      title: 'Anime Devotee',
      description: 'Dedicated over 50 episodes to anime series.',
      iconHint: 'anime'
    }
  },
  {
    ruleId: 'taste_scifi_explorer',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 5,
    scope: { category: 'movie', genre: 'Science Fiction' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'scifi_explorer',
      tier: 'bronze',
      title: 'Sci-Fi Explorer',
      description: 'Journeyed through 5 science fiction films.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'taste_cinephile',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 25,
    scope: { category: 'movie' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'cinephile_devotion',
      tier: 'silver',
      title: 'Cinephile Devotion',
      description: 'Explored 25 distinct cinematic features.',
      iconHint: 'movie'
    }
  },

  // --- Obsession Spotlight ---
  {
    ruleId: 'obsession_top_series',
    version: 1,
    family: 'obsession_spotlight',
    unit: 'hour',
    threshold: 10,
    facet: 'obsession_spotlight',
    badge: {
      badgeKey: 'obsession_top_series',
      tier: 'gold',
      title: 'Series Obsession',
      description: 'Dedicated more than 10 hours to a single favorite series.',
      iconHint: 'tv'
    }
  }
];
