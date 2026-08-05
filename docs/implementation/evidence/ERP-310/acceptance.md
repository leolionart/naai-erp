# ERP-310 Acceptance

- Expense with and without invoice: schema, domain, REST/API, CLI and PostgreSQL workflow implemented.
- Reimbursement, freelancer, bank/platform/overseas vendor, petty cash, prepaid and fixed-asset classifications: represented explicitly by expense class.
- Management recognition, CIT deductibility and VAT deductibility: stored and reviewed independently per line, summarized on the expense.
- Non-invoice expense: management booking allowed; deductible VAT is forced to zero.
- Employee reimbursement: journal credits employee payable without duplicating the future cash payment.
- VAT treatment: eligible VAT debits the VAT account; ineligible VAT increases expense/asset cost.
- Allocations: line net amount must be allocated exactly; VAT residuals are distributed deterministically.
- Controls: organization scope, RBAC, maker-checker, fiscal-period locks, idempotency, audit and outbox are enforced.
- Immutability: posted header financial fields, lines and allocations reject update/delete at database level.
- AI-native contract: list/get/create/review/transition operations exist in REST/OpenAPI and first-party CLI.
- Golden data: `GF-EXPENSE-001` and `GF-EXPENSE-002` record independent expected results.

Final acceptance remains pending exact-commit GitHub CI with PostgreSQL integration enabled.
