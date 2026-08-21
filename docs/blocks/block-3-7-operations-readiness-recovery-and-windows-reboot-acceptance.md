# Block 3-7: Operations Readiness, Recovery, And Windows Reboot Acceptance

> Status: Planned.
> Result: Not implemented.
> Notes: Modern successor to superseded Block 1-6. Audit the current expanded system; do not reuse MVP-era architecture assumptions.

## Goal

Prove that the current Windows/PM2 household service can be operated, diagnosed, recovered, and restarted after a real Windows reboot with safe defaults and evidence-backed procedures.

## Evidence-First Entry Gate

- Inventory the current single service process, integrations, databases/migrations, workers, tools, scheduled behavior, health fields, backups, and operator documents.
- Compare configuration claims with live read-only state. A process being online or a setting being enabled is not proof that the underlying capability works.
- Record gaps before changing code; use existing health, CLI/tool, event, PM2, and backup mechanisms unless evidence shows they are insufficient.

## Scope

- Define one current startup/shutdown/restart path for the Windows/PM2 runtime and eliminate contradictory operator instructions.
- Expose bounded readiness for Plex, Tautulli, Discord, database/schema, watcher/capture, chapter proof, archive ingestion, and enabled workers without secrets or private paths.
- Distinguish configured, reachable, degraded, disabled, and recently successful states.
- Document backup ownership, pre-change backup, rollback, and service recovery. Archive payload restore remains owned by 3-6-5C.
- Add deterministic failure/recovery tests and a current operator checklist.
- Perform a separately authorized Windows reboot acceptance: service returns automatically, exactly one intended process runs, health is truthful, ingestion continuity is checked, pending work remains safe, and the dashboard/live gate passes.

## Out Of Scope

- New product features, public hosting, Linux/container deployment, cloud backup, archive disaster-restore implementation, or redesigning working integrations.
- Deleting retained data, enabling optional workers, sending Discord messages, mutating Plex, or rebooting Windows without explicit authorization.

## Likely Files Or Areas

- PM2 ecosystem/startup configuration
- `src/service/healthService.ts`, `src/server/app.ts`, and existing runtime controls
- `src/cli/cli.ts` and tool contracts only where readiness gaps require additive fields
- `.env.example`, `README.md`, `docs/production/`, and recovery/checklist docs
- deterministic service/tool tests

## Acceptance Criteria

- One documented Windows/PM2 procedure covers install/start/stop/restart/status/logs/backup/rollback/recovery without contradictory commands.
- Health distinguishes configuration from observed capability state and remains privacy-safe.
- Failure fixtures prove unavailable Plex/Tautulli/Discord, schema mismatch, stale worker state, and restart recovery without blocking unrelated reads.
- Backup and rollback responsibilities are explicit; no restore claim depends on an untested copy.
- `npm run verify:block` passes before live acceptance.
- After explicit approval, one Windows reboot proves automatic recovery, exactly one service process, truthful health, continuity checks, and `npm run verify:live-dashboard`.
- Implementation, deterministic verification, reboot authorization, reboot result, and operator readiness are reported separately.

## Verification

- `npm run verify:block`
- Read-only PM2/configuration/health/database inventory
- Backed-up, explicitly authorized Windows reboot checklist
- `npm run verify:live-dashboard`

