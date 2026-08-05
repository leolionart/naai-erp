# GF-EXPENSE-001 manual oracle

- Booked management expense: `3,000,000` VND.
- Journal debit: `3,000,000` VND to `642-OPEX`.
- Journal credit: `3,000,000` VND to `111-CASH`.
- Debit minus credit: `3,000,000 - 3,000,000 = 0` VND.
- Allocation control: `3,000,000` VND to `costCenter:ADMIN`, exactly equal to the source net amount.
- CIT-eligible amount: `0` VND; CIT-ineligible amount: `3,000,000` VND.
- Claimed and deductible VAT: `0` VND.
- Cash outflow: `3,000,000` VND. No payable or reimbursement settlement is created.

This calculation is a reviewed fixture oracle. It is intentionally independent of application posting code.
