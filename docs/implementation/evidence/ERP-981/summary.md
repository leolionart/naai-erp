# ERP-981

- Added `GET /funding-plans/unlinked` (`FundingPlansService.listUnlinked`) reporting posted expenses and posted/issued purchase invoices with `funding_financial_account_id is null`, along with suggested targets from bank reconciliation, `funding_rules`, or `expense_categories.funding_treatment`.
- Added `funding-plans unlinked` to `apps/cli/src/client.ts`, OpenAPI, and `BR-FUND-008`.
