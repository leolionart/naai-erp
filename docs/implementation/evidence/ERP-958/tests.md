# Tests

- `pnpm --filter @naai-erp/api exec vitest run src/report-exports/management-workbook.test.ts` — passed (2 tests).
- `pnpm --filter @naai-erp/api exec tsc --noEmit` — passed.
- Integration coverage is registered as `T-INT-ERP-958-002`; run with `RUN_DB_INTEGRATION=1` when a PostgreSQL test database is available.
