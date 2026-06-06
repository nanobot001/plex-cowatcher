# Decisions

Record important tradeoffs and settled choices here.

## Plex Watched-State Mutation

Live Plex mark-watched remains disabled for MVP work until the household target-user token model is verified with a known safe media item.

The current repo supports a single `PLEX_TOKEN` for Plex API reads. That is enough to attempt user listing, metadata lookup, and watched-state lookup for the token's Plex context, but it is not enough evidence that a Discord/API/CLI request can safely mark watched for an arbitrary configured household target user. Because of that, `PLEX_MUTATION_MODE=mock` remains the default and the live mark-watched path returns `unsupported_mutation` instead of claiming success.

To revisit this decision, use:

```powershell
npm run build
node dist/cli/cli.js verify-plex-watched-state --target-plex-user-id <local-target-id> --rating-key <safe-rating-key> --pretty
```

Only add `--mark-watched` after choosing a safe media item and confirming which Plex account/token should own the watched-state mutation.
