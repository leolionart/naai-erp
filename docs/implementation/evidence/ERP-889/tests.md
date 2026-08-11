# ERP-889 tests

- `pnpm --filter @naai-erp/domain test -- customer-receipts.test.ts` — passed, 39 files / 197 tests.
- `pnpm --filter @naai-erp/contracts test -- customer-receipts.test.ts` — passed, 37 files / 91 tests.
- `pnpm --filter @naai-erp/api exec vitest run src/customer-receipts/customer-receipt.service.test.ts` — passed.
- `pnpm --filter @naai-erp/api typecheck` — passed.
- `pnpm --filter @naai-erp/database typecheck` — passed.
- `pnpm --filter @naai-erp/cli typecheck` — passed.
- `DATABASE_URL=postgresql://... RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/customer-receipts/customer-receipt.integration.test.ts` — passed, 2 tests covering partial/full allocation, balanced journals, idempotency, validation and locked periods.
- OpenAPI JSON parse and ERP-889 path/schema reference validation — passed.
- `pnpm test:docs` — passed.
- `pnpm db:migrate` — migration `0048_customer_receipts` applied successfully.
- `pnpm db:native-status` — passed, `49/49` migrations healthy.
- `pnpm --filter @naai-erp/web exec playwright test e2e/customer-receipts.spec.ts --project=desktop-chromium --project=mobile-chromium` — passed, `2/2` desktop/mobile journeys.
- `pnpm check` — full repository quality gate passed after formatting the affected index barrels.
- `git diff --check` — passed.
