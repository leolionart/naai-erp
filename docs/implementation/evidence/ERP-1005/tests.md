# ERP-1005 Tests

## Executed Commands

- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/focused-record-cost-mode.test.ts src/app/workspaces/focused-record-shared.test.ts` — passed.
- `pnpm --filter @naai-erp/web typecheck` — passed (`tsc --noEmit`).
- `pnpm check:file-size --update && pnpm check:file-size` — passed (`focused-record-list-workspace.tsx` shrunk below baseline).
- `pnpm test:docs` — passed.
- `npx eslint` on modified web files — passed (`0` errors).
- `npx prettier --check` on modified files — passed.
