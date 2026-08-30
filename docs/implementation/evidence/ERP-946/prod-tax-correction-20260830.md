# PROD tax eligibility correction — 2026

- Organization: `naai`
- Scope: posted expenses dated `2026-01-01` through `2026-12-31`, excluding `payroll_personnel`
- Backup: `/home/backups/naai-erp/naai-erp-20260830-172355-pre-tax-correction-2026.dump`
- Backup SHA-256: `5a1a74963dee5708e015cce98443e71c6ab1f88a5654090c9146d8cc29d2da51`
- Reason: owner confirmed the six non-salary rows have valid input invoices.

Six expense lines were corrected from `cit_state=ineligible`, `cit_eligible_minor=0`
to `cit_state=eligible`, `cit_eligible_minor=net_minor`. VAT states and all
amounts/journals were unchanged. The transaction used `app.tax_finalization=on`,
recorded six `expense_events` plus one `resource_audit_events` entry, and was
organization-scoped.

Post-correction API readback:

- Revenue: `115,256,787₫`
- Expense: `127,415,389₫`
- Accounting profit: `-12,158,602₫`
- Taxable profit: `17,841,398₫`
- CIT at 20%: `3,568,279₫`

Controls: six corrected non-salary lines are eligible; posted/reversed journal
debit-credit imbalance remains `0`.
