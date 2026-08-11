# ERP-914 tests

- `pnpm --filter @naai-erp/web exec vitest run src/components/automation-api-dialog.test.ts` — 12 passed.
- Representative payload regression: `27/07/2026 07:22:52` becomes `2026-07-27`, `408.601`
  becomes `408601`, tax ID punctuation is removed and `00250571` is extracted from content.
- Focused desktop Expense automation-dialog Playwright — 1 passed.
- Focused mobile Expense automation-dialog Playwright — 1 passed.
- Web lint, documentation validation and diff whitespace check — passed.
