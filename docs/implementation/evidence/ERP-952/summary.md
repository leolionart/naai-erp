# ERP-952 summary

The operating-dashboard read model now computes owner-custody cash as reconciled custody inflows less posted expenses and purchase invoices with an explicit `CASH-OWNER-CUSTODY` funding account. Personal advances remain owner payable and do not reduce custody. Company available cash excludes custody to prevent double counting. All homepage business metrics are supplied by the backend read model; the frontend only formats and renders values.

Changed files: `apps/api/src/operating-dashboard/pg-operating-dashboard.store.ts`, `apps/web/src/app/workspaces/dashboard-workspaces.tsx`, `packages/database/src/schema.ts`, `db/migrations/0065_expense_funding_financial_account.sql`, `apps/api/src/expenses/expense.types.ts`, `apps/api/src/expenses/pg-expense.store.ts`.

Expense provenance now accepts and persists `fundingFinancialAccountId`, with an organization-scoped
foreign key. This lets custody cash, company cash and bank settlement be distinguished without
mutating posted history or inferring from account codes.
