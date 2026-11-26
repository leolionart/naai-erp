# ERP-984 Summary

- Restored unpaid and partially settled supplier purchase invoices (`commercial_documents` on AP control account `331` with `funding_financial_account_id is null`) in `PgAgingStore` alongside `project_freelance_payables` and supplier advances.
- Unified AP allocation movements across bank `reconciliation_allocations` (prefixed `doc:`) and `project_freelance_payable_payments` (prefixed `freelance:`) so partial and full settlements honor `asOf` cutoffs and `includeSettled`.
- Restored ledger-backed `controlBalances` on AP control accounts (`331` / `331-%` / liability control accounts) so `tieStatus` genuinely reconciles ledger account `331` against the AP aging subledger detail total.
- Excluded owner-current liabilities (`3388*` and accounts mapped to Balance Sheet `owner_current`), owner personal-expense receivables (`1388*`), and direct company-funded paid purchase invoices (`company_bank`, `company_cash`, `owner_custody_cash`) from AP and AR aging.
- Updated `docs/product/business-rules.md` (`BR-AP-001`, `BR-AP-002`), `docs/testing/test-catalog.yaml`, `docs/testing/test-specification.md`, and `docs/implementation/task-ledger.yaml`.
