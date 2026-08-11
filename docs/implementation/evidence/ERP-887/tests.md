# ERP-887 tests

- `pnpm --filter @naai-erp/web exec playwright test e2e/owner-current.spec.ts --project=desktop-chromium`: 1 passed.
- In-app Browser QA at `http://localhost:3000/banking/owner-current`: confirmed section visible;
  review table, review metric and review record absent; search interaction remained functional.
- Repository documentation, formatting, lint and diff checks: passed.
