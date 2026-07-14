# Block 3-2n-6E Design Review

> Reviewed scope: 3-2n-6E umbrella and children 6E-1 through 6E-3.
> Review date: 2026-07-13.
> Outcome: Ready to implement in order after the 5D-3 recurring-worker rollout decision. The review found historical contract drift and resolved it through an additive contract-first migration rather than a CSS-only alignment patch.

## Intended Outcome

Every current dashboard detail entry point resolves one canonical media identity and opens one accessible, responsive detail workspace. Entry context may change initial emphasis, but data truth, geometry, hierarchy placement, scroll ownership, routing compatibility, and category semantics stay aligned everywhere.

## Review Matrix

| Dimension | Finding / Flag | Resolution In Tickets |
| --- | --- | --- |
| Clarity | “Align everywhere” could mean identical page layouts, identical modal content, or one shared workspace. | 6E defines one shared modal shell and canonical truth; page layouts remain distinct and category/entry presenters may change emphasis only. |
| Scope | Identity, API, shell, all caller migration, duplicate removal, and regression are too large for one implementation turn. | Split into 6E-1 contract/resolver, 6E-2 shell plus non-Progress callers, and 6E-3 Progress migration/retirement. |
| Acceptance criteria | “Looks aligned” is subjective and untestable. | Compare stable semantic fields, one physical dialog, URL behavior, fetch isolation, focus, scroll ownership, and geometry across explicit viewports. |
| Assumptions | Current cards use rating keys, group keys, episode keys, and audiobook IDs interchangeably. | 6E-1 inventories callers and locks a discriminated canonical identity before browser migration. |
| Risks | A universal endpoint could eagerly assemble huge histories/hierarchies. | Base response stays bounded; hierarchy remains lazy and selected-identity-only. |
| Drift | The work could become a dashboard redesign, router rewrite, component framework, or progress recalculation. | Explicitly exclude those expansions; use existing service/browser architecture and plain category presenters. |
| Dependencies | 6D-4 currently targets the Progress-only modal that 6E removes. | 6E-3 precedes 6D-4 and records the shared Audiobook presenter seam; 6D docs are updated. |
| Opportunities | Shared shell can later host resume context and reduce repeated accessibility fixes. | Preserve an explicit presenter extension point without building a plugin system. |
| Blast radius | Dashboard service/types/routes, server HTML, JS, CSS, fixtures, URLs, focus, and tests are affected. | Contract-first additive route, non-Progress migration first, Progress retirement last, mandatory block/live gates. |
| Compatibility | Existing `selected`, `progressDetail`, detail endpoint, and Progress expansion links may exist in history/bookmarks/tests. | Keep legacy parameters and endpoints read-compatible; write canonical `detail` links and normalize legacy state with replace semantics. |
| Edge cases | Stale keys, duplicate titles, child-to-parent mapping, hidden-only identities, unsupported categories, partial section failures, and unmounted origin cards were unspecified. | Add bounded resolver outcomes, source-safe absence, section-local failure, and stable focus fallback tests. |
| Security | A broader detail response might expose paths, raw adapter errors, hidden users, or operational data. | Public-read allowlist, bounded errors, alias/visibility filtering, no private paths/secrets/Discord IDs, no mutations. |
| Performance | One universal workspace could refetch page buckets or load every child before interaction. | Base-first render, one selected lazy hierarchy, cache reuse, fetch-count assertions, no cross-card expansion. |
| Testability | Full category-by-surface Cartesian coverage would be expensive and brittle. | Pairwise matrix: one audiobook across all surfaces, all categories through one shell, targeted episodic/Movie and legacy-route cases. |
| Reversibility | Removing the Progress dialog before the shared shell is proven would make rollback risky. | 6E-2 proves the shell while Progress remains; 6E-3 removes duplication only after migration coverage. No schema rollback is needed. |
| Sequencing | UI-first work would duplicate identity/progress rules again. | Hard order 6E-1, 6E-2, 6E-3; 6E completes before 6D-4. |
| Maintainability | A generic presenter registry could obscure a small number of categories. | Use explicit small category presenters plus shared primitives and one renderer entry point. |
| Overengineering | New database identity tables, GraphQL, frontend frameworks, tabs, plugin registries, or endpoint deletion are unnecessary. | No schema migration or framework change; additive read route and compatibility adapters only. |

