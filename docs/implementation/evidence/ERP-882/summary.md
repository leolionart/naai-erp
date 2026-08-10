# ERP-882 summary

Added two monthly management reports for posted expenses: by canonical payee and by persisted line
category. Both purchase invoices and direct expenses use one organization-scoped read model, keep
currencies separate, expose exact minor-unit totals through API/CLI/OpenAPI and drill down to Expense
Management with exact month and dimension filters.

The web application adds **Thống kê chi phí** navigation with `/reports/expenses/by-payee` and
`/reports/expenses/by-category`, shared period controls, KPI totals, monthly visualizations and matrix
tables. Unclassified payees/categories remain explicit rather than being inferred.
