# Tests

- `pnpm --filter @naai-erp/web test` — passed (26 files, 88 tests).
- `pnpm --filter @naai-erp/web typecheck` — passed.
- Browser visual smoke is pending because no connected browser is available in this environment.
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/dashboard-workspaces.test.ts` — 5 tests passed, including variant contrast assertions.
- `pnpm --filter @naai-erp/web exec tsc --noEmit` — passed.
