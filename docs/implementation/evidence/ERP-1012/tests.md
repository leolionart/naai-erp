# ERP-1012 — Tests

- `T-UNIT-ERP-1012-001`: `pnpm --filter @naai-erp/web exec vitest run src/components/dls-compliance.test.ts src/components/automation-api-dialog.test.ts` — passed (19/19 tests).
- `T-DOC-ERP-1012-002`: `pnpm test:docs` — passed (Verified 12 accepted ADRs, 13 rule references, and 29 AI relationship resources).
- Playwright E2E: `pnpm --filter @naai-erp/web exec playwright test e2e/automation-api-dialog.spec.ts` — passed (2/2 desktop & 390px mobile).
- File-size ratchet (`BR-SIZE-001`): `node scripts/check-file-size.mjs --update && pnpm check:file-size` — passed (`automation-api-dialog.tsx` removed from baseline; `ledger-master-workspace.tsx` lowered).
- Repository quality gate: `pnpm check` — passed across all 10 workspaces.
