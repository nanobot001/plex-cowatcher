# Block 3-2n-6E-2C3: Canonical Movie History And Enriched Detail

> Status: Implemented and verified on 2026-07-15.
> Result: Implemented. Movie detail now uses exact-GUID canonical history grouped into household-local viewing days, one de-duplicated history presentation, and lazy allowlisted exact-profile enrichment from media-bot.
> Verification: `npm run verify:block` passed with 110/110 service and integration tests plus 49 passing dashboard regression cases and one intentional skip. After PM2 restart, `npm run verify:live-dashboard` passed. The media-bot focused tool suite passed 81 tests, and ten warm exact-profile CLI invocations measured p95 615 ms against the 750 ms budget.
> Notes: The live Shang-Chi canary joined one stale-key observation under `23917` and two current-key observations under `57417` through exact Plex GUID equality, yielding three visible viewers and three completed viewing days. The lazy profile returned the allowlisted 2021, 132-minute, PG-13 Marvel Studios profile without artwork or private fields. Four additive exact-lookup indexes were applied to media-bot's live catalog without restarting its dirty worktree.

## Goal

Make Movie detail tell one source-honest household story: who watched the canonical movie, on which dates, and whether each household-local viewing day completed, even when Plex rating keys changed. Replace duplicated and misleading summary cards with one bounded watch-history workspace and a lazy, source-backed "About this movie" profile from media-bot.

## Dependencies And Entry Gate

- 6E-2C1 and 6E-2C2 remain implemented, verified, committed, and pushed; this block extends their canonical-identity work without reopening their artwork acceptance.
- Use CoWatcher's normalized SQLite observations as the watch-history source of truth. media-bot may enrich Movie facts but must not author people, dates, completion, co-watch, artwork, or progress evidence.
- Consume media-bot only through a structured public-read JSON command/adapter. Do not read its SQLite database directly from production CoWatcher code.
- Treat media-bot's existing general `query-library` command as a discovery and benchmark surface, not the default production lookup. The production path must use a public-read exact-profile command backed by indexed rating-key, IMDb, or TMDb identity; it must not run semantic search or scan the full library for a normal modal request.
- If media-bot does not yet expose that exact-profile command, add and verify the smallest upstream read-only tool prerequisite before connecting CoWatcher. The command must return one schema-versioned sanitized profile or an explicit not-found/ambiguous result. It must not generate enrichment, mutate media-bot, or contact external providers.
- The adapter must use a configured compatible runtime, bounded arguments, a 1.5-second hard timeout, a 64 KiB output cap, and an allowlisted response. The current interactive shell exposes only Python 3.8 while media-bot requires newer syntax; implementation must locate and explicitly configure a compatible runtime before live acceptance.
- Deterministic verification must use a test-owned adapter fixture and must never require media-bot, PM2, Plex, Tautulli, external providers, or either live SQLite database.

## Locked Semantics

- **Canonical Movie history:** exact current rating key is always eligible. Additional historical Movie observations are eligible only when their non-empty `plex_guid` exactly matches the current catalog Movie GUID. Never merge history by title alone, fuzzy title, artwork similarity, or a media-bot candidate.
- **Viewing day, not session:** summarize one visible person plus one canonical Movie plus one household-local calendar date as one viewing day. Multiple start/stop observations by the same person on that date remain one viewing day. Separate dates remain separate viewing days. This intentionally cannot claim that two genuine same-day rewatches were separate until stronger session evidence exists.
- **Completed viewing day:** a viewing day is completed when at least one grouped direct observation is completed. Otherwise show partial/in-progress with the strongest available percentage; do not fabricate completion.
- **Raw observations:** preserve the existing raw `plays`/observation count for API compatibility and diagnostics, but do not label it "plays" in the Movie presenter. Expose the raw count only inside an optional evidence disclosure.
- **Observed time:** Tautulli `playback_observations.duration` is media duration in seconds, not verified elapsed session time. Do not sum it as Movie "Observed time." Remove that visible metric from Movie detail. Display source-backed Movie runtime instead when available.
- **People:** derive distinct visible people from the same complete canonical history set used by summary and rows. Preserve dashboard aliases/order and hidden-user exclusion. A confirmed participant without a direct observation must remain explicitly attributed/confirmed evidence rather than being presented as directly observed playback.
- **Movie profile identity:** request one exact profile using known identities in priority order: current/known Plex rating key, IMDb ID, then TMDb ID. Exact title plus year is allowed only as an explicitly indexed, non-semantic fallback that returns exactly one candidate. No title-only acceptance and no semantic candidate selection on the modal path.
- **Artwork authority:** CoWatcher's 6E-2C artwork descriptor remains authoritative. media-bot poster fields cannot replace poster or backdrop URLs.

## Scope

