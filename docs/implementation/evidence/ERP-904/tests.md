# Test evidence

- Domain unit & property suite (`pnpm --filter @naai-erp/domain test`): **38 test files, 183 passed**.
- Database schema & migration integration suite on clean disposable PostgreSQL DB (`RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/database test`): **12 test files, 38 passed** (including `src/schema.integration.test.ts` 17/17).
- API service & PostgreSQL integration safeguard suite on clean disposable PostgreSQL DB (`RUN_DB_INTEGRATION=1 npx vitest run --fileParallelism=false` across `commercial-document`, `expense`, `executive-metric`, `banking`, `banking-control`, `reconciliation`, `g4-controls`, `erp-346-cross-module`, and `fiscal-period` service/integration suites): **13 test files, 100 passed**.
- Prior E2E evidence (`e2e/executive-metrics.spec.ts`, `e2e/journals-responsive.spec.ts`, `e2e/expense-category-policies.spec.ts`) remains recorded from the earlier gate pass.
