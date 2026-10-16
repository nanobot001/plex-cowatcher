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
  {
    ruleId: 'audiobook_count_10',
    version: 1,
    family: 'watch_count',
    unit: 'audiobook_book',
    threshold: 10,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'audiobook_book_10',
      tier: 'gold',
      title: 'Chapter & Verse',
      description: 'Completed 10 full audiobook books.',
      iconHint: 'audiobook'
    }
  },
  {
    ruleId: 'audiobook_count_25',
    version: 1,
    family: 'watch_count',
    unit: 'audiobook_book',
    threshold: 25,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'audiobook_book_25',
      tier: 'platinum',
      title: 'Walking Library',
      description: 'Completed 25 full audiobook books.',
      iconHint: 'audiobook'
    }
  },
  {
    ruleId: 'audiobook_hours_25',
    version: 1,
    family: 'watch_count',
    unit: 'hour',
    threshold: 25,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'audiobook_hours_25',
      tier: 'bronze',
      title: 'Attentive Ear',
      description: 'Listened to 25 hours of audiobooks.',
      iconHint: 'audiobook'
    }
  },
  {
    ruleId: 'audiobook_hours_100',
    version: 1,
    family: 'watch_count',
    unit: 'hour',
    threshold: 100,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'audiobook_hours_100',
      tier: 'silver',
      title: 'Centurion Listener',
      description: 'Listened to 100 hours of audiobooks.',
      iconHint: 'audiobook'
    }
  },
  {
    ruleId: 'audiobook_hours_250',
    version: 1,
    family: 'watch_count',
    unit: 'hour',
    threshold: 250,
    scope: { category: 'audiobook' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'audiobook_hours_250',
      tier: 'gold',
      title: 'Audiobook Voyager',
      description: 'Listened to 250 hours of audiobooks.',
      iconHint: 'audiobook'
    }
  },
  {
    ruleId: 'movie_count_100',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 100,
    scope: { category: 'movie' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'movie_100',
      tier: 'gold',
      title: 'Centurion Cinephile',
      description: 'Watched 100 distinct movies.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'movie_count_250',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 250,
    scope: { category: 'movie' },
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'movie_250',
      tier: 'platinum',
      title: 'Silver Screen Master',
      description: 'Watched 250 distinct movies.',
      iconHint: 'movie'
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
    ruleId: 'taste_scifi_voyager',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 15,
    scope: { category: 'movie', genre: 'Science Fiction' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'scifi_voyager',
      tier: 'silver',
      title: 'Sci-Fi Voyager',
      description: 'Journeyed through 15 science fiction films.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'taste_action_initiate',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 5,
    scope: { category: 'movie', genre: 'Action' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'action_initiate',
      tier: 'bronze',
      title: 'Action Initiate',
      description: 'Watched 5 high-octane action films.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'taste_action_hero',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 15,
    scope: { category: 'movie', genre: 'Action' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'action_hero',
      tier: 'silver',
      title: 'Action Hero',
      description: 'Watched 15 high-octane action films.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'taste_comedy_regular',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 5,
    scope: { category: 'movie', genre: 'Comedy' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'comedy_regular',
      tier: 'bronze',
      title: 'Comedy Regular',
      description: 'Enjoyed 5 comedy films.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'taste_comedy_connoisseur',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 15,
    scope: { category: 'movie', genre: 'Comedy' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'comedy_connoisseur',
      tier: 'silver',
      title: 'Comedy Connoisseur',
      description: 'Enjoyed 15 comedy films.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'taste_drama_seeker',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 5,
    scope: { category: 'movie', genre: 'Drama' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'drama_seeker',
      tier: 'bronze',
      title: 'Drama Seeker',
      description: 'Experienced 5 compelling dramatic features.',
      iconHint: 'movie'
    }
  },
  {
    ruleId: 'taste_drama_devotee',
    version: 1,
    family: 'watch_count',
    unit: 'movie',
    threshold: 15,
    scope: { category: 'movie', genre: 'Drama' },
    facet: 'taste_affinity',
    badge: {
      badgeKey: 'drama_devotee',
      tier: 'silver',
      title: 'Drama Devotee',
      description: 'Experienced 15 compelling dramatic features.',
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
  },

  // --- Show Mastery / Trophy Shelf Rules (Block 3-6-6D) ---
  {
    ruleId: 'show_mastery_first',
    version: 1,
    family: 'completion',
    unit: 'episode',
    threshold: 1,
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'first_completed_show',
      tier: 'bronze',
      title: 'Series Finisher',
      description: 'Completed 100% of all episodes in a TV or anime series.',
      iconHint: 'trophy'
    }
  },
  {
    ruleId: 'show_mastery_5',
    version: 1,
    family: 'completion',
    unit: 'episode',
    threshold: 5,
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'completed_shows_5',
      tier: 'silver',
      title: 'Series Collector',
      description: 'Completed 100% of 5 distinct TV or anime series.',
      iconHint: 'trophy'
    }
  },

  // --- Rewatch Loyalty Rules (Block 3-6-6D) ---
  {
    ruleId: 'rewatch_first',
    version: 1,
    family: 'rewatch',
    unit: 'play',
    threshold: 1,
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'first_rewatch',
      tier: 'bronze',
      title: 'Encore Feature',
      description: 'Rewatched a movie or episode on a distinct viewing session.',
      iconHint: 'rewatch'
    }
  },
  {
    ruleId: 'rewatch_count_5',
    version: 1,
    family: 'rewatch',
    unit: 'play',
    threshold: 5,
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'rewatch_5',
      tier: 'silver',
      title: 'Rewatch Devotee',
      description: 'Rewatched 5 titles across distinct viewing sessions.',
      iconHint: 'rewatch'
    }
  },
  {
    ruleId: 'rewatch_count_20',
    version: 1,
    family: 'rewatch',
    unit: 'play',
    threshold: 20,
    facet: 'trophy_shelf',
    badge: {
      badgeKey: 'rewatch_20',
      tier: 'gold',
      title: 'Master of Replays',
      description: 'Rewatched 20 titles across distinct viewing sessions.',
      iconHint: 'rewatch'
    }
  },

  // --- Shared Viewing Bonds / Co-Watch Rules (Block 3-6-6D) ---
  {
    ruleId: 'cowatch_first',
    version: 1,
    family: 'confirmed_cowatch',
    unit: 'session',
    threshold: 1,
    facet: 'cowatch_bond',
    evidenceRequirements: {
      requiresConfirmedCoWatch: true
    },
    badge: {
      badgeKey: 'first_cowatch',
      tier: 'bronze',
      title: 'Shared Screening',
      description: 'Watched a movie or episode confirmed together with another household member.',
      iconHint: 'cowatch'
    }
  },
  {
    ruleId: 'cowatch_count_5',
    version: 1,
    family: 'confirmed_cowatch',
    unit: 'session',
    threshold: 5,
    facet: 'cowatch_bond',
    evidenceRequirements: {
      requiresConfirmedCoWatch: true
    },
    badge: {
      badgeKey: 'cowatch_5',
      tier: 'silver',
      title: 'Couch Companions',
      description: 'Watched 5 titles confirmed together with household members.',
      iconHint: 'cowatch'
    }
  },
  {
    ruleId: 'cowatch_count_25',
    version: 1,
    family: 'confirmed_cowatch',
    unit: 'session',
    threshold: 25,
    facet: 'cowatch_bond',
    evidenceRequirements: {
      requiresConfirmedCoWatch: true
    },
    badge: {
      badgeKey: 'cowatch_25',
      tier: 'gold',
      title: 'Inseparable Viewers',
      description: 'Watched 25 titles confirmed together with household members.',
      iconHint: 'cowatch'
    }
  }
];
