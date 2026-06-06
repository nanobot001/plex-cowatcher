# Data

Schemas, contracts, payloads, storage rules, migrations, and sample data guidance live here.

## Plex Sync Result Contract

Plex watched-state writes are reported per target user and rating key. Callers should use the structured status and error code instead of parsing human text.

Current statuses:

- `mocked`: mock mutation mode accepted the request without writing to Plex.
- `already_watched`: Plex reported the item already watched for the checked account/token.
- `marked_watched`: reserved for a verified live mark-watched success.
- `missing_permission`: Plex rejected the configured token or required permission is missing.
- `target_unavailable`: the configured target has no usable Plex identifier for sync.
- `no_matching_media`: the rating key was not found in Plex.
- `plex_failure`: Plex returned an unexpected failure.
- `timeout`: Plex did not respond before the adapter timeout.
- `unsupported_mutation`: live mark-watched is intentionally disabled because the target-user account/token model is not verified.
- `failed`: legacy fallback for unexpected failures.

Discord prompt resolution includes `plexSyncStatus`, optional `errorCode`, and optional `error` for each selected target. History-copy apply stores failed item reasons using the structured error code when one is available.
