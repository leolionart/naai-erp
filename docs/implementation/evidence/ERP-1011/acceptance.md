# ERP-1011 — Acceptance Criteria

1. **All live categories registered across catalogs and dimensions**:
   - `FREELANCE_OUTSOURCE`, `COMPANY_ADMIN_FEE`, `PROJECT_COMMISSION`, `STAFF_CLIENT_WELFARE`, and `ACCOUNTING_SERVICES` exist with Vietnamese display names across `business_categories`, `expense_categories`, and `dimension_values`.
2. **Dynamic category label resolution on Dashboard and filters**:
   - `ExpenseOverviewChart` and `FilterPopover` read live `master-data/categories` and `master-data/expense-categories` so future categories never require code edits to render readable Vietnamese labels.
