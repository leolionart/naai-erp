# ERP-862 tests

## Focused regression tests

- `pnpm --filter @naai-erp/contracts exec vitest run src/session-cookie.test.ts`: 3 passed.
- Web session, authentication gate, API client and connection tests: 17 passed.
- API cookie authentication and bootstrap tests: 10 passed.
- `pnpm --filter @naai-erp/web exec playwright test e2e/login-theme.spec.ts --project=desktop-chromium`: 1 passed.

## Repository quality gate

- `pnpm check`: passed on 2026-08-09.
- Formatting, lint, TypeScript, documentation, security baseline, fixtures, native database tests, package tests and production builds all passed.
- Notable totals from the gate: native database 31 passed; contracts 67 passed; domain 187 passed; web 52 passed; API 135 passed with integration tests requiring external database skipped; CLI 132 passed with one real-import test skipped.
- Environment warning only: the runner used Node v26.0.0 while the repository declares Node `>=22 <25`.