- Add a typed canonical Movie-history projection that resolves current and stale Plex rating keys through exact stable GUID evidence without rewriting observations or catalog rows.
- Add an additive Movie summary with raw observation count, viewing-day count, completed-viewing-day count, distinct visible viewer count, first viewed time, and latest viewed time.
- Add bounded, deterministic Movie history rows grouped by visible person and household-local date. Each row includes stable user ID, display name, local date, latest timestamp, completion/partial state, strongest supported percentage, grouped observation count, and evidence kind.
- Replace the Movie presenter's duplicated Progress, Playback, People, Latest activity, Category, Detail identity, and evidence cards with one compact poster rail, one watch-history section, and one expandable provenance disclosure.
- Keep a single concise completion/status treatment in the poster rail; the wide primary column owns the dated history rows.
- Add a lazy media-bot Movie-profile adapter and route so a slow, unavailable, malformed, or stale sibling tool cannot delay or blank the canonical detail shell or household history. Core Movie detail must render before enrichment is requested.
- Add a bounded CoWatcher profile cache keyed by canonical Movie identity, with a configurable 15-minute default TTL, in-flight request coalescing, and a short failure backoff. Cache only schema-valid allowlisted profiles; never cache or replay raw sibling-tool output.
- Allowlist and normalize only useful profile fields: release year/date, runtime, genres, directors, bounded top cast, studios, country, content rating, tagline, synopsis, IMDb/TMDb IDs, brand/franchise/universe tags, and source/refreshed-at metadata. Numeric ratings require a named source and scale or remain hidden.
- Render a bounded "About this movie" section with tagline/synopsis, metadata chips, director, top cast, and optional franchise/universe context. Missing fields collapse cleanly without placeholders or empty cards.
- Keep technical copy details such as resolution/bitrate secondary and collapsed if included; never expose file paths or storage locations.
- Preserve all existing response fields additively during migration so other dashboard consumers and 6E-3 do not break.
- Update the dashboard regression contract for canonical stale-key Movie history, viewing-day grouping, de-duplicated Movie layout, privacy, lazy enrichment, and graceful degradation.

## Out Of Scope

