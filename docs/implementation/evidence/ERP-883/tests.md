# ERP-883 Tests

- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/expense-breakdown-report-workspace.test.ts`
  - Passed: 1 file, 3 tests.
- `pnpm --filter @naai-erp/web typecheck`
  - Passed.
- `pnpm --filter @naai-erp/web exec eslint src/app/workspaces/expense-breakdown-report-workspace.tsx e2e/expense-breakdown-reports.spec.ts`
  - Passed.
- `pnpm --filter @naai-erp/web exec playwright test e2e/expense-breakdown-reports.spec.ts --project=desktop-chromium --project=mobile-chromium`
  - Passed: 2 tests across desktop Chromium and mobile Chromium.
- `pnpm test:docs`
  - Passed: 11 ADRs, 12 rule references and 29 AI relationship resources verified.
- `git diff --check`
  - Passed.

Rendered localhost QA at `/reports/expenses/by-category` also confirmed that selecting `Quý`
updated the URL to the corresponding range, drill-down links contained no arrow SVG, browser logs
had no warning/error and the 390x844 viewport had no document overflow.
