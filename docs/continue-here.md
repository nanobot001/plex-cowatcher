# Continue Here

## Current State

- Block 3-1 audiobook differentiation is completed in code and the live database, with canonical local grouping, private path storage, conservative external enrichment, and a guarded CLI backfill flow.
- Build/test/tool verification already passed for the audiobook rollout; any future audiobook work now belongs in the hierarchy-follow-up block.
- The runtime remains a PM2-managed Windows-local service with shared CLI, HTTP, browser, and Discord service layers.

## Key Links

- Project charter: `docs/project-charter.md`
- Roadmap: `docs/roadmap.md`
- Block index: `docs/blocks/README.md`
- Current block: `docs/blocks/block-3-1-audiobook-differentiation.md`
- Next likely block: `docs/blocks/block-3-4-hierarchical-audiobook-series-modeling.md`

## Next Recommended Step

- Implement `docs/blocks/block-3-4-hierarchical-audiobook-series-modeling.md` to add parent-series, subseries, and related-work support for audiobook summaries and backfill.
- After hierarchy modeling is in place, revisit `docs/blocks/block-3-2-richer-browser-ui.md` if richer browsing or controls are still the next priority.

## Open Questions

- Whether the local Plex environment is ready for a live audiobook backfill dry-run and later apply.
- How broad the initial normalization catalog should be beyond the known Discworld-style hierarchy cases.