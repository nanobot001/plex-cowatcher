# Block 3-6-6: Achievements Engine v1

> Status: Planned.
> Result: Not implemented.
> Notes: Derive durable, explainable achievements only after the archive and source-confidence foundations are in place.

## Goal

Turn the historical watch archive into a small, reproducible achievement system whose results can be recalculated as evidence improves without rewriting history.

## Scope

- Define versioned achievement rules with stable IDs, display copy, thresholds, and evidence requirements.
- Start with a bounded first set: first watch, watch-count milestones, completed-series milestones, genre/library milestones, rewatch milestones, and confirmed household co-watch milestones.
- Require explicit evidence thresholds; unknown or Plex-only evidence must not silently satisfy rules that require detailed Tautulli playback.
- Return supporting archive records and provenance for every earned or blocked achievement.
- Add deterministic recalculation and idempotent persistence of achievement results.

## Out Of Scope

- Competitive rankings, public profiles, or gamification notifications.
- Achievements based on inferred co-watching without explicit policy approval.
- Mutating playback history to make an achievement true.

## Acceptance Criteria

- The same archive snapshot produces the same achievement results across repeated runs.
- Every earned achievement includes explainable supporting evidence and source labels.
- Missing or uncertain evidence produces a blocked/unknown result rather than a false achievement.
- Adding a newly recovered Plex record can unlock an achievement without changing prior raw observations.

## Verification

- `npm run verify:block`
- Rule-engine fixtures for milestones, duplicate plays, incomplete series, unknown evidence, Plex-only evidence, and confirmed co-watch evidence.

