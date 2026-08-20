# Exact Audiobook Position Capture

Block 3-2n-6I adds a disabled-by-default, localhost-only Tautulli stop-webhook ingress for future exact audiobook positions. It stores evidence additively in CoWatcher's SQLite database and feeds the canonical 6H evaluator. It does not rewrite `playback_observations`, poll Tautulli, alter Plex state, or change the dashboard presentation.

## Source Preflight (2026-08-20)

The configured Tautulli v2.17.1 instance exposed `view_offset` as milliseconds and `duration_ms` in its notification parameter contract. A bounded active audiobook sample returned direct values whose ratio matched Tautulli's rounded progress percentage. The active row also carried a rating key, listener name/source user ID, session key, and timestamps. The corresponding finalized `get_history` row retained aggregate duration and percentage but omitted the exact offset and session identity. The existing stop notifier fired successfully but its current body did not include `view_offset`.

Therefore 6I uses a dedicated stop webhook carrying the direct notification offset. `get_history` remains approximate fallback evidence and no activity-sampling worker is added. Listener resolution uses the unique configured username, retains the Tautulli user ID only as private provenance, and rejects an identity conflict. Item resolution requires an audiobook catalog link and compatibility with the current media revision when one exists.

## CoWatcher Configuration

Keep capture disabled while preparing the notifier:

```dotenv
AUDIOBOOK_POSITION_CAPTURE_ENABLED=false
AUDIOBOOK_POSITION_CAPTURE_SECRET=<unique high-entropy secret of at least 16 characters>
```

The ingress is:

```text
POST http://127.0.0.1:8787/webhooks/tautulli/audiobook-position
Content-Type: application/json
```

Use a dedicated Tautulli webhook notifier, enable only the playback-stop trigger, and restrict it to the Audiobooks library. Tautulli's webhook agent does not provide a custom-header field, so the secret is supplied in the JSON body. Use this body template:

```json
{
  "secret": "<same secret as CoWatcher>",
  "event": "on_stop",
  "media_type": "{media_type}",
  "user_id": "{user_id}",
  "username": "{username}",
  "session_key": "{session_key}",
  "session_id": "{session_id}",
  "rating_key": "{rating_key}",
  "guid": "{guid}",
  "observed_at_unix": "{unixtime}",
  "started_at": "{started_timestamp}",
  "view_offset": "{view_offset}",
  "duration_ms": "{duration_ms}"
}
```

Do not reuse or edit an unrelated notifier. Changing Tautulli or enabling capture requires explicit operator approval.

## Canary And Enablement

1. Back up the CoWatcher SQLite database.
2. Deploy the code with capture disabled and verify `/api/health` reports `audiobookPositionCapture.status = disabled`.
3. Create the dedicated notifier but leave its trigger disabled.
4. Set the secret, enable CoWatcher capture, restart only `plex-cowatch-service`, and confirm health is `healthy` with no evidence-count change.
5. Send one structurally invalid/missing-offset test. It must return a bounded rejection, write no position evidence, and leave existing progress unchanged.
6. Enable the dedicated stop trigger for one audiobook canary. Play, move the playhead if useful, stop, and verify one new evidence row, a privacy-safe capture audit event, and the expected canonical chapter/position.
7. Repeat the same delivery and confirm it is reported as a duplicate with no second evidence row.
8. Run `npm run verify:live-dashboard` after the deployed restart.

If any identity, unit, revision, or offset check fails, disable the notifier trigger first, then set `AUDIOBOOK_POSITION_CAPTURE_ENABLED=false` and restart the service. Stored evidence remains additive for review; disabling capture does not delete or rewrite it.

## Response And Privacy Contract

- Disabled ingress returns `404`; enabled without a usable secret returns `503`; an invalid secret returns `401`.
- A new accepted event returns `202`; an idempotent duplicate returns `200`; stale revision evidence returns `409`; other malformed evidence returns `400`.
- Health exposes only status, configuration state, total evidence count, and last capture time.
- Audit events contain bounded status/error codes, not secrets, source account IDs, media titles, paths, URLs, or raw payloads.
- `docs/tool-manifest.yaml` is unchanged because this trusted notifier ingress is not a published `project.*` tool.

## Live Rollout Record (2026-08-20)

- Production SQLite was backed up to `data/backups/pre-audiobook-position-capture-2026-08-20T17-24-48-941.sqlite`; the backup was on migration 26 with 7,715 playback observations and passed `PRAGMA quick_check`.
- The disabled deployment applied migration 27, reported zero evidence rows, and remained healthy.
- Dedicated Tautulli webhook notifier 6 was created. Existing notifier 5 was fingerprinted before and after configuration and remained unchanged.
- Notifier 6 has only `on_stop` active, uses `POST`, and requires both `library_name is Audiobooks` and `media_type is track`.
- A missing-offset negative canary returned `AUDIOBOOK_POSITION_UNITS_INVALID`, wrote no evidence, and left playback observations unchanged.
- One real stop produced one revision-linked exact evidence row. Listener, audiobook, session, item, duration, offset bounds, and current media revision matched the active-session baseline; the canonical projection reported verified chapter 50 at 59%.
- Replaying the same delivery returned `duplicate` and retained one evidence row. Capture/rejection audit rows exposed none of the secret or private source/item/session identities.
- The final production database passed `PRAGMA quick_check`, CoWatcher health reported capture `healthy`, PM2 reported the service online, and `npm run verify:live-dashboard` passed.

Recurring exact audiobook stop capture is enabled. Disable notifier 6 first, then set `AUDIOBOOK_POSITION_CAPTURE_ENABLED=false` and restart only `plex-cowatch-service` if rollback is required.
