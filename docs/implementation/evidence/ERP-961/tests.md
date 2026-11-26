# Tests

- `pnpm audit --prod (before: 6 critical/49 high; after: 0 critical/0 high)` — passed
- `pnpm --filter @naai-erp/web test; pnpm --filter @naai-erp/api test src/bootstrap.test.ts src/outbound-events` — passed
- `next build` — passed
