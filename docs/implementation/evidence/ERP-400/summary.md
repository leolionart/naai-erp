# ERP-400 summary

- Task: ERP-400 — Bank and cash accounts
- Start commit: `32fb97e995eea2296ee5a3ec7bbaa2534a4e6569`
- Rules: BR-BNK-001, BR-BNK-002
- Tests: T-BNK-001, T-BNK-002, T-CONTRACT-ERP-400-003

Implemented organization-owned bank/cash accounts, generic CSV statement ingestion, immutable raw rows, versioned normalizations, semantic fingerprints, provider-ID/fingerprint duplicate prevention and the imported/review/ignore state boundary required before reconciliation.

The feature is available through the same application surface for people and automation:

- REST/OpenAPI under `/api/v1/organizations/{organizationId}/banking/*`;
- first-party CLI, including CSV file input and dry-run;
- PostgreSQL schema and migration `0017_plain_stark_industries.sql`;
- admin workspace at `/banking` with account creation, CSV import and transaction filters.

Reconciliation, payment allocation and internal transfers remain intentionally outside ERP-400 and are owned by ERP-410/420.
