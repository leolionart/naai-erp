# ERP-310 Summary

Implemented an organization-scoped expense workflow for invoice-backed and non-invoice costs, employee reimbursements, freelancer/platform/overseas costs, petty cash, prepaid and fixed-asset classifications.

- Expense headers, lines, exact allocations, lifecycle events and line-level management/CIT/VAT reviews are persisted in PostgreSQL.
- Management validity, CIT eligibility and VAT eligibility remain independent; override reviews require a reference.
- Non-documented costs can be posted to management accounts but cannot claim deductible VAT.
- Eligible VAT posts separately; ineligible VAT is capitalized into the configured expense/asset debit.
- Employee reimbursement credits employee payable and leaves the later bank/cash settlement to the banking phase.
- Approval and posting enforce RBAC, maker-checker, fiscal-period locks, idempotency and atomic audit/outbox/journal writes.
- Posted expense headers, lines and allocations are immutable at database level.
- REST/OpenAPI and the first-party CLI expose create, list, get, review and lifecycle commands through the same application service controls.

Start commit: `8fd109a37e103782fb0fdfcf06b5ba9508b23817`.
