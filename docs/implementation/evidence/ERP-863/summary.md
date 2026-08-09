# ERP-863 summary

Targeted exactly twelve provisional inferred payroll drafts:
`expense-inferred-payroll-2024-01` through `expense-inferred-payroll-2024-12`.

After ERP-864 restored the production API, all twelve records were read back as exact provisional
`payroll_personnel` drafts from `erp851-inferred-payroll-history`, with total gross
`187,000,000` VND. Each was discarded through the versioned, idempotent expense DELETE operation.

Final list readback contains zero of the twelve target IDs. Posted expenses and journals were not
changed.
