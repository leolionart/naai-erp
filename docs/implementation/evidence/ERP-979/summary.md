# ERP-979

- Added `POST /expenses/:id/reclassify-accounts` and `POST /commercial-documents/:id/reclassify-accounts` validating active target account root types (`expense`/`asset` vs `revenue`/`income`/`liability`) and preserving amounts, VAT, tax states, and allocations.
- Added bulk `POST /account-plans/dry-run` and `POST /account-plans/commit` with `planHash` verification, per-row results, and audit events.
- Added `account-plans` resource to `apps/cli/src/client.ts`, OpenAPI, resource coverage, and `BR-FUND-006`.
