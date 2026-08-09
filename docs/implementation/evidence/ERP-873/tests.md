# ERP-873 tests

- `pnpm --filter @naai-erp/api exec vitest run src/banking/banking.service.test.ts` — 4 passed.
- `pnpm --filter @naai-erp/api typecheck` — passed.
- `pnpm --filter @naai-erp/web typecheck` — passed.
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/owner-current-workspace.test.ts` — 1 passed.
- `pnpm --filter @naai-erp/web test:e2e -- owner-current.spec.ts` — 1 passed on desktop Chromium.
- `pnpm --filter @naai-erp/api test` — 150 passed, 104 skipped.
- `pnpm --filter @naai-erp/web test` — 53 passed.
- `pnpm --filter @naai-erp/api lint` — passed.
- `pnpm --filter @naai-erp/web lint` — passed.
- `pnpm test:docs` — verified 11 ADRs, 12 rule references, and 29 AI relationship resources.
- Targeted Prettier check and `git diff --check` — passed.
- Executed `PgBankingStore.listOwnerCurrentMovements("naai")` against the local PostgreSQL database: 106 owner-current movements returned and canonical expense sources were present without SQL errors.
- Browser QA at `http://localhost:3000/banking/owner-current`: correct page identity, meaningful content, no framework overlay, and no console errors or warnings. The current upstream API image does not yet return `sources`; release is required before live rows show source links.
