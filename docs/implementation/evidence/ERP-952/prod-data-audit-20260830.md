# PROD data audit 2026-08-30

- Backup: `/home/backups/naai-erp/naai-erp-20260830-132050.dump`
- SHA-256: `1897695fc9dc295c925df4d8fad3c615305759adb250907b1d1408d418e291fd`
- Stack: `naai-erp`; API, web, worker and PostgreSQL healthy.
- `CASH-OWNER-CUSTODY` remaining physical custody readback: 15,086,850 VND.
- Historical custody inflows: 135,320,000 VND; FIFO-linked custody expenses: 120,233,150 VND.
- Owner Current and dashboard still use different period/source scopes; no destructive data mutation was applied.
- Follow-up required: unify owner settlement read model and remove duplicate ledger-account aggregation before final correction.
