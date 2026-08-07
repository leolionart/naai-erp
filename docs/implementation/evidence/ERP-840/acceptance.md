# ERP-840 Acceptance

- [x] Seed is repeatable with stable IDs and idempotency keys.
- [x] Business resources are created through REST, not direct business-table SQL.
- [x] Independent maker-checker identity is used for approvals.
- [x] Owner capital, owner funding, withdrawal and owner-paid expense are separately classified.
- [x] Paid and unpaid sales invoices plus an unpaid purchase invoice populate AR/AP aging.
- [x] Bank receipt is imported, matched and reconciled to the exact sales invoice.
- [x] TT133 P&L, balance sheet, cash flow and VAT mappings are approved.
- [x] Target, forecast and invoiced actual facts populate performance comparison.
- [x] All 13 verified report families return successfully in read-only verification.
- [x] Final P&L snapshot reproduces and CSV/XLSX accountant exports are generated.
