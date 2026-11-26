# ERP-985 Summary

## Outcome

Implemented `BR-CUR-002` across all posting and ingestion entry points (`commercial-documents` including quick purchase/sales ingestion, `expenses`, `journals`, `workbook-imports` dry-run/commit, and `inbound-webhooks`) to reject any currency differing from the organization's base currency (`VND`) with HTTP `422 FOREIGN_CURRENCY_NOT_SUPPORTED` and explicit guidance (`"quy đổi sang VND trước khi nhập, ghi tỷ giá vào mô tả"`).

## Files Changed & Modular Extraction

- `apps/api/src/common/base-currency-guard.ts`: Focused base-currency validation helper and structured `FOREIGN_CURRENCY_NOT_SUPPORTED` error builder.
- `apps/api/src/api-exception.filter.ts`: Mapped `FOREIGN_CURRENCY_NOT_SUPPORTED: 422` and surfaced `userMessage` and `details.guidance` in the API error envelope.
- `apps/api/src/master-data/pg-master-data.store.ts` & `apps/api/src/master-data/master-data.service.ts`: Added organization `base_currency` lookup.
- `apps/api/src/commercial-documents/commercial-document.service.ts`, `quick-purchase-invoice.service.ts`, `quick-sales-invoice.service.ts`, `commercial-document-funding.validator.ts`: Enforced base currency before supplier/customer creation, draft persistence, replacement, or `issue`/`post` transitions; extracted funding validator to shrink `commercial-document.service.ts`.
- `apps/api/src/expenses/expense.service.ts` & `expense-relationships.ts`: Enforced base currency on create, update, reverse-replace, backfill, and `post` transition; extracted relationship normalization helper to shrink `expense.service.ts`.
- `apps/api/src/journals/journal.service.ts`: Enforced base currency on `create`, `repost`, and `post`.
- `apps/api/src/workbook-imports/workbook-import.service.ts` & `workbook-review-row.mapper.ts`: Enforced base currency on `dryRun` and `commit`; extracted review-row mapper to shrink `workbook-import.service.ts`.
- `apps/api/src/inbound-webhooks/inbound-webhook.service.ts`: Enforced base currency prior to inbox persistence so rejected foreign-currency events return HTTP `422` without poisoning `externalId` retries.
- `apps/api/src/common/base-currency-guard.test.ts` & `apps/api/src/common/base-currency.integration.test.ts`: Unit and scratch-DB HTTP integration tests (`T-INT-CUR-002`).
- `docs/api/openapi-v1.json`, `docs/product/business-rules.md`, `docs/testing/test-catalog.yaml`, `docs/testing/test-specification.md`, `docs/implementation/task-ledger.yaml`: Updated contracts, `BR-CUR-001` (marked unimplemented), `BR-CUR-002`, and test catalog.
