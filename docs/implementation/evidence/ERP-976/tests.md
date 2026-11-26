# ERP-976 Tests

- `apps/api/src/funding-rules/funding-rules.service.test.ts`: 3/3 unit tests passed (`matchFundingRule` priority, explicit override, org default fallback).
- `apps/api/src/funding-rules/funding-rules.integration.test.ts`: 1/1 integration test passed on scratch Postgres DB (`RUN_DB_INTEGRATION=1`), verifying default, rule CRUD, `/test`, and purchase-invoice ingestion rule + default resolution.
- `apps/cli/src/client.test.ts`: includes `funding-rules` routing test.
- Repo gates (`verify-docs.mjs`, `verify-solopreneur-gate-matrix.mjs`, `pnpm lint`, `pnpm typecheck`, `pnpm test`) verified.
