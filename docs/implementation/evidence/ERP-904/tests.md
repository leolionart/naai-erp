# Test evidence

- `pnpm --filter @naai-erp/api exec vitest run src/commercial-documents/commercial-document.service.test.ts src/expenses/expense.service.test.ts src/executive-metrics/executive-metric.service.test.ts src/fiscal-periods/fiscal-period.service.test.ts src/banking/banking.service.test.ts` — **47 passed**.
- `env -u NODE_ENV PLAYWRIGHT_PORT=3000 pnpm --filter @naai-erp/web exec playwright test e2e/executive-metrics.spec.ts e2e/journals-responsive.spec.ts e2e/expense-category-policies.spec.ts --project=desktop-chromium --project=mobile-chromium` — after expectation refresh, targeted solopreneur policy journey passed; previous run was 9/10 with one stale text assertion.
- Native PostgreSQL migrations applied successfully. The selected integration suites require isolated fixture databases; rerunning against the shared native DB produced duplicate primary-key fixture collisions, so no integration pass is claimed from that run.
