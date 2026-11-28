# ERP-1005 Acceptance

1. **Quick-select toolbar toggle on `/expenses`**: Verified via `EXPENSE_COST_MODE_OPTIONS` (`Tất cả`, `Chi phí thực công ty`, `HĐ khấu trừ thuế`) rendered inside `role="group"` with `aria-pressed` semantics and persisted on `?costMode=...` across search and popover filter submissions.
2. **Canonical classification parity with Dashboard (`BR-FUND-002`)**: Verified in `T-UNIT-ERP-1005-001` (`focused-record-cost-mode.test.ts`) across direct `112-BANK`, `111-OWNER-CUSTODY`, `3388-OWNER` `owner_paid_company_cost` expenses and purchase invoices, `tax_only_non_cash` invoices, and unconfirmed `3388-OWNER` rows.
3. **Live total summary & chart sync**: `ExpenseOverviewChart`, record count badge, and posted/active total badge update immediately with `filteredRows`.
4. **File-size ratchet (`BR-SIZE-001`)**: `focused-record-list-workspace.tsx` shrunk and `scripts/file-size-baseline.json` ratcheted down cleanly.
