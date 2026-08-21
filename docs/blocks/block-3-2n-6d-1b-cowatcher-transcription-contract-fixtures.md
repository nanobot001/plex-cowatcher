# Block 3-2n-6D-1B: CoWatcher Transcription Contract Fixtures

> Status: Planned.
> Result: Not implemented.
> Dependency: Block 3-2n-6D-1A command contract verified in the audiobook repository.

## Goal

Give CoWatcher a sanitized, versioned fixture and documentation boundary for the external transcription command without adding invocation or durable state.

## Scope

- Add synthetic success, no-speech, truncation, unsupported-version, malformed, resource-policy, timeout, and safe-error fixtures.
- Document command identity, version, units, limits, safe/forbidden fields, and future trusted adapter boundary.
- Add a fixture-schema validator usable by 6D-2 tests.
- Ensure fixtures contain no real audiobook text, paths, raw errors, environment details, or generated media.

## Out Of Scope

- Child-process invocation, database migration, jobs/results, scheduler, CLI operation, health, dashboard, or live Whisper execution.

## Likely Files Or Areas

- `tests/fixtures/`
- focused contract validator/tests
- `docs/architecture/`, `docs/data/`, and `docs/tool-adapter-memory.md`

## Acceptance Criteria

- Every documented result class has a bounded sanitized fixture.
- Fixture validation rejects forbidden fields, oversized text/segments, invalid offsets, unsupported versions, and false resource claims.
- No runtime queue, process invocation, state, or UI is introduced.
- `npm run verify:block` passes.

## Verification

- `npm run verify:block`
- Fixture schema, bounds, forbidden-field, version, and compatibility tests

