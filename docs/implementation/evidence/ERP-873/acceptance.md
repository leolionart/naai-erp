# ERP-873 acceptance

- Owner-paid company-cost rows expose canonical `expenses` linked by organization and journal ID.
- Purchase-invoice-backed rows expose canonical `commercial_documents` of type `purchase_invoice` linked by organization and journal ID.
- Reversal rows resolve the original journal through `reversal_of_id`.
- A journal can expose multiple source records; the API does not collapse them into an inferred single source.
- The UI displays purpose/document number, line detail, payee, category, expense class, CIT/VAT states, and direct source links.
- Rows without a canonical source are labeled `Chưa liên kết chi phí` and retain journal drill-down.
- Owner-current increase, decrease, company-funds delta, and running balance remain ledger-derived and unchanged.