## Flagged Findings And Specific Fixes

### 1. Historical requirements contradict each other

- **Evidence:** Block 3-2k says all layouts must reuse one detail workspace. Block 3-2n-4 also forbids a separate Progress detail modal. Block 6C later explicitly widens only Progress, preserves a separate media-detail dialog, and tests a 680px-versus-1180px difference.
- **Failure mode:** Both implementations can be locally correct while the product remains globally inconsistent.
- **Fix adopted:** 6E restores the earlier universal ownership rule. 6E-3 intentionally replaces the temporary 6C modal-width invariant rather than weakening its test silently.

### 2. “Everywhere” was not an executable inventory

- **Current known callers:** Overview recent playback, Activity/Timeline rows that invoke detail, Library cards, and Progress cards. The implementation must discover any additional call sites by source search before editing.
- **Fix adopted:** 6E-1 creates and tests the definitive inventory; 6E-2/3 use it as a migration checklist.
- **Stop condition:** An unmapped caller or separate server-rendered detail page requires a ticket update, not silent omission.

### 3. Canonical identity cannot be display-title based

- **Problem:** Duplicate titles, renamed media, episode/track rows, and author/album fields make title-based merging unsafe.
- **Fix adopted:** Use discriminated stable keys with one serialized grammar: `movie:<ratingKey>`, `series:<category>:<grandparentRatingKey>`, and `audiobook:<audiobookId>`. Card selectors are inputs to a resolver, not identity truth; titles and library labels are never key segments.
- **Edge guard:** Test duplicate titles, punctuation, stale child keys, and category separation.

### 4. One workspace does not mean one undifferentiated payload

- **Problem:** Movies, episodic media, and audiobooks have different hierarchy and progress semantics; forcing one flat shape could fabricate fields or produce optional-field sprawl.
- **Fix adopted:** One common response envelope with category-discriminated presenter data and explicit capabilities. Unknown and unsupported fields remain absent rather than zero/default.

### 5. A CSS-only fix cannot achieve the intended outcome

- **Problem:** Matching width would leave separate renderers, routes, progress precedence, close/focus handlers, and tests.
- **Fix adopted:** 6E-1 unifies truth, 6E-2 unifies shell ownership, and 6E-3 retires the duplicate implementation.

### 6. Route migration can create history loops

- **Problem:** Overview currently uses `selected`; Progress uses `progressDetail`. Writing both or pushing during normalization can duplicate Back/Forward entries.
- **Fix adopted:** New navigation writes `detail`; legacy values remain read aliases and normalize with replace semantics. The current hash layout supplies entry context, so no second context parameter is required.

### 7. Hierarchy placement and scroll requirements needed reconciliation

- **Problem:** Project standards require hierarchy in the left/reference column, sticky reference content, content-first height, and intentional scrolling. Separate independently scrolling columns create competing behavior.
- **Fix adopted:** One inner workspace scroller owns vertical movement; desktop uses proportional columns with sticky artwork/reference behavior and hierarchy in the left column. Long hierarchy starts bounded/collapsed rather than creating a second dominant scroller.
- **Test:** Short/long fixtures at 320-1440px assert scroll owner, body lock, overflow, padding, and excessive-empty-space thresholds.

### 8. Universal detail must not become universal eager loading

- **Problem:** Combining existing detail and Progress responses could load large TV/audiobook hierarchies and histories before the user needs them.
- **Fix adopted:** Base workspace response is bounded and interactive first; hierarchy remains a separate selected-identity lazy read. Tests assert no unrelated page or hierarchy fetch.

### 9. Partial failures must remain local

- **Problem:** One hierarchy or evidence query failure could blank the whole universal modal.
- **Fix adopted:** Identity/header/common summary is the stable shell; hierarchy and evidence have independent bounded loading/unavailable states. No raw error details reach public UI.

### 10. Test coverage can become overengineered

- **Problem:** Five categories multiplied by four or more surfaces, routes, and viewports would create a slow brittle matrix.
- **Fix adopted:** Use pairwise coverage: one canonical audiobook across all surfaces; all categories through one shell; targeted episodic/Movie parity; legacy/canonical route cases; representative short/long desktop/narrow geometry.

### 11. 6D sequencing changed

