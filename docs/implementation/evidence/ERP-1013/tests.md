# ERP-1013 — Tests

- `T-UNIT-ERP-1013-001`:
  - `pnpm --filter @naai-erp/api exec vitest run src/integration-settings/integration-settings.service.test.ts` — passed (4/4 tests).
  - `pnpm --filter @naai-erp/web exec vitest run src/app/auth/automation-token/route.test.ts src/components/automation-api-dialog.test.ts src/components/dls-compliance.test.ts` — passed.
- `T-CLI-ERP-1013-002`: `pnpm --filter @naai-erp/cli test` — passed (14/14 test files, 150 passed, including `integration-sources-cli.test.ts` and `route-golden.test.ts`).
- `T-E2E-ERP-1013-003`: `pnpm --filter @naai-erp/web exec playwright test e2e/automation-api-dialog.spec.ts` — passed (2/2 desktop & 390px mobile).
- `T-DOC-ERP-1013-004`: `pnpm test:docs && node scripts/verify-solopreneur-gate-matrix.mjs` — passed (`Verified 13 accepted ADRs, 14 rule references, and 29 AI relationship resources`; `Verified 144/144 OpenAPI mutations; no financial surface is classified none`).
- Repository quality gate: `pnpm check` — passed across all 10 workspaces.
