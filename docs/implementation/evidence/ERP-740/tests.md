# ERP-740 Tests

- Compose contract passed.
- Four local images built non-root; persistence sentinel survived stack recreation.
- Release workflow verifier and `actionlint` passed.
- CLI tests: 228/228 passed.
- Real workbook extraction test: 1/1 passed.
- Workbook PostgreSQL integrations: 9/9 passed.
- **Real Native Workbook Import (Commit 1, tenant `naai`):**
  - Created 14 parties, 14 roles, 29 projects, 41 sales invoices, and 200 expenses.
  - Skipped 14 zero rows.
  - Generated 241 journals (482 journal lines) with 241 external references and 1 audit event.
  - Persisted stable audit event `6f366f78-f033-4e28-a405-a70a55045148`.
  - Trial Balance: Debit = Credit = 987,753,157 (unbalanced = 0).
- **Idempotency (Retry):**
  - Retry created all zero records; all counts remained unchanged.
- **Financial Totals & Reconciliations:**
  - Calendar Totals: Sales 195,261,583 / Expenses 443,293,388 / Profit -248,031,805.
  - Legacy Totals: Sales 244,717,833 / Expenses 298,148,067 / Profit -53,430,234.
  - Variances: Empty (zero unexplained control variances).
- **Runtime Environment:**
  - Native preview propagates `DATABASE_URL` through Turbo and serves the imported `naai` tenant on localhost.

Exact-commit release and CI proof remain pending until parent integration.
