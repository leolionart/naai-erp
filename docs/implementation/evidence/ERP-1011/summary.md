# ERP-1011 — Summary

## Outcome

- Synchronized the 5 missing category dimension codes (`FREELANCE_OUTSOURCE`, `COMPANY_ADMIN_FEE`, `PROJECT_COMMISSION`, `STAFF_CLIENT_WELFARE`, `ACCOUNTING_SERVICES`) into live `master-data/dimensions` on production.
- Extracted category catalog defaults and added `buildCategoryNameLookup` in `apps/web/src/components/forms/category-catalog-defaults.ts` (shrinking `document-expense-forms.tsx` under `BR-SIZE-001`).
- Updated `ExpenseOverviewChart` and `FilterPopover` to dynamically resolve category display names from live `master-data/categories` and `master-data/expense-categories` catalogs so newly declared categories never render raw codes such as `FREELANCE_OUTSOURCE`.

## Files Changed

- `apps/web/src/components/forms/category-catalog-defaults.ts`
- `apps/web/src/components/forms/document-expense-forms.tsx`
- `apps/web/src/components/dashboard/expense-overview-chart.tsx`
- `apps/web/src/app/workspaces/focused-record-filter-popover.tsx`
- `apps/web/src/app/workspaces/dashboard-workspaces.test.ts`
- `scripts/file-size-baseline.json`
- `docs/product/business-rules.md`
- `docs/testing/test-specification.md`
- `docs/testing/test-catalog.yaml`
- `docs/implementation/task-ledger.yaml`
