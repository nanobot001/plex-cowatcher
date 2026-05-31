# Block 1-3: Discord Co-Watch Flow

> Status: Implemented on 2026-05-31.
> Result: Implemented with limitations.
> Verification: `npm test` - passed; `node dist\cli\cli.js health` with a temporary local DB - passed.
> Notes: Discord prompt sending, interaction resolution, message editing, prompt idempotency, and audit records are implemented; a real Discord post was not run in this pass and remains gated on configured `.env` approval.

## Goal

Turn pending watch events into Discord co-watch prompts and resolve selected household co-watchers through the shared service layer.

## Scope

- Add a safe test prompt path for the configured Discord channel.
- Send prompts for pending `watch_events` when Discord is enabled.
- Support typical co-watch users, everyone, no one, dismiss, and open-in-browser/admin actions.
- Resolve Discord selections through `cowatchService.resolvePrompt`.
- Edit the Discord message with selected users and per-target sync results.
- Record audit entries for prompt creation, resolution, dismissals, and failures.

## Out Of Scope

- Verifying live Plex mark-watched behavior.
- History copy preview/apply.
- Rich Discord DM or per-user notification behavior.
- Public web exposure.

## Likely Files Or Areas

- `src/discord/bot.ts`
- `src/discord/prompts.ts`
- `src/discord/interactions.ts`
- `src/service/cowatchService.ts`
- `src/service/auditService.ts`
- `src/server/routes.ts`
- `README.md`

## Acceptance Criteria

- A test Discord prompt can be sent when Discord config is present and enabled.
- A pending watch event can produce one prompt.
- Selecting one or more users creates or updates `cowatch_confirmations`.
- No-one and dismiss paths do not attempt Plex sync.
- Re-resolving the same prompt is idempotent.
- `npm run build` and `npm test` pass.

## Verification

- `npm run build`
- `npm test`
- Manual Discord test prompt with `.env` configured.
