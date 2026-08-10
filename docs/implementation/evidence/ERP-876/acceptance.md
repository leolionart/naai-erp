# ERP-876 acceptance

- Owner-paid payroll without an invoice is classified from its expense funding snapshot: passed.
- Owner-paid purchase invoice is classified from canonical document evidence: passed.
- Company-funded expense and unlinked Owner Current credit are not mislabeled as owner-paid: passed.
- Company repayment uses the exact Owner Current debit plus company-funds credit and reduces the repayment subtotal: passed.
- Repayment through an inactive historical company account remains visible: passed.
- UI separates owner-paid costs, company repayments, owner funding and review adjustments: passed.
- Missing expense-source copy appears only where an owner-paid classification expects a cost source: passed.
