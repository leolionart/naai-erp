# ERP-730 Acceptance

- Setup requires explicit opt-in and refuses unsafe production execution.
- Repeated setup execution does not duplicate organization-scoped configuration.
- Native PostgreSQL applies and records all 33 migrations.
- TT133 accounts and reporting mappings cover fiscal years 2025 and 2026.
- P&L, Balance Sheet, and direct Cash Flow endpoints load without missing-mapping errors and tie to the available posted ledger data.
- AR aging agrees with imported sales-invoice receivables.
- Empty AP is an expected result of the current source mapping, which contains no deterministic purchase invoices.
- Seeded mappings use exact TT133 account codes and remain isolated by organization.
- Runtime readiness does not imply that historical opening capital or opening balances have been supplied.
