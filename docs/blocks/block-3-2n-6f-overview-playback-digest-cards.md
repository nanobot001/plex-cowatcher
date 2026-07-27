# Block 3-2n-6F: Overview Playback Digest Cards

> Status: Implemented on 2026-07-26.
> Result: Added category-aware Overview playback digest cards, collapsed session evidence, verified audiobook chapter summaries, per-episode artwork, and responsive/shared-detail coverage without changing ingestion or persistence.
> Verification: `npm run verify:block` passed (143/143 deterministic tests, 67 dashboard regression tests passed, 1 intentional narrow-project skip, and tool contracts passed); `npm run verify:live-dashboard` passed after restarting only `plex-cowatch-service` (the initial warm-up attempt timed out at Playwright `networkidle`, and the immediate retry passed).
> Notes: Digest grouping is additive and preserves the compatibility `recentPlayback` projection. Audiobooks remain per visible user/book/local day; movies are household movie/day digests; TV, Anime, and Classic TV are show/day digests with episode rows. Audiobook session details use compact chapter-index ranges, numbered time-only session labels, and an accessible partial-progress bar. Canonical titles that incorrectly equal a known author now fall back to a more specific raw book title, using author metadata or a matching catalog parent when author metadata is absent; unverified chapter evidence remains explicitly unavailable rather than being inferred.

## Goal

Replace the visually repetitive Overview playback-card stream with compact, category-aware digest cards that preserve the underlying session, participant, episode, and verified audiobook-chapter evidence.

## Scope

- Add an additive Overview digest read model while preserving the existing session-level `recentPlayback` response for compatibility.
- Group audiobook activity by visible user, canonical audiobook identity, and household-local session-start day. Keep each session as a collapsed child row with its time range, verified completed chapters, and one current partial chapter when applicable.
- Group movies by canonical movie identity and household-local day, retaining session, replay, and participant counts.
- Group TV, Anime, and Classic TV by canonical show identity and household-local day, with episode-level rows, participant evidence, and compact episode thumbnail strips.
- Extend TV hierarchy episode nodes and the digest episode rows with artwork descriptors resolved through the existing artwork proxy and fallback behavior.
- Keep artwork, chapter, and episode detail lazy or collapsed where necessary so Overview remains compact and responsive.
- Treat unverified audiobook track/file evidence as unverified; never label it as completed chapter evidence.
- Preserve user/date/category filters, accessibility semantics, responsive layout rules, and the existing shared detail workspace entry behavior.

## Out Of Scope

- Playback ingestion, Tautulli/Plex persistence, raw observation mutation, or session-boundary changes.
- Database migrations, new workers, new dependencies, or changes to recurring audiobook proof execution.
- Whisper/resume-context work, multi-file proof behavior, or chapter-source adjudication.
- Replacing the existing Timeline session model or removing the compatibility `recentPlayback` projection.

## Likely Files Or Areas

- `src/service/dashboardService.ts`
- `src/types/api.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/run-tests.mjs`
- `tests/e2e/dashboard-regression.spec.mjs`

## Acceptance Criteria

- The Overview response exposes additive digest data without removing or weakening `recentPlayback`.
- Multiple sessions for one user listening to one audiobook on one local day render as one audiobook digest card, with collapsed session rows.
- Audiobook session rows list only verified chapters completed during that session, plus a separately labeled current partial chapter when present; unverified track/file evidence remains explicitly source-honest.
- Different audiobook users and different local days remain separate digest cards.
- Repeated movie activity on one local day becomes one movie digest with session/replay/participant context; different days remain distinguishable.
- Multiple episodes from one show on one local day become one show digest while retaining episode identity, ordering, participant evidence, and per-episode thumbnails.
- Episode thumbnails appear in the digest and shared detail hierarchy, use the existing artwork proxy/fallback path, and do not expose private source paths.
- Existing user/date/category filters and detail navigation continue to work.
- Collapsed rows and thumbnail images have accessible names, keyboard behavior, and no horizontal overflow from 320px through desktop widths.
- Deterministic fixtures cover positive grouping cases and structurally different negative cases, including different users, days, shows, and unverified audiobook evidence.

## Verification

- `npm run verify:block`
- `npm run verify:live-dashboard` after rebuilding or restarting the affected dashboard service.
