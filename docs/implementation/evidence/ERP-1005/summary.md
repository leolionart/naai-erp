# ERP-1005 Summary

## Outcome

Added a one-click URL-backed `costMode` quick-select filter (`Tất cả` / `Chi phí thực công ty` / `HĐ khấu trừ thuế`) and a live posted/active total summary badge to the outer toolbar of **Expense Management** (`/expenses`), while fixing client-side date filtering to use canonical activity dates (`document_date` / `expense_date`) across purchase invoices and non-invoice expenses.

## Files Changed

- `apps/web/src/app/workspaces/focused-record-cost-mode.ts`
- `apps/web/src/app/workspaces/focused-record-cost-mode.test.ts`
- `apps/web/src/app/workspaces/focused-record-toolbar.tsx`
- `apps/web/src/app/workspaces/focused-record-list-workspace.tsx`
- `apps/web/src/components/dashboard/expense-overview-chart.tsx`
- `scripts/file-size-baseline.json`
- `docs/product/business-rules.md`
- `docs/testing/test-specification.md`

## Key Decisions

- Kept `costMode` classification 100% aligned with `BR-FUND-002`: bank/cash/custody-funded records (`111`, `112`, or `fundingFinancialAccountId`) and `3388-OWNER` records whose canonical category treatment is `owner_paid_company_cost` or `company_funds` classify as `company_real`; `tax_only_non_cash` and unconfirmed `3388-OWNER` records classify as `tax_only`.
- Loaded `CATEGORY_LOOKUP_ENDPOINTS` inside `load()` so `categoryNames` and `categoryTreatments` are guaranteed to be ready before `loading` clears on initial page load (`?costMode=company_real`).
- Extracted `focused-record-cost-mode.ts` so `focused-record-list-workspace.tsx` shrinks below its file-size ratchet baseline (`BR-SIZE-001`).
