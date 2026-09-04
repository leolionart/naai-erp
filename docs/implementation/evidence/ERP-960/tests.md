## Verification

- `pnpm --filter @naai-erp/web exec tsc --noEmit` — passed.
- `pnpm --filter @naai-erp/web exec playwright test e2e/login-theme.spec.ts --project=desktop-chromium` — 1 passed.
