# Block 2-6: Co-Watching Intelligence

> Status: Implemented on 2026-06-27.
> Result: Implemented.
> Verification: `npm run verify:tools` and `npm test` - passed.
> Notes: Implemented CowatchingIntelligenceService to correlate overlapping play observations, exposing explicit vs inferred co-watching with timing details, reasons, and bounded confidence. Exposed via GET /api/cowatching and cowatching CLI command.

## Goal

Answer who watched together using Discord confirmations when available and cautious inference when independently observed sessions align.

## Scope

- Separate observed playback, explicit confirmation, Plex state synchronized by CoWatcher, and inferred participation.
- Correlate different users' sessions using stable content identity and configurable overlap/proximity rules.
- Return supporting IDs, rule version, reasons, and bounded confidence for every inference.
- Treat "none", dismissal, missing observations, and Plex watched flags as distinct evidence states.
- Expose read-only co-watching queries by person, content/show, and date range through matching CLI and HTTP surfaces.
- Finalize Phase 2 tool contracts, permissions, and a cheap contract verification command.

## Out Of Scope

- Surveillance signals, Plex mutation from inference, presenting inference as fact, ML confidence models, and recommendations.

## Likely Files Or Areas

- `src/service/`
- `src/logic/`
- `src/server/routes.ts`
- `src/cli/cli.ts`
- `src/types/`
- `tests/`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`
- `docs/permissions.md`
- `docs/data/`

## Acceptance Criteria

- Confirmed and inferred participants are distinct and provenance-labeled.
- Inference requires independent evidence, matching stable content, and qualifying temporal alignment.
- Every inference exposes non-secret support, timing relationship, rule version, and confidence.
- A synchronized Plex flag alone never proves playback or co-watching.
- Inference triggers no mutation or Discord resolution.
- Contracts are stable, documented, bounded, and automatically checked.

## Verification

- `npm run build`
- `npm test`
- `npm run verify:tools`
- `node dist/cli/cli.js cowatching --days 7 --pretty`
- Manual: compare confirmed, inferred, non-overlapping, dismissed, and Plex-sync-only fixtures.