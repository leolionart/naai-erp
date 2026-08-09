# ERP-863 summary

Targeted exactly twelve provisional inferred payroll drafts:
`expense-inferred-payroll-2024-01` through `expense-inferred-payroll-2024-12`.

The discard was not executed because both the public production API and the direct internal Caddy
route returned HTTP 502. Safe deletion requires reading each current draft/version immediately
before calling the audited, idempotent expense DELETE operation.

