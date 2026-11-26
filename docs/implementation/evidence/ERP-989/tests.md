# ERP-989 Test Evidence

## 1. Scratch PostgreSQL Migration & Integration Suites (`T-INT-REC-001`, `T-INT-REC-002`)

Executed against disposable migrated PostgreSQL 16 scratch databases (`db:migrate` across all 78 migrations):

- `RUN_DB_INTEGRATION=1 DATABASE_URL="postgresql://admin@127.0.0.1:5432/<scratch_db>" pnpm --filter @naai-erp/api exec vitest run src/draft-recording/draft-recording.integration.test.ts src/operating-dashboard/operating-dashboard.integration.test.ts`
  - `src/draft-recording/draft-recording.integration.test.ts` — **2 passed (2)**:
    - `T-INT-REC-001`: Atomic one-click recording for draft expenses (`invoice_backed` with `externalReference` as evidence, `< 5M` cash eligible vs `>= 5M` cash payment-evidence gating with `requirePaymentEvidence` vs default withheld tax) and commercial documents (`purchase_invoice` -> `paid`, `sales_invoice` -> `issued`), default reason `"Chủ ghi sổ"`, balanced journal verification (`debit = credit`), idempotent replay, `403` non-owner rejection, complete rollback with multi-reason array (`PERIOD_HARD_LOCKED`, `COUNTER_ACCOUNT_MISSING`, `OWNER_CURRENT_ACCOUNT_REQUIRED`, `EXPENSE_EVIDENCE_INCOMPLETE`), and mandatory reason enforcement on `reverse` and `reclassify-funding` (`BR-REC-003`).
    - `T-INT-REC-002`: `POST /drafts/record` `dryRun` zero-mutation verification, `409 DRAFT_RECORD_PLAN_MISMATCH` on invalid `planHash`, savepoint-isolated `commit` recording 2 eligible items while leaving 1 hard-locked item untouched in `draft` with structured `reasons`, idempotent replay, and `409 SOLOPRENEUR_POLICY_REQUIRED` when switched to `controlled` mode.
  - `src/operating-dashboard/operating-dashboard.integration.test.ts` — **6 passed (6)**
- Regression suites on scratch PostgreSQL DB:
  - `src/commercial-documents/commercial-document.integration.test.ts` — **15 passed (15)**
  - `src/expenses/expense.integration.test.ts` — **15 passed (15)**
  - `src/payment-evidence/payment-evidence.integration.test.ts` — **1 passed (1)**

## 2. Unit & CLI Contract/End-to-End Tests

- `pnpm --filter @naai-erp/cli exec vitest run src/draft-recording-cli.test.ts src/client.test.ts src/main.test.ts`
  - `src/draft-recording-cli.test.ts` — **3 passed (3)** (payload validation, REST route resolution, and end-to-end `tsx src/main.ts drafts record --dry-run|--commit` execution)
  - `src/client.test.ts` — **99 passed (99)**
  - `src/main.test.ts` — **22 passed (22)**
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/focused-record-actions.test.ts src/lib/api/error-messages.test.ts`
  - `src/app/workspaces/focused-record-actions.test.ts` — **4 passed (4)**
  - `src/lib/api/error-messages.test.ts` — **4 passed (4)**
- `pnpm --filter @naai-erp/api exec vitest run src/expenses/expense.service.test.ts src/commercial-documents/commercial-document.service.test.ts src/master-data/resource-registry.test.ts`
  - **45 passed (45)** across 3 suites

## 3. Playwright End-to-End UI Verification

- `REAL_UI_ADMIN_DATABASE_URL="postgresql://admin@127.0.0.1:5432/postgres" node scripts/run-real-ui-e2e.mjs`
  - **8 passed (8)** against real Next.js + real NestJS API + migrated scratch PostgreSQL DB (`real-ui-operations.spec.ts`), including one-click `"Ghi sổ"` on `/expenses/:id` and batch draft dry-run + `planHash` commit via `POST /drafts/record`.
- `pnpm --filter @naai-erp/web exec playwright test e2e/focused-records.spec.ts`
  - Verified existing controlled/fixture UI journeys remain intact.

## 4. Repository Quality & Contract Gates

- `node scripts/verify-docs.mjs` — **PASSED**
- `node scripts/verify-solopreneur-gate-matrix.mjs` — **PASSED** (`Verified 135/135 OpenAPI mutations; no financial surface is classified none.`)
- `pnpm lint` — **PASSED** (0 errors across workspace; 0 `max-lines` warnings on all new files)
- `pnpm typecheck` — **PASSED** (10/10 workspace packages)
- `pnpm format:check` — **PASSED**
