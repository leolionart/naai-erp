# ERP-916 tests

- Regression test failed before the fix with expected `200`, received `401`.
- `pnpm --filter @naai-erp/web exec vitest run src/app/auth/automation-token/route.test.ts` — 4 passed.
- Web TypeScript lint — passed.
- Documentation validation and diff whitespace check — passed.
