# ERP-976

- Added migration `0073_funding_rules.sql` (`organization_funding_defaults` and `funding_rules`) registered in `db/migrations/meta/_journal.json`.
- Extended `packages/contracts/src/funding.ts` with `company_cash` and funding-rule contracts.
- Implemented `FundingRulesModule` (`FundingRulesController`, `FundingRulesService`, `PgFundingRulesStore`, pure `matchFundingRule` evaluator) with `GET/PUT default/POST/PATCH/DELETE/POST test`, idempotency, `If-Match` optimistic locking, RBAC, and audit events.
- Wired `FundingRulesService.resolveForIngestion` into `CommercialDocumentService.create`, `QuickPurchaseInvoiceService.create`, and `ExpenseService.create` when explicit `funding` is omitted.
- Added `funding-rules` resource to `apps/cli/src/client.ts`, OpenAPI, resource coverage, and `BR-FUND-003`.
