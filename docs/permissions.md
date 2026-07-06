# Tool Permissions

Every tool must have a risk level.

## Risk Levels

- `public_read`: safe for normal users, such as basic status or public recent events.
- `trusted_read`: may expose operational details, such as logs, local paths, config summaries, or debug traces.
- `write_action`: changes state but is not destructive, such as retrying a failed item or refreshing a cache.
- `admin_action`: controls runtime or configuration, such as restart, pause, resume, or polling changes.
- `destructive_action`: deletes, clears, purges, overwrites, or removes data.

## Rules

- `write_action` and above should support dry-run.
- `admin_action` and above should require explicit confirmation.
- `destructive_action` should always require explicit confirmation.
- Public outputs must not expose secrets, tokens, private paths, or sensitive local details.
- All write/admin/destructive calls should be recorded in `tool_calls`.

## Dashboard Actions

- People, person-pairing, and operations endpoints are `public_read` within the localhost dashboard boundary.
- People attributed contributions are computed read-only and cannot create observations, confirmations, adjudications, prompts, audit writes, or Plex mutations.
- Prompt dismiss and re-prompt endpoints are `write_action`. Both require explicit confirmation, lifecycle validation, idempotent retry behavior, and audit events.
- Co-watch review decisions are `write_action`. They default to dry-run and require `apply=true`, explicit confirmation, and a stable request ID before appending an adjudication.
- Asking for Discord review is a separate `write_action` with the same dry-run/apply confirmation contract. Discord interaction resolution is adjudication-only and has no Plex mutation authority.
