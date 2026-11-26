# ERP-982 Tests

## Unit & Contract Tests (`T-UNIT-PAY-003`)

- `pnpm --filter @naai-erp/domain test` -> 39 passed test files (187 passed tests, including `src/payment-evidence.test.ts` 4/4).
- `pnpm --filter @naai-erp/cli exec vitest run src/payment-evidence-cli.test.ts` -> 1 passed test file (3 passed tests covering `reports payment-evidence-gaps`, `expenses update-payment-evidence`, `documents update-payment-evidence`, and `workflow-policy update`).
- `pnpm --filter @naai-erp/api exec vitest run src/commercial-documents/quick-purchase-invoice.service.test.ts src/commercial-documents/commercial-document.service.test.ts src/expenses/expense.service.test.ts src/workflow-policy/organization-workflow-policy.service.test.ts` -> 4 passed test files (58 passed tests).

## Scratch PostgreSQL Migration & Integration Tests (`T-INT-PAY-001`, `T-INT-PAY-002`, Regressions)

- `pnpm db:check` -> `Migration directory is valid (77 entries).`
- Empty-database & idempotent migration on scratch PostgreSQL DB (`createdb naai_erp_982_scratch_... && pnpm db:migrate && pnpm db:migrate`) -> applied `0000` through `0075_payment_evidence_and_non_cash_threshold.sql` cleanly and idempotently.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://localhost:5432/$SCRATCH_DB pnpm --filter @naai-erp/api exec vitest run src/payment-evidence/payment-evidence.integration.test.ts src/payment-evidence/payment-evidence-reconciliation.integration.test.ts src/expenses/expense.integration.test.ts src/commercial-documents/commercial-document.integration.test.ts src/reconciliation/reconciliation.integration.test.ts src/financial-statements/financial-statement.integration.test.ts src/operating-dashboard/operating-dashboard.integration.test.ts` -> **7 passed test files, 45 passed tests, 0 failures**.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://localhost:5432/$SCRATCH_DB pnpm --filter @naai-erp/api exec vitest run src/funding-plans/funding-plans.integration.test.ts src/inbound-webhooks/inbound-webhook.integration.test.ts` -> **2 passed test files, 4 passed tests, 0 failures**.

## Repository Quality Gates

- `node scripts/verify-docs.mjs` -> passed.
- `node scripts/verify-solopreneur-gate-matrix.mjs` -> `Solopreneur gate matrix verified (129/129 OpenAPI mutations; no financial surface is classified none).`
- `pnpm lint` -> passed across all 10 workspace packages (0 errors).
- `pnpm typecheck` -> passed across all 10 workspace packages (0 errors).
