# Block 3-2n-6I: Exact Audiobook Position Evidence Capture

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-2n-6H defines the canonical progress snapshot and rewind semantics that captured evidence must feed.
> Notes: Second block in the project-wide audiobook-progress sequence. Capture must remain additive, provenance-preserving, disabled or inert until configured, and reusable by the later 3-2n-6D resume-context sequence.

## Goal

Capture trustworthy audiobook playhead positions for future playback so CoWatcher can distinguish forward progress, rewinds, revisits, stale history percentages, and exact stopping points without manufacturing offsets from listening duration.

Use the narrowest proven Tautulli/Plex capability. Preserve existing history ingestion and raw observations, and make capture failure degrade to the existing approximate/unknown model rather than interrupt playback ingestion.

## Required Evidence-First Preflight

Before choosing or implementing the capture route:

- Re-run a read-only audit against the configured Tautulli version and one active audiobook session.
- Record the exact payload shapes and units exposed by:
  - Tautulli playback-stop notification/custom-webhook parameters, if available;
  - Tautulli `get_activity` for active playback;
  - Tautulli `get_history` for the corresponding completed session.
- Confirm stable user, rating-key/GUID, session, start/stop timestamp, duration, and `view_offset` identity fields.
- Prove offset/duration units with a bounded canary rather than relying on names or prior documentation.
- If neither stop notification evidence nor bounded activity sampling can provide a stable exact position identity, stop and re-scope instead of adding heuristic capture.

## Preferred Capability Order

1. A source playback-stop notification/webhook carrying an exact direct offset and stable session/item/listener identity.
2. A bounded final `get_activity` snapshot associated with the same session when stop delivery is unavailable or incomplete.
3. Existing 6G approximate/unknown history evidence as fallback, clearly labeled and never upgraded to exact.

The implementation may select a different order only if the preflight evidence proves it safer for the configured source.

## Scope

- Add one privacy-safe localhost trusted-ingress path or reuse an existing compatible path for validated audiobook position events.
- Authenticate or secret-gate any notifier route without exposing the secret in logs, responses, checked-in configuration, or audit payloads.
- Normalize exact position evidence with:
  - listener identity;
  - audiobook/item identity;
  - source session identity when available;
  - observed/start/stop timestamps;
  - direct offset and duration with proven units;
  - source type and capture reason;
  - media revision linkage when resolvable.
- Dedupe repeated notification delivery and tolerate out-of-order stop/activity/history arrival.
- Preserve evidence additively. Do not overwrite a conflicting non-null source field or backfill invented `view_offset` values into historical observations.
- Reuse existing observation/event persistence where it can retain distinct source identity and provenance. Add one narrow additive position-evidence table only if the preflight proves the existing model cannot represent multiple source events without mutation or ambiguity.
- Feed captured evidence into the 6H evaluator without making dashboard surfaces query the capture mechanism directly.
- If activity sampling is required, extend the existing low-frequency watcher/runtime rather than creating a high-frequency second worker; bound calls, retain PM2 single-process behavior, and make sampling independently disableable.
- Add source-honest health/status evidence and safe structured errors. No private path, token, upstream URL, raw payload, or account identifier may appear in public-read output.
- Document the exact Tautulli notifier configuration and reversible enable/disable procedure.
- Perform one explicit positive live canary and one structurally different stale/missing-offset negative canary before enabling recurring behavior.

## Out Of Scope

- Service/API consumer migration belongs to Block 3-2n-6J-A; dashboard presentation and cross-surface browser migration belong to Block 3-2n-6J-B.
- Retroactively inventing exact offsets for historical rows.
- Rewriting existing `playback_observations`, manual database edits, or modifying Tautulli's database.
- High-frequency polling, a new general event bus, a new proof worker, or a new chapter-source system.
- Transcript generation, clipping, resume excerpts, or 3-2n-6D job execution.
- Movies, TV, Anime, or Classic TV capture changes.
- Plex watched-state mutation or progress writes back to Plex.

## Likely Files Or Areas

- `src/adapters/tautulliAdapter.ts`
- `src/service/ingestionService.ts`
- `src/service/audiobookProgressEvidence.ts`
- `src/server/routes.ts`
- `src/server/app.ts`
- `src/types/index.ts`
- `src/db/schema.sql` and `src/db/database.ts` only if additive persistence is proven necessary
- `src/utils/config.ts` and `.env.example`
- `src/service/healthService.ts`
- `tests/run-tests.mjs`
- `docs/tool-adapter-memory.md`
- `docs/tool-surface.md`
- `docs/tool-manifest.yaml`
- `docs/permissions.md`
- `docs/event-log-schema.md`
- `docs/production/README.md`

## Acceptance Criteria

- The preflight records exact configured-source payload shapes, units, identity fields, and unsupported cases before implementation commits to a route.
- One exact stop canary produces a validated position tied to the correct listener, audiobook, session, and compatible media revision.
- A sequence containing a trusted backward offset is retained as rewind evidence rather than discarded by a high-water-only rule.
- Duplicate and out-of-order deliveries are idempotent and cannot move the evaluated as-of position incorrectly.
- Capture failure, malformed input, missing identity, invalid units, stale revision, or unavailable source leaves existing ingestion and approximate/unknown progress working.
- Historical observations receive no invented offsets and remain field-for-field unchanged.
- Captured exact evidence is clearly distinct from estimated `play_duration` and raw `percent_complete` evidence.
- Disabled/unconfigured capture performs no extra polling, accepts no unauthenticated write, and leaves current behavior unchanged.
- Any added persistence is additive, bounded, revision-aware, indexed for its access path, and justified in the block result.
- Public/tool-facing outputs remain structured and privacy-safe; published tool names and existing response compatibility remain stable.
- The implementation does not add a second high-frequency runtime or alter non-audiobook ingestion.
- The exact-position capability is reusable by 3-2n-6D-3; that later block does not need to create a competing stop-capture path.

## Rollout And Escalation Conditions

- Keep recurring capture disabled until deterministic tests, source configuration review, and an explicit live canary pass.
- Obtain explicit approval before changing the user's Tautulli notifier configuration or enabling recurring activity sampling.
- Stop before adding a worker, broad schema, or external dependency if the existing watcher, route, and state layer can satisfy the verified contract.
- Stop if the source cannot prove units or stable listener/item/session identity.

## Verification

- `npm run verify:block`
- Adapter/route/service fixtures for valid stop, invalid secret, malformed units, duplicate delivery, out-of-order arrival, rewind, stale revision, disabled mode, and source unavailability
- Structured tool/privacy contract checks when health or operations output changes
- One backed-up, explicit live audiobook canary
- Restart only `plex-cowatch-service` if deployment changes, then run `npm run verify:live-dashboard`
