# Block 3-2n-6E-2A: Rich Detail Hero And Watcher Lanes

> Status: Implemented on 2026-07-14.
> Result: Implemented.
> Verification: `npm run verify:block` passed (104/104 service/integration tests, 43 dashboard regression tests with one intentional skip, dashboard syntax, and tool contracts); `npm run verify:live-dashboard` passed after PM2 restart.
> Notes: Added private poster/backdrop artwork variants with an honest Audiobook gradient/square-cover fallback, a full-width detail hero, and stable People-ordered watcher lanes with evidence tooltips and keyboard/touch selection. Progress remains isolated for 6E-3.

## Goal

Make the shared non-Progress detail workspace visually media-rich and more legible for episodic watcher evidence, while preserving canonical source truth, the existing 6E-2 shell contract, and the future 6E-3 Progress migration seam.

## Dependencies And Entry Gate

- 6E-2 shared shell/category presenters are implemented and verified.
- People ordering, hidden-user filtering, watcher evidence states, latest observation timestamps, and existing one-scroller/focus contracts are available as current source behavior.
- 6E-3 remains blocked until this block's shared visual contract and verification pass.

## Scope

- Add a full-width landscape hero/banner using a private proxied Plex backdrop candidate; overlay category/title/subtitle with a readable gradient and keep the close control accessible.
- Add distinct poster and backdrop artwork contract fields while preserving `artworkUrl` compatibility through 6E-3. Backdrop resolution may use `art`, `parentArt`, or `grandparentArt` only; it must never stretch portrait `thumb` artwork. Preserve private proxying and variant-specific caching.
- For Audiobooks without genuine landscape artwork, show an honest category/series gradient and a smaller square cover reference; do not fabricate or stretch a banner.
- Replace repeated per-person watcher badges with stable unlabeled person lanes ordered like the People workspace. Keep lane positions consistent across every episode/chapter row and exclude hidden users.
- Make each watcher marker hover/focus discoverable with person, state, latest observed time, and watch count. Use non-color state icons/shapes for watched, repeated, partial, uncertain, and unknown.
- Add click/tap selection that highlights one person's state down all expanded seasons/chapters; show an accessible selected-person chip; clear with repeat activation or Escape.
- Support keyboard roving focus and touch interaction without creating an excessive Tab-stop matrix.
- Keep one `.detail-workspace-scroll`, responsive desktop/narrow layout, source-honest missing timestamps, canonical routes, focus restoration, and the existing Progress dialog unchanged.

## Out Of Scope

- Migrating Progress, removing `#progress-dialog`, changing `progressDetail`, or adding Progress-specific emphasis; 6E-3 owns that.
- Changing progress calculations, watcher-state inference, hierarchy inference, or stored People ordering semantics.
- Adding generated artwork, external artwork providers, raw Plex URL exposure, a database migration, transcript/resume UI, or 6D work.
- Adding full playback-history expansion beyond bounded latest-observation/watch-count evidence.
- Reworking page cards, navigation, filters, or the canonical detail identity resolver.

## Likely Files Or Areas

- `src/types/api.ts`
- `src/server/routes.ts`
- `src/service/dashboardService.ts`
- `src/web/static/dashboard.js`
- `src/web/static/styles.css`
- `tests/e2e/dashboard-regression.spec.mjs`
- `tests/e2e/live-dashboard-smoke.mjs`
- `docs/testing/dashboard-regression-contract.md`

## Risks And Drift Controls

- **Artwork honesty:** backdrop URLs are proxied; missing/404 backdrop uses gradient fallback; poster art is never silently stretched.
- **Lane identity:** use stable user IDs, not display names, for ordering/selection; follow current People default/custom order and append newly seen users deterministically.
- **Evidence honesty:** latest observed time/watch count come only from existing watcher evidence; null values remain explicit.
- **Interaction density:** unknown states stay quiet, meaningful states remain visible, and keyboard focus uses roving navigation.
- **Progress isolation:** do not touch Progress dialog markup/renderer/routes.
- **Responsive safety:** assert no horizontal overflow, clipped popovers, nested scroll, or page scroll behind the modal.
- **Reversibility:** additive artwork/evidence fields and UI changes remain independently revertible before 6E-3.

## Acceptance Criteria

- Desktop detail modal has one full-width landscape hero region; title/category are readable over it; close control remains visible and keyboard accessible.
- Real backdrop artwork is used only when supplied by proxied `art`/parent-art sources. Portrait-only or missing-art cases use the defined gradient fallback; Audiobook fallback retains a smaller square cover.
- Canonical response exposes distinct poster/backdrop fields without exposing raw Plex URLs; existing `artworkUrl` consumers remain compatible.
- Watcher markers have stable positions matching People ordering across all visible episode/chapter rows; no visible initials header is required.
- Hover/focus/tap evidence identifies person, state, latest observed time, and watch count when available; missing timestamps are not fabricated.
- Click/tap selection highlights the chosen person across expanded hierarchy rows, supports Escape/repeat clear, and remains accessible by keyboard.
- Hidden users never appear; state meaning does not depend on color alone.
- At 320px, 390px, 768px, 1024px, and 1440px the hero, popovers, watcher lanes, and hierarchy remain bounded, readable, and horizontally overflow-free with exactly one intended scroll owner.
- Existing 6E-2 route, focus, source, lazy hierarchy, category presenter, and Progress isolation behavior remains compatible.
- `npm run verify:block` passes before the block is marked implemented.
- After deployed rebuild/restart, `npm run verify:live-dashboard` passes.

## Verification

- `npm run verify:block`
- Focused service/API tests for artwork variant precedence, missing-backdrop fallback, stable user IDs, and watcher evidence.
- Desktop/narrow Playwright tests for hero layout, Audiobook fallback, People-order lane alignment, hover/focus/tap/keyboard selection, hidden-user exclusion, and one-scroll/no-overflow geometry.
- Live read-only QA on one episodic title and one Audiobook with no genuine backdrop; then `npm run verify:live-dashboard`.
