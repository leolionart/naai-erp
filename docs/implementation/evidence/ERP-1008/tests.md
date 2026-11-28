# ERP-1008 Tests

## Commands Executed

- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/focused-record-shared.test.ts src/app/workspaces/focused-record-cost-mode.test.ts src/lib/api/client.test.ts` — passed.
- `pnpm --filter @naai-erp/web exec tsc --noEmit` — passed (`0` errors).
- `pnpm check:file-size` — passed (`BR-SIZE-001` ratchet respected).
- `pnpm test:docs` — passed.
