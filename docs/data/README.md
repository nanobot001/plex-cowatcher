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

## Audiobook Data Contract

Audiobook support adds two linked layers:

- `content_catalog` remains one row per Plex track and now stores private `file_path` plus nullable `audiobook_id`.
- `audiobook_books` stores one canonical row per local folder-derived book or exact-ASIN match, and tracks hierarchical series relationships.

Hierarchical Modeling Columns on `audiobook_books`:
- `parent_series_title`: Standardized top-level series name (e.g., `"Discworld"` or `"Mistborn"`).
- `subseries_title`: Optional subseries name (e.g., `"Ankh-Morpork City Watch"` or `"Wax and Wayne"`).
- `related_work_classification`: Optional classification for related companion works (e.g., `"companion"` for `"Secret History"`).
- `hierarchy_provenance`: Indication of how the hierarchy was resolved (`"metadata"`, `"mapping"`, `"pattern"`, or `"none"`).

Rules to preserve:

- `file_path` and `folder_path_hint` are trusted local-only data and must never be exposed through public-read tools, API responses, or tool-facing logs.
- `playback_observations` does not store `audiobook_id`. Queries must join observations through `content_catalog` so rematching a book does not leave stale denormalized IDs behind.
- `source_provenance` identifies whether the current book metadata came from `folder_path`, `audnexus`, or `google_books`.
- `enrichment_status` records whether canonical enrichment is still `pending` or already `enriched`.
- `identity_status` keeps `identified`, `pending`, and `conflict` separate from enrichment and chapter-proof state. `identity_provenance` is limited to `folder`, `asin`, or `plex_guid`.
- `current_media_revision` is a private SHA-256 digest over stable track GUIDs or hashed private paths, duration, and deterministic order. Rating keys and display metadata are excluded.
- `audiobook_discovery_state` and `audiobook_discovery_runs` hold restart-safe lease, cooldown, trigger, result-count, and safe-error state.
- `audiobook_media_revisions` and `audiobook_media_revision_items` preserve the immutable ordered manifest behind each revision. Item paths are private SQLite state; only allowlisted manifest status and outcome codes may leave the service boundary.
- `audiobook_discovery_outbox` contains at most one event per `(audiobook_id, media_revision)`. Its manifest status distinguishes ready, unsupported multi-file, unavailable, and superseded revisions without storing raw paths or diagnostics.
- `audiobook_chapter_revisions` and `audiobook_chapter_revision_items` retain revision-bound chapter history. `audiobook_books.active_chapter_revision_id` selects the revision projected into the legacy v13 `audiobook_chapter_sources` and `audiobook_chapters` cache tables.
- Progress may consume the legacy active chapter projection only when its selected chapter revision matches `current_media_revision`. A changed revision makes historical chapters ineligible but does not delete them; books without a matching revision use Plex track/file evidence.
- Only a fully successful library scan may update absence/last-seen conclusions. Discovery never deletes historical catalog, playback, chapter, or audit rows.
- Low-confidence or unmatched books remain usable via folder metadata and must not be silently assigned guessed canonical metadata.
- Precedence for hierarchy updates: `metadata` (highest) > `mapping` > `pattern` > `none`. Updates are only applied when the new provenance has higher precedence or equal (and identical). Disputed classifications of equal authority generate a conflict and are ignored.
- Mappings: Discworld subseries (Guards, Witches, Death, Rincewind, Tiffany, Moist), Mistborn subseries (Era 1, Era 2/Wax and Wayne, companion classification), and Wheel of Time (parent series only) are resolved deterministically.