- **Problem:** 6D-4 is written against the Progress detail modal and would recreate drift if implemented first.
- **Fix adopted:** Complete 6E-1 through 6E-3 before 6D. 6D-4 then extends the shared Audiobook presenter. The 6D transcription/worker architecture is otherwise unchanged.

## Edge-Case Expectations

- **Duplicate title:** Separate canonical keys remain separate even when display copy matches exactly.
- **Episode or audiobook track entry:** Resolver opens the top-level series/book workspace while retaining selected-item context only if the contract explicitly supports it.
- **Stale/deleted identity:** Show bounded unavailable state or close safely; never open an unrelated title.
- **Hidden-only playback:** Hidden people and their evidence are absent; the media identity may still render if independently visible/canonical.
- **Unknown totals:** No zero, complete state, or percentage is fabricated.
- **Unverified audiobook:** Track/file fallback remains explicit; no chapter claims.
- **Partial endpoint failure:** Header/common summary survives hierarchy/evidence failure.
- **Origin card paged out:** Close returns focus to a stable workspace heading or nearest safe control without changing pagination.
- **Legacy and canonical parameters together:** Canonical `detail` wins if valid; conflicting legacy values are ignored and normalized once.
- **Rapid open/change/close:** Abort stale fetches; late responses cannot replace the active identity or reopen a closed dialog.
- **Narrow viewport/zoom/long strings:** One column, no horizontal overflow, bounded truncation/wrapping, reachable close control.

## Blast Radius And Compatibility Map

| Area | Expected Change | Compatibility Guard |
| --- | --- | --- |
| API types/service | Add canonical identity/workspace contract and resolver. | Additive types/routes; existing responses remain supported. |
| Server routes | Add localhost public-read workspace route. | No new tool name, mutation, permission, or external call. |
| Server HTML | End with one physical detail dialog. | Remove Progress dialog only in 6E-3 after migration tests. |
| Browser state | Write canonical `detail`; read legacy selectors. | Preserve layout filters, pagination, expansion, reload, Back/Forward. |
| Browser rendering | One shell, explicit category presenters. | Existing evidence/source semantics remain authoritative. |
| CSS/layout | Shared content-first geometry and one inner scroll owner. | Semantic geometry assertions, not broad pixel snapshots. |
| Tests/fixtures | Add identity/parity/route/geometry coverage. | Pairwise matrix keeps runtime bounded. |
| SQLite/workers/adapters | No change. | Any required persistence or worker change stops the block. |

## Reversibility

- 6E-1 is additive and can be disabled/reverted without browser change.
- 6E-2 migrates non-Progress callers while the old Progress path remains available.
- 6E-3 removes only duplicate browser/HTML/CSS code after the shared path is proven; legacy server reads remain for rollback compatibility.
- No database migration, data rewrite, audit backfill, or external-system rollback is required.

## Sequencing And Exit Decisions

1. Finish or explicitly decline the remaining 5D-3 recurring-worker enablement gate and record the decision.
2. Implement 6E-1; stop if selectors cannot resolve deterministically without new persistence or private data.
3. Implement 6E-2; prove shell/category behavior on non-Progress callers while Progress remains unchanged.
4. Implement 6E-3; migrate Progress, remove duplicate dialog code, and pass cross-surface/live gates.
5. Implement 6D-1 through 6D-4 in their existing internal order; 6D-4 extends the 6E shared Audiobook presenter.
6. Run 3-2o only after both corrective sequences are complete.

## Ticket Split Decisions

- **Accepted split:** Contract/resolver, shell/presenters, and Progress migration/regression are separate because each has an independently testable exit and rollback boundary.
- **Rejected split:** Separate ticket per category would repeat shell context and create integration overhead; explicit presenters inside 6E-2 are small enough together.
- **Rejected split:** Separate CSS-only alignment ticket would pass geometry while preserving architectural drift.
- **Deferred ticket:** Legacy endpoint removal/deprecation requires usage evidence and is not needed for alignment.

## Readiness Conclusion

The intended outcome is achievable with the three-child split. The tickets are testable, additive-first, reversible, and bounded. The largest remaining implementation risk is identity resolution from historical selectors; 6E-1 is deliberately the first gate, and failure to resolve deterministically is a stop condition rather than permission to merge by title.
