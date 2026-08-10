# ERP-878 acceptance

- [x] `GET /expenses` accepts the canonical `fundingTreatment` filter.
- [x] A persisted line funding snapshot takes precedence over category configuration.
- [x] Legacy null snapshots fall back through `expense_category_code` or `dimensions.category`.
- [x] Owner Current uses filtered posted expenses for the owner-paid list and subtotal.
- [x] Company repayments, owner funding and unresolved adjustments remain ledger-derived.
- [x] Expense rows link to their canonical expense detail.
- [x] Dashboard metrics and mapped Owner Current closing balance are not changed.
- [x] Production read-only inventory predicts 32 owner-paid expenses totaling 177,483,950 VND from
  SALARY, DOMAIN_HOSTING and SERVER_CLOUD under the current reviewed category configuration.

