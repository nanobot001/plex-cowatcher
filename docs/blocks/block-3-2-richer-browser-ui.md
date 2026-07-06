# Block 3-2: Customizable Household Media Dashboard MVP

> Status: Umbrella specification - do not implement directly.
> Result: Original implementation completed through 3-2f; corrective redesign planned in Blocks 3-2g through 3-2o.
> Notes: A live Playwright audit found serious hierarchy, responsiveness, performance, and outcome gaps after 3-2f. This file now governs the locked corrective sequence.

## Implementation Instruction

Do not select or run `implement-block` against Block 3-2. This document is a non-implementable umbrella specification. Blocks 3-2a through 3-2f are historical implementations. Implement Blocks 3-2g through 3-2o one at a time, in order, and stop whenever the selected block's exit gate does not pass.

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
- Title-level `Watched by` means participation at any time and never implies co-watching; `Together` is human-confirmed and `Likely together` is exact-item inference under the versioned shared rule.
- Shared filters and selection survive layout changes.
- Layout and display preferences stay client-local unless a future multi-device requirement justifies server persistence.
- CSV is generated on demand and streamed to the browser; exports are not retained by default.
- Plex artwork is reused, not copied into a new permanent library. Tokens and private upstream URLs never reach browser markup or public-read responses.
- Every visual media card uses the canonical top-level poster or cover when Plex provides one: movie poster for movies, show poster for episodic media, and the specific book cover for audiobooks. Audiobook cards must never substitute author/artist artwork for the book cover. Category artwork is only a fallback when the canonical poster/cover is genuinely unavailable.
- Dashboard Settings provides a per-user `Show on dashboard` control and an optional display alias. Every configured enabled user is shown by default; the default and fallback display name is the exact Plex username.
- Hiding a user is dashboard-presentation configuration only: exclude that user from dashboard people lists, filters, timelines, cards, and household aggregates, while preserving ingestion, stored history, Discord mappings, copy-history eligibility, audit history, and other service behavior.
- Aliases affect dashboard labels only. They never rewrite Plex usernames, user IDs, evidence, Discord mappings, exports, audit records, or adapter calls.
- Inference never mutates Plex watched state.
- Scheduled reports and Discord report delivery remain Block 3-3.

## Implementation Blocks

1. [Block 3-2a: Usable Dashboard MVP Foundation](completed/block-3-2a-dashboard-mvp-foundation.md)
2. [Block 3-2b: Activity Timeline And Layout System](completed/block-3-2b-activity-timeline-layout-system.md)
3. [Block 3-2c: Media Explorer And Rich Drill-Downs](completed/block-3-2c-media-explorer-drilldowns.md)
4. [Block 3-2d: People And Co-Watching Workspace](completed/block-3-2d-people-cowatching-workspace.md)
5. [Block 3-2e: Progress, Export, Accessibility And Hardening](completed/block-3-2e-progress-export-hardening.md)
6. [Block 3-2f: Premium Dashboard Redesign](completed/block-3-2f-premium-dashboard-redesign.md)
7. [Block 3-2g: Dashboard Contract And Performance Baseline](block-3-2g-dashboard-contract-and-performance-baseline.md)
8. [Block 3-2h: Dashboard Shell And Design System](block-3-2h-dashboard-shell-and-design-system.md)
9. [Block 3-2i: Overview Decision Surface](block-3-2i-overview-decision-surface.md)
10. [Block 3-2j: Library Category Browser](block-3-2j-library-category-browser.md)
11. [Block 3-2j-1: Co-Watch Evidence Semantics](block-3-2j-1-cowatch-evidence-semantics.md)
12. [Block 3-2k: Rich Media Detail Workspace](block-3-2k-rich-media-detail-workspace.md)
13. [Block 3-2l: Daily Session Timeline](completed/block-3-2l-daily-session-timeline.md)
14. [Block 3-2m: Household People Profiles](block-3-2m-people-and-cowatch-intelligence.md)
15. [Block 3-2m-1: Person Pairings And Operations](block-3-2m-1-person-pairings-and-operations.md)
16. [Block 3-2m-2: Browser Co-Watch Adjudication](block-3-2m-2-browser-cowatch-adjudication.md)
17. [Block 3-2m-3: Discord Co-Watch Review](block-3-2m-3-discord-cowatch-review.md)
18. [Block 3-2m-4: People Co-Watch Attribution And Window Controls](block-3-2m-4-people-cowatch-attribution.md)
19. [Block 3-2m-5: People Ordering And Heatmap Interaction](block-3-2m-5-people-ordering-and-heatmap-interaction.md)
20. [Block 3-2n: Hierarchy Progress Workspace](block-3-2n-hierarchy-progress-workspace.md)
21. [Block 3-2o: Dashboard Accessibility And Regression Gate](block-3-2o-dashboard-accessibility-and-regression-gate.md)

## Corrective Sequence Authority

- The live audit findings are acceptance evidence: invisible/zero-size primary navigation, cramped Overview hierarchy, repeated generic carousels, an unbounded multi-month Timeline, a category-skewed Library, raw/duplicate People identities, and a Progress view that did not become interactive within 30 seconds.
- Mockup 1 guides Overview composition; Mockup 2 guides Library; Mockup 3 guides Timeline; Mockup 4 guides rich detail and hierarchy; Mockup 5 contributes only evidence-backed operations and analytics concepts.
- Mockups are hierarchy references, not authority to invent ratings, recommendations, downloads, watchlists, live presence, playback controls, or unsupported external integrations.
- Block 3-2g creates the durable dashboard redesign/data contract. Blocks 3-2h through 3-2o must cite and preserve it.
- Canonical poster/cover selection and dashboard user visibility/alias semantics are non-negotiable parts of that contract and must be tested in every later block that renders media or people.
- Each block owns a narrow outcome and an explicit exit gate. Failure reopens the owning block; work must not drift forward.

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
- Every remaining corrective child block must pass `npm run verify:block` before completion.
- After rebuilding or restarting the deployed dashboard, run `npm run verify:live-dashboard` and complete any block-specific manual mixed-media walkthrough at `http://localhost:8787`.

## Dependency And Drift Guardrails

- Phase 2 query, summary, session, and co-watching services are the dashboard read foundation.
- Blocks 3-1, 3-4, and 3-5 supply audiobook classification and hierarchy.
- New browser needs should extend shared services and structured APIs, not query SQLite directly from rendering code.
- Do not migrate to a second runtime or public frontend deployment without a separate architecture decision.
- Do not absorb scheduled reporting from Block 3-3.
- Do not begin Block 3-3 until Block 3-2o has passed and the corrective sequence is moved to completed history.
