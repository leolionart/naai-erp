# Tests

- `RUN_DB_INTEGRATION=1 MIGRATE_TEST_DATABASE_URL=<scratch> vitest src/migrate-on-start.test.ts` — passed (empty DB, concurrent starts, re-apply of the two newest migrations)
- `vitest src/executive-metrics src/financial-statements src/operating-dashboard` on a scratch DB — 26 passed
- `node scripts/verify-release-workflow.mjs`, `verify-compose.mjs` — passed
- Full API integration run still has 10 failures in other modules (see risks).
