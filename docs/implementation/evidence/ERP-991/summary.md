# ERP-991 — Summary

## Outcome

Implemented `ERP-991` (`T-E2E-EDIT-003`, `BR-EDIT-001`) by converting the real-UI verification harness (`docs/implementation/plans/ui-verification-harness/`) into an executable Playwright spec suite (`apps/web/e2e/real-ui-operations.spec.ts`) driven against the real `@naai-erp/api` server and a disposable migrated scratch PostgreSQL database with zero route mocks, and wired it into `package.json` (`pnpm test:e2e:real`) and `.github/workflows/ci.yml`.

## Key Changes

- **Disposable scratch PostgreSQL + real server runner (`scripts/run-real-ui-e2e.mjs`)**:
  - Allocates conflict-free loopback ports, creates a fresh `naai_ui_*` scratch database via `pg`, applies all Drizzle migrations (`@naai-erp/database db:migrate`), and seeds canonical organization data (`org-ui` with canonical `business_categories` and `expense_categories` only and zero `dimension_values` rows, TT133 accounts, statement mapping, parties/roles, project/contract, cash/custody/bank financial accounts, `solopreneur` policy, and owner/integration credentials).
  - Starts the real `@naai-erp/api` server and `@naai-erp/web` Next.js server with sanitized environment variables (ignoring `.env.local` / `NAAI_ERP_PROD_*` leakage), runs Playwright with `playwright.real.config.ts`, and deterministically stops process groups and drops the scratch database in `finally` / signal handlers.
- **Playwright configuration & helpers (`apps/web/playwright.real.config.ts`, `apps/web/playwright.config.ts`, `apps/web/e2e/real-ui-helpers.ts`)**:
  - Isolated `real-ui-*.spec.ts` from the mocked `pnpm test:e2e` config while running both `@desktop` and `@mobile` Chromium projects in `pnpm test:e2e:real`.
  - Added typed real-API seeding/readback helpers, an automatic `attachApiFailureMonitor` asserting zero unexpected `/api/v1/` `>= 400` responses and zero calls to obsolete endpoints (`expense-categories`, `time/workers`), and a forward-compatible `recordDraftBatchCompat` helper ready for `ERP-989` (`POST /drafts/record` / `POST .../record`).
- **Real-UI bug caught and fixed during verification (`apps/web/src/components/forms/record-allocation-normalizer.ts`, `document-expense-forms.tsx`)**:
  - Running the draft-edit spec against the real API and PostgreSQL database immediately caught a real payload mismatch hidden by mocked Playwright tests: `GET /expenses/:id` returns snake_case PostgreSQL allocation rows (`allocation_number`, `amount_minor`, `dimensions.allocationId`) without a top-level `id`, causing `ExpenseForm` / `DocumentForm` draft `PATCH` submissions to fail `EXPENSE_ALLOCATION_INVALID`.
  - Extracted `normalizeExistingAllocations` (with unit tests in `record-allocation-normalizer.test.ts`) to preserve canonical allocation IDs and minor-unit amounts cleanly while keeping all new files well under 500 lines.
- **CI and documentation**:
  - Wired `pnpm test:e2e:real` into root `package.json`, `apps/web/package.json`, and `.github/workflows/ci.yml`.
  - Documented `T-E2E-EDIT-003` in `docs/testing/test-specification.md`, `docs/testing/test-catalog.yaml`, `docs/product/business-rules.md`, and `docs/implementation/plans/ui-verification-harness/README.md`.
