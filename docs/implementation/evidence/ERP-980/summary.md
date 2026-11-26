# ERP-980 Summary: Dedicated `111-OWNER-CUSTODY` Cash Account & `1388` Owner Receivable

## Outcome

Implemented `ERP-980` (`BR-FUND-007`) end-to-end across SQL migrations, domain/API stores, operating dashboard & owner-current read models, bulk funding plans, CLI client, OpenAPI contract, and scratch PostgreSQL integration tests (`T-INT-FUND-007`).

1. **Dedicated Ledger Separation (`111-OWNER-CUSTODY` vs `111-CASH` under `111`)**:
   - Migration `db/migrations/0076_owner_custody_cash_and_owner_receivable.sql` seeds `111` ("Tiền mặt"), `111-CASH` ("Quỹ tiền mặt công ty"), `111-OWNER-CUSTODY` ("Quỹ tiền mặt do chủ giữ"), `1388` ("Phải thu khác"), and `1388-OWNER` ("Phải thu chủ sở hữu"), establishes `account_hierarchy_edges` (`111-CASH -> 111`, `111-OWNER-CUSTODY -> 111`, `1388-OWNER -> 1388`), updates `financial_accounts` (`CASH-OWNER-CUSTODY -> 111-OWNER-CUSTODY`, `CASH-COMPANY -> 111-CASH`), and backfills TT133 Balance Sheet mapping lines (`cash` for `111-OWNER-CUSTODY`, `owner_receivable` for `1388` and `1388-OWNER`).
   - `POST /banking/accounts` automatically maps `CASH-OWNER-CUSTODY -> 111-OWNER-CUSTODY` and `CASH-COMPANY -> 111-CASH` (under parent `111`) when `ledgerAccountCode` is omitted.
   - Internal transfers (`Dr 111-OWNER-CUSTODY / Cr 112` or `111-CASH`), expenses (`Dr expense + VAT / Cr 111-OWNER-CUSTODY`), and purchase invoices (`Dr expense + VAT / Cr 111-OWNER-CUSTODY`) resolve and post directly to `financial_accounts.ledger_account_code`.

2. **Owner Receivable (`1388` / `1388-OWNER`) for Personal Spending from Company Funds**:
   - `expenseClass = "owner_personal"` enforces company-fund counter accounts (rejecting `3388*` / `owner_paid`), requires asset receivable posting accounts (`1388` / `1388-OWNER`, rejecting `6xx`/`8xx`), and forces `managementState = "invalid"`, `citState = "ineligible"`, `citEligibleMinor = "0"`, `vatState = "ineligible"`, and `vatEligibleMinor = "0"`.
   - Excluded from P&L expenses, VAT reconciliation/controls (`pg-financial-statement.store.ts`), and CIT add-backs (`pg-operating-dashboard.store.ts` restricts `cit_ineligible` add-backs to `root_type = 'expense'`).

3. **Ledger-Derived Dashboard & Owner-Current Balances**:
   - Removed historical link-inference CTEs (`custody_incoming`, `custody_expenses`, `custody_purchase_invoices`) from `PgOperatingDashboardStore`; `companyCashOnHandMinor` (`111-CASH`), `ownerCashCustodyMinor` (`111-OWNER-CUSTODY`), `ownerReceivableMinor` (`1388`), and `netOwnerPositionMinor` (`3388 - 1388`) derive directly from posted ledger lines as of `asOf`.
   - `GET /banking/owner-current-movements` exposes `ledgerBalances` (`ownerCustodyCashMinor`, `companyCashOnHandMinor`, `ownerPayableMinor`, `ownerReceivableMinor`, `netOwnerPositionMinor`).
   - Unmigrated historical `111-CASH` lines linked to `CASH-OWNER-CUSTODY` emit `owner_custody_ledger_migration_required` on the operating dashboard until migrated.

4. **Controlled Historical Reclassification (`dry-run` / `commit`)**:
   - Added `POST /api/v1/organizations/:organizationId/funding-plans/owner-custody-migration/dry-run` and `commit` (plus CLI helpers `dryRunOwnerCustodyMigration` / `commitOwnerCustodyMigration`), verifying `debit == credit`, enforcing `planHash`, period locks, RBAC, audit, outbox, and `Idempotency-Key`, and preserving total `111` cash (`beforeBalances.totalCash111Minor == afterBalances.totalCash111Minor`).

## Files Changed

- `db/migrations/0076_owner_custody_cash_and_owner_receivable.sql`
- `db/migrations/meta/_journal.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/api-exception.filter.ts`
- `apps/api/src/banking/banking.service.ts`
- `apps/api/src/banking/owner-custody-banking.ts`
- `apps/api/src/banking/pg-banking.store.ts`
- `apps/api/src/commercial-documents/document-funding.ts`
- `apps/api/src/commercial-documents/pg-commercial-document.store.ts`
- `apps/api/src/expenses/expense-funding.ts`
- `apps/api/src/expenses/expense.service.ts`
- `apps/api/src/expenses/pg-expense.store.ts`
- `apps/api/src/financial-statements/pg-financial-statement.store.ts`
- `apps/api/src/funding-plans/funding-plans.helpers.ts`
- `apps/api/src/funding-plans/funding-plans.service.ts`
- `apps/api/src/funding-plans/owner-custody-migration.controller.ts`
- `apps/api/src/funding-plans/owner-custody-migration.service.ts`
- `apps/api/src/funding-plans/owner-custody-test-fixture.ts`
- `apps/api/src/funding-plans/owner-custody.integration.test.ts`
- `apps/api/src/funding-plans/owner-custody-migration.integration.test.ts`
- `apps/api/src/operating-dashboard/operating-dashboard.integration.test.ts`
- `apps/api/src/operating-dashboard/operating-dashboard.types.ts`
- `apps/api/src/operating-dashboard/owner-custody-ledger.ts`
- `apps/api/src/operating-dashboard/pg-operating-dashboard.store.ts`
- `apps/cli/src/client.ts`
- `apps/cli/src/funding-client-routes.ts`
- `apps/cli/src/funding-client-routes.test.ts`
- `scripts/seed-local-demo-accounts.mjs`
- `scripts/seed-local-demo.mjs`
- `scripts/verify-solopreneur-gate-matrix.mjs`
- `docs/api/openapi-v1.json`
- `docs/implementation/solopreneur-gate-matrix.json`
- `docs/product/business-rules.md`
- `docs/testing/test-specification.md`
- `docs/implementation/task-ledger.yaml`
