# ERP-983 Summary — Owner Funding into Company Bank Account, Spend Traceability and Owner Repayment

## Outcome

Implemented canonical support for owner bank funding deposits (`owner_funding`, `Dr 112 / Cr 3388`, financing and never revenue), optional traceability from subsequent `company_bank` expenses and purchase invoices back to the funding movement/transaction, and canonical owner bank repayments (`owner_repayment`, `Dr 3388 / Cr 112`, clearing owner payable and never expense) across PostgreSQL schema/migration `0077`, contracts, REST API, first-party CLI, owner-current read model, and operating dashboard.

## Key Decisions

1. **Single banking surface for `owner_funding` and `owner_repayment`**: `GET/POST /api/v1/organizations/{organizationId}/banking/owner-funding` (and `GET /{id}`) plus CLI `owner-funding record|list|get|repay` (and `owner-repayment` alias) handle both directions cleanly while enforcing active `bank` financial accounts (`112`), fiscal-period locks, idempotency, RBAC, audit, and outbox invariants.
2. **Two input modes**:
   - **Bank transaction mode (`bankTransactionId`)**: validates positive inflow for `owner_funding` and negative outflow for `owner_repayment`, transitions the imported/needs-review transaction to `reconciled`, and posts the balanced journal.
   - **Manual mode**: requires a non-blank `reference`, creates the reconciled `bank_transactions` row, and posts the balanced journal atomically.
3. **Optional `company_bank` spend traceability**: `expenses` and `commercial_documents` (purchase invoices) accept `ownerFundingId` or `ownerFundingTransactionId` (top-level or inside `funding`), validating same-organization, `movement_type = 'owner_funding'`, and matching `company_bank` financial account without creating a second `3388` credit.
4. **File size discipline**: all new code files are well under 500 lines, and every edited file previously >500 lines (`schema.ts`, `pg-banking.store.ts`, `pg-operating-dashboard.store.ts`, `expense.service.ts`, `pg-expense.store.ts`, `pg-commercial-document.store.ts`, `apps/cli/src/client.ts`, `apps/cli/src/main.ts`) had helpers extracted so none grew.
