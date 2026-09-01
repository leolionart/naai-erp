# Tests

- `pnpm typecheck` — passed for all 10 packages.
- `pnpm --filter @naai-erp/api exec vitest run src/report-exports/management-workbook.test.ts src/operating-dashboard/operating-dashboard.service.test.ts` — passed.
- PostgreSQL dashboard integration suite is registered and runs with `RUN_DB_INTEGRATION=1`.
