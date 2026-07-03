# Testing

Test strategy, verification commands, fixtures, and manual QA flows live here.

Fixture screenshot coverage for the dashboard overview lives in `capture_fixture_states.cjs`, which boots the real app against temp SQLite fixtures and writes desktop plus narrow screenshots to `captures/fixtures/`.

The mandatory numbered-block gate is `npm run verify:block`. Its deterministic browser coverage lives in `tests/e2e/dashboard-regression.spec.mjs` and is governed by `dashboard-regression-contract.md`.

`npm run verify:live-dashboard` is a separate read-only smoke test for the running localhost service. It is never part of the isolated fixture suite and must not mutate live state.
