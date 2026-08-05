# ERP-300 Acceptance

- Sales Invoice lifecycle, payment terms, immutable issue and journal: implemented.
- Purchase Invoice capture/verification/approval/post separation and AP/VAT journal: implemented.
- Credit Note original reference, reason, per-line and cumulative net/tax cap, inverse journal and original immutability: implemented.
- One source line split across multiple project/dimension allocations: implemented with exact allocation and proportional tax residual handling.
- Organization scope, role controls, maker/checker for purchase approval, period lock, audit, outbox and idempotency: implemented.
- AI-native REST/OpenAPI/CLI create/read/list/filter/workflow access: implemented.
- GF-SALES-001 and GF-PURCHASE-001 manual oracles: implemented and hash-pinned.

Final acceptance passed on implementation commit `9408d00a694ff5c1246e20732055debeb86e0220`.

- Exact-commit PostgreSQL CI: https://github.com/leolionart/naai-erp/actions/runs/30992011125
- Next ready task: ERP-310 Expense workflow.
