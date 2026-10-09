# Achievements Contract & Evidence Eligibility Matrix

> Status: Canonical Contract Specification (Block 3-6-6A).
> Direction: `docs/design/achievements-product-direction.md`.

## 1. Public Result Contract

All achievement queries (in-process calls, local HTTP endpoint, CLI/tools, and future standalone apps) return the same versioned JSON structure.

```typescript
export interface AchievementEvaluationPayload {
  contractVersion: number;       // e.g. 1
  watermark: EvidenceWatermark; // Highest IDs observed in underlying stores
  timezone: string;             // Household timezone, e.g. 'America/New_York'
  evaluatedAt: string;          // ISO timestamp of evaluation
  results: AchievementResult[];
}

export type ShowcaseFacet =
  | 'trophy_shelf'       // Specific completed TV shows, anime, or books
  | 'taste_affinity'     // Genre and category devotion levels (Anime, Sci-Fi, etc.)
  | 'obsession_spotlight'// #1 heavy-rotation show or franchise
  | 'cowatch_bond';      // Series/movies completed together with household partners

export interface AchievementResult {
  userId: number;
  ruleId: string;
  version: number;
  facet?: ShowcaseFacet;
  badge: BadgeDescriptor;
  state: 'earned' | 'in_progress' | 'not_earned' | 'blocked' | 'unknown';
  progress: {
    current: number;
    target: number;
    unit: 'movie' | 'episode' | 'audiobook_book' | 'play' | 'session' | 'day';
  };
  earnedAt: string | null;      // ISO timestamp of the threshold-crossing event, or null if unknown
  supportingEvidence: SupportingEvidenceRef[];
  reason?: string;
}

export interface BadgeDescriptor {
  badgeKey: string;             // Permanent badge identifier (e.g. 'show:fma_brotherhood', 'anime_devotee')
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  title: string;                // Display title
  description: string;          // Human-readable achievement description
  iconHint?: string;            // Neutral glyph or category hint
  posterUrl?: string | null;    // Dynamic Plex/Tautulli poster artwork reference for show badges
  stats?: {
    totalHours?: number;
    totalPlays?: number;
    completedItems?: number;
    rewatchCount?: number;
  };
}

export interface SupportingEvidenceRef {
  kind: 'playback_observation' | 'archive_watch_event' | 'cowatch_confirmation' | 'cowatch_adjudication';
  id: number;
  eventTime?: string | null;
  title?: string;
}
```

---

## 2. Evidence-Eligibility Matrix

| Rule Family | Eligible Evidence | Excluded / Ineligible Evidence | Result when Ineligible / Missing |
| :--- | :--- | :--- | :--- |
| **First Watch** (`first_watch`) | Completed `playback_observations` or completed unlinked `archive_watch_events` matching media category. Earliest qualifying event defines `earnedAt`. | Incomplete plays (`completed = 0`), unverified source plays, plays from hidden listeners. | `not_earned` (if 0 completed plays). Missing timestamp yields `earnedAt = null`, not failure. |
| **Watch Count** (`watch_count`) | Distinct completed items matching category. Linked archive events deduplicated via `archive_observation_links` (never double-counted). Audiobooks count completed books (`audiobook_book`). | Track-level progress observations for audiobooks; duplicate/linked rows from multi-source history. | `in_progress` if `0 < count < threshold`, else `not_earned`. |
| **Rewatch** (`rewatch`) | Distinct completed playback sessions per `evaluateReplaySemantics` (different viewing day, offset reset, or separate completed sessions). | Overlapping same-session playback, continuous pauses, duplicate observation rows. | `in_progress` if `0 < count < threshold`, else `not_earned`. |
| **Confirmed Co-Watch** (`confirmed_cowatch`) | Discord confirmations with `status = 'confirmed'` (`cowatch_confirmations`), OR browser adjudications with latest `decision = 'yes'` (`cowatch_adjudications`). | Inferred co-watching (proximity or heuristic overlap), pending prompts, `decision = 'no'`, `decision = 'not_sure'`, or cleared decisions. | If inferred co-watch exists without confirmation, returns **`blocked`**. If no co-watch evidence at all, returns `not_earned`. |
| **Completion** (`completion`) | Complete series, season, or genre where denominator is verified and known. | Incomplete catalog metadata, unclassified genres, unknown total episode/track counts. | If denominator is unknown or unverified, returns **`unknown`** (never `not_earned`). |

---

## 3. Retraction & "Mirror Current Evidence" Policy

- Achievements are **computed on read** over canonical evidence.
- If supporting evidence is retracted:
  - When an adjudication is set to `'clear'`, the co-watch evidence is removed. On the next evaluation, the user's co-watch count immediately decreases, and an achievement drops back to `in_progress` or `not_earned`.
  - When a duplicate play is merged away via `archive_observation_links`, it is counted once.
- There is **no sticky award ledger** in v1. The public contract always truthfully reflects what is corroborated by current evidence.

---

## 4. Determinism & Watermarks

1. **Ordering**: Results are deterministically sorted by `userId ASC`, `ruleId ASC`, `version ASC`.
2. **Watermark**: Represents the maximum observed primary key across evidence tables:
   ```json
   {
     "maxObservationId": 1234,
     "maxArchiveEventId": 567,
     "maxConfirmationId": 89,
     "maxAdjudicationId": 12
   }
   ```
3. **Reproducibility**: For a fixed database state (same watermark) and household timezone, evaluation produces byte-identical JSON output.
