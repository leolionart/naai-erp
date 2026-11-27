- `pnpm --filter @naai-erp/contracts exec vitest run src/paging.test.ts` (6 tests)
- `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/expenses/expense-list.integration.test.ts` on a scratch PostgreSQL 16 cluster (6 tests)

## Test-suite repair (follow-up)
- API integration suite on a scratch PostgreSQL 16: 410 passed (previously `owner-custody` and `owner-funding` failed).
- Playwright (desktop and mobile): 130 passed. Specs were realigned with the shipped UI (localized labels, `/documents` redirect to `/revenue`, dialog close buttons), the clock is pinned for the August-2026 dashboard fixtures, and the suite runs with 2 workers and longer timeouts because it targets `next dev`.
- Real defects found while repairing: dashboard `companyOwesOwnerMinor` was never returned by the API (card always showed 0); owner bank funding was missing from the dashboard confirmed settlement; two diverging `summarizeOwnerSettlement` copies dropped the dedicated custody ledger; CORS did not expose `Content-Disposition`; list auto-paging ignored `data.nextCursor`.
