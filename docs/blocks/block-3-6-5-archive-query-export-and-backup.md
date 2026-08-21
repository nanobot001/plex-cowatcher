# Block 3-6-5: Archive Query, Export, And Backup

> Status: Planned umbrella.
> Result: Not implemented directly.
> Notes: The original archive utility ticket has been split so read contracts, portable exports, and destructive recovery proof do not share one implementation gate.

## Goal

Make the historical archive inspectable, portable, and recoverable independently of current Plex availability.

## Child Blocks

1. **3-6-5A — Versioned Archive Query Contract:** Bounded, source-aware read contracts for people, media, dates, source, confidence, and evidence status.
2. **3-6-5B — Canonical JSON/CSV Export:** Privacy-safe portable exports whose schema remains interpretable after Plex identity changes or deletion.
3. **3-6-5C — Verified Backup, Restore, And Disaster Recovery:** Version-checked backup and isolated restore proof for the complete archive state.

Implement the children in order. Do not implement this umbrella directly.

## Shared Constraints

- Preserve raw evidence, canonical identity, aliases, uncertainty, and provenance.
- Public/read-safe output must not expose tokens, private paths, upstream private URLs, or raw errors.
- Writes and restore operations remain dry-run or isolated by default and require explicit authorization.
- Do not fold report delivery, achievement calculation, cloud synchronization, or retention deletion into this umbrella.

## Exit Gate

The umbrella is complete only after every child passes `npm run verify:block` and 3-6-5C demonstrates a restore into an isolated destination with explicit row, schema, integrity, and representative-query comparison.

