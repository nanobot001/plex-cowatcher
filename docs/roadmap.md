# Roadmap

This roadmap turns the project charter into implementation blocks. The MVP is **Phase 1**. Each old phase has been collapsed into a Phase 1 block so the project can move through `block-1-1`, `block-1-2`, and onward until MVP completion.

## Foundation: Scaffold Baseline

Status: mostly complete.

Purpose: make the project buildable, runnable, and tool-friendly before touching live Plex/Tautulli/Discord behavior.

Acceptance:

- TypeScript project builds with `npm run build`.
- Tests run with `npm test`.
- SQLite schema initializes with `npm run db:init`.
- Express exposes `/api/health`.
- CLI returns structured JSON.
- Browser shell opens at `http://localhost:8787`.
- Discord prompt builders and interaction handler call the shared service layer.
- Plex/Tautulli adapters exist with mock-safe seams.

## Phase 1: MVP

Phase 1 is complete when the service can perform both MVP workflows end to end:

- Discord co-watch confirmation from detected watch through audited prompt resolution.
- Preview-first history copy from source user to target user(s), with explicit apply and idempotent results.

### Block 1-1: Local Configuration And Health

Make the service honest about local readiness before real automation is enabled.

- Move from example-only user config to a local ignored config file such as `config/users.json`.
- Add config validation with clear startup errors for missing required values.
- Expand `/api/health` and `/api/status` to report database, Tautulli, Plex, Discord, watcher, and PM2-relevant state.
- Add a browser dashboard that shows health, configured users, pending prompts, and recent errors.

### Block 1-2: Tautulli Watch Detection

Reliably detect completed source-user watches without duplicate prompts.

- Implement Tautulli recent-history polling through `tautulliAdapter`.
- Normalize Tautulli rows into internal watch event inputs.
- Implement completion threshold logic and recent-window duplicate defense.
- Persist watch events in SQLite.
- Add tests with mocked Tautulli rows for movies and episodes.

### Block 1-3: Discord Co-Watch Flow

Make the Discord prompt workflow useful with mock Plex sync first, then verified live sync.

- Send a test prompt to the configured Discord channel.
- Send real prompts for pending watch events.
- Support typical co-watch users, everyone, no one, dismiss, and browser/admin link actions.
- Resolve prompts through `cowatchService.resolvePrompt`.
- Edit the Discord message with per-target sync results.

### Block 1-4: Plex Watched-State Verification

Prove or explicitly constrain the live Plex mutation path.

- Document the exact Plex account/token model used locally.
- Verify list-users, metadata lookup, watched-state check, and mark-watched behavior against the real setup.
- Keep `PLEX_MUTATION_MODE=mock` as the default until verification is complete.
- Add clear error codes for missing permissions, unavailable users, unmatched media, timeout, and already watched.

### Block 1-5: Preview-First History Copy

Make the browser and CLI copy workflow safe enough for real use.

- Add source user, target user, media type, show, season, library, watched-state, and date filters.
- Preview copy jobs from Tautulli/Plex history without mutating Plex state.
- Apply only an existing preview job with explicit confirmation.
- Skip already-watched or already-copied items.
- Store per-item status and failures.

### Block 1-6: MVP Operations And Acceptance

Make the MVP dependable enough for daily household use.

- Confirm PM2 runs exactly one forked instance.
- Document start, stop, restart, logs, status, and save commands.
- Choose and document Windows restart-after-reboot strategy.
- Add operational troubleshooting for Discord, Tautulli, Plex, SQLite, and port conflicts.
- Run the MVP manual acceptance checklist.

## Phase 2: Watch History Intelligence MVP

Phase 2 turns Plex CoWatcher into a durable, tool-friendly source of household watch-history intelligence. It captures richer playback evidence than Plex's current watched flag, supports composable queries, calculates progress, reconstructs sessions, and keeps confirmed participation separate from inference.

### Block 2-1: Rich Playback Evidence Capture

Persist completed and partial playback evidence for every enabled configured Plex user while preserving Phase 1 prompt behavior for source users.

### Block 2-2: Content Metadata Catalog

Create stable movie/show/season/episode identities and cache media type, genre, hierarchy, durations, and known episode totals.

### Block 2-3: Watch History Query API

Expose shared CLI and HTTP queries filterable by person, exact content or show, media type, genre, household-local day, range, and completion state.

### Block 2-4: Watch Progress Summaries

Provide per-show, per-person, and per-day summaries covering distinct and repeated plays, partial/completed viewing, time watched, and progress against known episode totals.

### Block 2-5: Viewing Session Reconstruction

Group playback observations into deterministic, explainable per-user viewing sessions with explicit interval quality and uncertainty.

### Block 2-6: Co-Watching Intelligence

Combine explicit Discord confirmation with cautious time-based session correlation, returning provenance, supporting evidence, and confidence without mutating Plex from inference.

## Phase 3: Post-MVP Features (Customization & Reporting)

Phase 3 introduces domain-specific features, system settings, and reporting to refine the user experience beyond the core watch history intelligence.

### Block 3-1: Audiobook Differentiation & Settings

Introduce robust heuristics and deep metadata parsing to classify audiobooks and separate them from standard music tracks. Implement a foundational application settings store to configure rules like disabling Discord prompts for solo audiobook sessions.

### Block 3-2 Umbrella Specification: Customizable Household Media Dashboard MVP

Implemented 2026-06-28 through Blocks 3-2a to 3-2e. Together, the completed children create a highly customizable, media-neutral window into what every configured user is consuming.

- **3-2a - Usable Dashboard MVP Foundation:** Real household overview, mixed-media activity, shared filters, initial drill-downs, safe Plex artwork, and saved display preferences.
- **3-2b - Activity Timeline And Layout System:** Persistent layout switching and a chronological, provenance-aware activity view.
- **3-2c - Media Explorer And Rich Drill-Downs:** Searchable artwork browsing plus media-, person-, session-, episodic-, and audiobook-aware detail.
- **3-2d - People And Co-Watching Workspace:** Per-person intelligence, Discord prompt lifecycle visibility, and safe audited co-watch actions.
- **3-2e - Progress, Export, Accessibility And Hardening:** Progress and collections, streamed CSV export, responsive accessibility, performance, and regression coverage.

### Block 3-3: Household Watch Reports

Automate and schedule the delivery of daily or weekly household watch reports to Discord, summarizing what was watched, by whom, and what co-watching sessions occurred.

### Block 3-4: Hierarchical Audiobook Series Modeling

Extend the audiobook catalog so top-level series and subseries can be represented separately, backfilled safely, and surfaced through existing tool-friendly service layers without breaking current audiobook workflows.

### Deferred Beyond The Phase 3 MVP

- Per-user Discord DM prompts.
- Advanced matching across renamed or migrated libraries.
- Natural-language query parsing or recommendation features (e.g., dedicated Media Bot).
- Multi-server support.