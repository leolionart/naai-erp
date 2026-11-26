# ERP-978

- Implemented `FundingPlansController` and `FundingPlansService` (`GET /funding-plans/export`, `POST /funding-plans/dry-run`, `POST /funding-plans/commit`).
- Export supports JSON and CSV for posted expenses and posted/issued purchase invoices in a date range.
- Dry-run checks state, period lock, reconciliation, and paid status, computes before/after accounts and dashboard impact, and returns a deterministic `planHash`.
- Commit verifies `planHash` (`FUNDING_PLAN_HASH_MISMATCH` on mismatch), executes each ready item idempotently without aborting the batch on single-row failures, and records an audit event.
- Added `funding-plans` resource to `apps/cli/src/client.ts`, OpenAPI, resource coverage, and `BR-FUND-005`.
