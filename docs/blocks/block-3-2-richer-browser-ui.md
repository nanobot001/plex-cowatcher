# Block 3-2: Customizable Household Media Dashboard MVP

> Status: Umbrella specification - do not implement directly.
> Result: Completed as a planning specification; implementation is tracked only in Blocks 3-2a through 3-2e.
> Notes: This file defines the product contract and sequencing. All five child blocks were implemented and verified on 2026-06-28.

## Implementation Instruction

Do not select or run `implement-block` against Block 3-2. This document is a non-implementable umbrella specification. The five child blocks were implemented sequentially and are retained in the completed folder as historical references.

## Goal

Provide a customizable localhost dashboard that acts as a clear window into what every configured household user is consuming. The dashboard must make useful mixed-media information visible immediately, treat movies, TV, classic TV, anime, and audiobooks fairly, and let the operator drill from household summaries into understandable source data without losing context.

## MVP Experience

Block 3-2a delivers the first usable slice and must already provide:

- A polished household overview populated from real backend data.
- A mixed-media recent-activity view covering every configured user.
- Shared date, person, media-category, and library filters.
- Clear totals for time consumed, items consumed, active users, and pending co-watch prompts.
- Clickable summary and activity elements that open useful detail.
- Plex artwork displayed through a private localhost-safe route, with graceful fallbacks.
- Saved non-sensitive dashboard preferences in browser localStorage.
- Honest loading, empty, partial-data, and error states.
- Existing copy-history, audit, settings, API, CLI, Discord, and PM2 behavior preserved.

Blocks 3-2b through 3-2e extend that usable core with alternate layouts, deeper drill-downs, co-watching visibility, export, accessibility, and hardening.

## Shared Product Rules

- Movies, TV, classic TV, anime, and audiobooks are first-class categories, including an All Media view.
- Friendly categories come from centralized structured rules; uncertain classification retains the raw Plex media type and library.
- Audiobooks use canonical book, series, and subseries data rather than appearing as generic music.
- Playback observation, explicit Discord confirmation, Plex synchronization, and inferred co-watching remain visibly distinct.
- Shared filters and selection survive layout changes.
- Layout and display preferences stay client-local unless a future multi-device requirement justifies server persistence.
- CSV is generated on demand and streamed to the browser; exports are not retained by default.
- Plex artwork is reused, not copied into a new permanent library. Tokens and private upstream URLs never reach browser markup or public-read responses.
- Inference never mutates Plex watched state.
- Scheduled reports and Discord report delivery remain Block 3-3.

## Implementation Blocks

1. [Block 3-2a: Usable Dashboard MVP Foundation](completed/block-3-2a-dashboard-mvp-foundation.md)
2. [Block 3-2b: Activity Timeline And Layout System](completed/block-3-2b-activity-timeline-layout-system.md)
3. [Block 3-2c: Media Explorer And Rich Drill-Downs](completed/block-3-2c-media-explorer-drilldowns.md)
4. [Block 3-2d: People And Co-Watching Workspace](completed/block-3-2d-people-cowatching-workspace.md)
5. [Block 3-2e: Progress, Export, Accessibility And Hardening](completed/block-3-2e-progress-export-hardening.md)
6. [Block 3-2f: Premium Dashboard Redesign](completed/block-3-2f-premium-dashboard-redesign.md)

## Overall Acceptance Criteria

- [ ] Block 3-2a produces the usable MVP described above.
- [ ] Five complementary layouts are available by the end of 3-2e: Household Overview, Activity Timeline, Media Explorer, People & Co-Watching, and Progress & Collections.
- [ ] All layouts use one typed filter/query vocabulary and preserve dashboard context when switching.
- [ ] Rich detail is available for media items, people, sessions, co-watch events, episodic hierarchy, and audiobook hierarchy.
- [ ] Server-side queries remain bounded and deterministically ordered.
- [ ] Structured tool contracts, privacy constraints, audit behavior, dry-run safeguards, and the single-process runtime remain intact.
- [ ] The complete suite passes build, tests, tool verification, and manual browser/accessibility checks.

## Verification

- Verify every child block independently.
- After 3-2e: `npm run build`, `npm test`, and `npm run verify:tools`.
- Complete a manual mixed-media, multi-user browser walkthrough at `http://localhost:8787`.

## Dependency And Drift Guardrails

- Phase 2 query, summary, session, and co-watching services are the dashboard read foundation.
- Blocks 3-1, 3-4, and 3-5 supply audiobook classification and hierarchy.
- New browser needs should extend shared services and structured APIs, not query SQLite directly from rendering code.
- Do not migrate to a second runtime or public frontend deployment without a separate architecture decision.
- Do not absorb scheduled reporting from Block 3-3.