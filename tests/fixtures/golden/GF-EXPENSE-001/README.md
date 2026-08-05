# GF-EXPENSE-001

Exact VND fixture for a management-valid petty-cash expense without an invoice. The expense is booked, produces no deductible VAT and is ineligible for CIT in this fixture policy.

## Expense-class mapping convention

The business label and the accounting evidence class are separate dimensions:

- Petty cash maps to `non_documented` when no qualifying receipt/invoice exists, or `receipt_backed` when a receipt is retained.
- Freelancer services normally map to `contract_backed`; use `invoice_backed` only when the supplier document meets that workflow.
- Platform fees map to `invoice_backed` or `receipt_backed` according to the retained source document.
- Overseas vendor costs map to `invoice_backed` or `contract_backed`; overseas status never determines CIT, VAT or withholding eligibility automatically.
- Bank charges use `bank_fee`.
- Employee-funded costs use `employee_reimbursement` and credit employee payable until a later settlement.
- Payroll, tax payments, owner/personal costs, prepaid costs and fixed assets use their explicit classes.

Class mapping never grants tax eligibility. Management recognition, CIT review and VAT review remain independent and require their configured evidence/reviewer controls.

## Files

- `input.json`: immutable source and control totals.
- `expected-journals.csv`: exact line-level posting oracle.
- `expected-allocations.csv`: exact dimension allocation oracle.
- `expected-tax-view.csv`: independent management/CIT/VAT view.
- `oracle-manual.md`: human-readable arithmetic.
- `SHA256SUMS`: reviewed artifact hashes.
