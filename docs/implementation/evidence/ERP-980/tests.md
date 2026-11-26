# ERP-980 Test & Verification Evidence

## Commands Executed & Exact Results

1. **Empty Scratch PostgreSQL Migration + Integration Suites (`T-INT-FUND-007` & Affected Modules)**:

   ```sh
   PGPASSWORD=naai_erp psql -h localhost -p 5432 -U naai_erp -d postgres -c "DROP DATABASE IF EXISTS naai_erp_scratch_980;" -c "CREATE DATABASE naai_erp_scratch_980;"
   DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:5432/naai_erp_scratch_980 pnpm --filter @naai-erp/database db:migrate
   RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://naai_erp:naai_erp@localhost:5432/naai_erp_scratch_980 pnpm --filter @naai-erp/api exec vitest run \
     src/funding-plans/owner-custody.integration.test.ts \
     src/funding-plans/owner-custody-migration.integration.test.ts \
     src/funding-plans/funding-plans.integration.test.ts \
     src/funding-plans/account-plans.integration.test.ts \
     src/operating-dashboard/operating-dashboard.integration.test.ts \
     src/banking/banking.integration.test.ts \
     src/expenses/expense.integration.test.ts \
     src/commercial-documents/commercial-document.integration.test.ts \
     src/financial-statements/financial-statement.integration.test.ts \
     src/internal-transfers/internal-transfer.integration.test.ts
   PGPASSWORD=naai_erp psql -h localhost -p 5432 -U naai_erp -d postgres -c "DROP DATABASE IF EXISTS naai_erp_scratch_980;"
   ```
   - `drizzle-kit migrate`: `[✓] migrations applied successfully!` (including `0076_owner_custody_cash_and_owner_receivable.sql`).
   - Vitest integration suites: `Test Files 10 passed (10)`, `Tests 55 passed (55)`.

2. **Workspace Unit Tests**:

   ```sh
   pnpm test
   ```
   - `Tasks: 12 successful, 12 total` (including `@naai-erp/cli`, `@naai-erp/api`, `@naai-erp/domain`, `@naai-erp/contracts`, `@naai-erp/database`, `@naai-erp/web`).

3. **Documentation, Gate Matrix, Migration Filename, Lint & Typecheck Gates**:
   ```sh
   pnpm --filter @naai-erp/database db:check
   node scripts/verify-docs.mjs
   node scripts/verify-solopreneur-gate-matrix.mjs
   pnpm lint
   pnpm typecheck
   ```
   - `db:check`: `Migration directory is valid (77 entries).`
   - `verify-docs.mjs`: `Verified 11 accepted ADRs, 12 rule references, and 29 AI relationship resources.`
   - `verify-solopreneur-gate-matrix.mjs`: `Verified 128/128 OpenAPI mutations; no financial surface is classified none.`
   - `pnpm lint`: `10 successful, 10 total`.
   - `pnpm typecheck`: `10 successful, 10 total`.
