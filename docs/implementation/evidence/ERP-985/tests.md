# ERP-985 Tests

- `pnpm --filter @naai-erp/api exec vitest run src/common/base-currency-guard.test.ts`: Passed (unit coverage for `ApiExceptionFilter` 422 response + guidance, `commercial-documents`, quick ingestion, `expenses`, `journals`, `inbound-webhooks`).
- `RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp_erp985_test pnpm --filter @naai-erp/api exec vitest run src/common/base-currency.integration.test.ts src/operating-dashboard/operating-dashboard.integration.test.ts src/inbound-webhooks/inbound-webhook.integration.test.ts src/workbook-imports/workbook-import.integration.test.ts`: Passed (`T-INT-CUR-002` across all 5 entry points, VND pass-through, retry after converting to VND, and `BR-STAT-001` historical foreign-currency exclusion).
- `node scripts/verify-docs.mjs` & `node scripts/verify-solopreneur-gate-matrix.mjs`: Passed.
- `pnpm lint` & `pnpm typecheck`: Passed.