- Reconstructing true Plex/Tautulli sessions, changing global `project.viewing_sessions`, or claiming separate same-day rewatches without stable session evidence.
- Rewriting, migrating, deleting, or permanently canonicalizing existing playback observations.
- Changing global dashboard play-count semantics outside the Movie detail presenter.
- Running media-bot enrichment, writing its database, changing its download pipeline, calling Gemini/TMDb/Wikidata live, or exposing embeddings/raw enrichment JSON.
- Direct production reads of `media-bot/data/moviebot.sqlite3`, private file paths, raw commands, tokens, provider payloads, or unbounded errors.
- Hero brightness/crop/focal-position changes or Audiobook chapter-summary parity; 6E-2D owns those.
- Progress migration or removal of `#progress-dialog`; 6E-3 owns those.
- New artwork providers, database migrations, transcript/resume work, recommendations, or generic cross-project metadata federation.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/service/` (new bounded media-bot Movie-profile adapter)
- `src/types/api.ts`
- `src/server/routes.ts`
- `src/utils/config.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/fixture-server.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`
- `docs/testing/dashboard-regression-contract.md`
- media-bot's public-read CLI/router, profile query service, tool manifest/contracts, and focused tests for the exact-profile prerequisite when it is not already available

## Acceptance Criteria

- A Movie with current rating key `57417` and an older observation under `23917` with the same non-empty Plex GUID returns one canonical history containing Tony's 2022 viewing plus Garner's and Dorothy's 2026 viewings.
- A same-title Movie with a different/missing GUID is not merged. Empty GUIDs never authorize a cross-rating-key merge.
- Multiple observations for the same visible person, canonical Movie, and household-local date produce one viewing day and one history row; a later date produces another viewing day.
- Summary labels say "viewing day(s)" and "completed" with defined grouped semantics. The Movie presenter does not label raw observations as plays or sessions.
- Movie detail no longer renders "Observed time." It may render source-backed runtime, and malformed/unknown runtime remains absent rather than `0m`.
- People, viewer count, first/latest dates, completion counts, and history rows all derive from the same canonical observation set and cannot disagree.
- Hidden users are excluded before all counts and rows. Dashboard aliases and People ordering remain stable. Confirmed attribution is visibly distinct from direct observation.
- The poster rail contains one compact status summary; the primary column contains one watch-history section and one About section. Progress, playback, People, latest activity, Category, Detail identity, and evidence are not repeated in separate Movie cards.
- The history list is bounded and deterministic, supports keyboard access, and provides a clear disclosure/pagination mechanism when more rows exist.
- media-bot lookup is lazy, read-only, timeout-bounded, output-bounded, schema-validated, and allowlisted. Timeout, missing runtime, nonzero exit, malformed JSON, ambiguity, stale identity, and unavailable media-bot produce a quiet unavailable About state without blanking history or the dialog.
- A normal Movie modal lookup uses exact indexed identity and does not invoke media-bot semantic search, embeddings, generation, a full-library scan, or an external provider.
- The canonical detail/history response and first render never wait for media-bot. Enrichment starts separately and may populate About when ready.
- Repeated requests for the same canonical Movie within the cache TTL reuse one validated profile; concurrent misses are coalesced into one sibling-tool call. Expired entries refresh lazily, and failures receive bounded backoff rather than a process-spawn loop.
- In the deployed environment, record ten warm exact-profile invocations: p95 must be at most 750 ms, the CoWatcher adapter must enforce its 1.5-second hard timeout, and a validated cache hit must return without spawning media-bot. If the exact command misses the budget, do not fall back to semantic search; stop and record a prerequisite performance decision.
- The adapter never returns or logs `file_path`, database paths, embeddings, raw enrichment JSON, API keys, tokens, raw provider payloads, or arbitrary upstream errors.
- For the deterministic Shang-Chi profile fixture, About renders `2021`, `132 min`, `PG-13`, genres, Destin Daniel Cretton, bounded cast, Marvel Studios, tagline, synopsis, and MCU context without using media-bot artwork.
- About fields carry source/refreshed-at metadata in the response; numeric ratings remain hidden unless their source and scale are explicit.
- Desktop and 320/390px layouts preserve the shared one-scroll contract, aligned history columns, touch targets, keyboard access, no horizontal overflow, and no excessive empty space.
- Existing TV, Classic TV, Anime, Audiobook, Progress, artwork, tool, and non-Movie detail contracts remain unchanged.
- A real live canary proves canonical Shang-Chi history and a source-backed media-bot profile. If no compatible media-bot runtime/profile surface is available, the block cannot be marked implemented without an explicit approved degradation decision recorded in the ticket.

## Verification

- Focused service tests for exact-GUID stale-key recovery, empty/different-GUID rejection, hidden users, aliases/order, direct versus confirmed evidence, same-day grouping, different-day repeats, completion grouping, local-date boundaries, and bounded pagination.
- Focused media-bot tool tests for exact indexed rating-key/IMDb/TMDb lookup, schema version, sanitized not-found/ambiguous results, read-only behavior, and proof that the command does not invoke semantic search, generation, or external providers.
- Focused CoWatcher adapter tests for exact identity acceptance, indexed unique title-year fallback, ambiguity rejection, timeout, output cap, malformed JSON, nonzero exit, allowlisting, source metadata, private-field stripping, TTL reuse, in-flight coalescing, expiry, and failure backoff.
- Deterministic Playwright coverage at desktop, 390px, and 320px for the de-duplicated Movie presenter, canonical history rows, lazy About success/failure, provenance disclosure, keyboard/touch behavior, one-scroll ownership, and no overflow.
- `npm run verify:block`
- Rebuild/restart the deployed dashboard, then `npm run verify:live-dashboard`.
- Live read-only canary for Shang-Chi confirms Tony/Garner/Dorothy history, grouped viewing-day counts, no Movie Observed time, and allowlisted media-bot About fields without private paths or raw sibling-tool data.

## Implementation Notes

- CoWatcher keeps history authority in normalized playback observations. Exact current rating-key rows are eligible, and stale keys join only through the same non-empty canonical Plex GUID.
- Direct observations group by visible person and household-local date. Confirmed-only attribution remains distinct, hidden users are excluded before aggregation, and raw observation counts remain available only as evidence.
- The base detail response does not wait for media-bot. A separate lazy route uses a 1.5-second process timeout, bounded output, schema validation, field allowlisting, a 15-minute cache, in-flight coalescing, and failure backoff.
- media-bot gained the smallest required public-read `exact-profile` command with indexed rating-key, IMDb, TMDb, and exact title-year lookup. It does not run semantic search, generation, enrichment, or external providers.
- The Movie presenter now owns one watch-history section and one independently degradable About section. Existing non-Movie presenters, Progress isolation, and canonical artwork authority remain unchanged.

## Risks And Reversibility

- **Identity over-merge:** exact non-empty Plex GUID equality is the only stale-key history bridge; title-based history merging is prohibited.
- **Count confusion:** raw observations remain compatible but are moved behind evidence disclosure; user-facing counts use named viewing-day semantics.
- **Cross-project availability:** the exact-profile command is a small explicit prerequisite; lazy loading still isolates runtime failure. Removing the adapter/route restores the prior Movie presenter without data migration.
- **Schema/tool drift:** schema validation and allowlisting fail closed. No production code depends directly on media-bot's SQLite schema.
- **Performance:** canonical history queries and media-bot profile lookup must remain indexed and bounded. Lazy loading, request coalescing, the 15-minute cache, the 1.5-second timeout, and the measured warm-call budget prevent enrichment from blocking first paint or spawning one process per repeated render.
- **Privacy:** all filtering occurs before aggregation and rendering; malformed sibling output cannot bypass the allowlist.
