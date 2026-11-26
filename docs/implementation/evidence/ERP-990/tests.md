# ERP-990 Test Evidence (`T-INT-REC-003`)

## 1. Scratch PostgreSQL Migration & Integration Suites

Executed against disposable migrated PostgreSQL 16 scratch databases (`pnpm db:migrate` across all 79 migrations including `0079_integration_auto_record_and_draft_reasons.sql`):

- `RUN_DB_INTEGRATION=1 DATABASE_URL="postgresql://admin@127.0.0.1:5432/<scratch_db>" pnpm --filter @naai-erp/api exec vitest run src/integration-settings/auto-record.integration.test.ts src/draft-recording/draft-recording.integration.test.ts src/inbound-webhooks/inbound-webhook.integration.test.ts src/expenses/expense.integration.test.ts src/commercial-documents/commercial-document.integration.test.ts src/portable-data-packages/empty-organization-restore.integration.test.ts`
  - `src/integration-settings/auto-record.integration.test.ts` — **3 passed (3)** (`T-INT-REC-003`):
    - `T-INT-REC-003a`: `autoRecord = false` defaults on `api_credentials` and `integration_sources`, `403 FORBIDDEN` for integration actors reading/mutating and accountants mutating settings, zero disclosure of `token_hash` or signing secret values, audited/idempotent webhook source creation, and ingested items remaining `draft` when `autoRecord = false`.
    - `T-INT-REC-003b`: Enabling `autoRecord = true` in `solopreneur` mode auto-records eligible expenses (`posted`), sales invoices (`issued`), and HMAC-signed inbound webhook purchase invoices (`paid`) with balanced `debit = credit` journals, audited under integration identities (`n8n-bot`, `paperless-bot`) without an `owner` token, singular posted outbox events, and idempotent replay.
    - `T-INT-REC-003c`: Blocked items (`PERIOD_HARD_LOCKED`, `EXPENSE_EVIDENCE_INCOMPLETE`) roll back their recording savepoint cleanly and remain `draft` with structured `reasons` returned on create, `GET /expenses`, `GET /expenses/:id`, and `GET /commercial-documents/:id`; owner fixing and recording clears `reasons` to `[]`; switching to `controlled` mode keeps `autoRecord = true` sources in `draft`.
  - `src/draft-recording/draft-recording.integration.test.ts` — **2 passed (2)**
  - `src/inbound-webhooks/inbound-webhook.integration.test.ts` — **3 passed (3)**
  - `src/expenses/expense.integration.test.ts` — **15 passed (15)**
  - `src/commercial-documents/commercial-document.integration.test.ts` — **15 passed (15)**
  - `src/portable-data-packages/empty-organization-restore.integration.test.ts` — **1 passed (1)**

## 2. CLI, Web UI & API Unit Suites

- `pnpm --filter @naai-erp/cli exec vitest run src/integration-sources-cli.test.ts src/client.test.ts src/main.test.ts`
  - `src/integration-sources-cli.test.ts` — **3 passed (3)**
  - `src/client.test.ts` — **99 passed (99)**
  - `src/main.test.ts` — **22 passed (22)**
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/draft-reasons-banner.test.ts src/lib/navigation.test.ts src/components/layout/app-navigation.test.tsx`
  - **7 passed (7)** across 3 suites
- `pnpm --filter @naai-erp/api exec vitest run src/master-data/master-data.service.test.ts src/expenses/expense.service.test.ts src/commercial-documents/commercial-document.service.test.ts src/discovery/mvp-discovery.test.ts`
  - **49 passed (49)** across 4 suites

## 3. Repository Quality & Contract Gates

- `node packages/database/scripts/verify-migrations.mjs` — **PASSED**
- `node scripts/verify-docs.mjs` — **PASSED**
- `node scripts/verify-solopreneur-gate-matrix.mjs` — **PASSED** (`Verified 141/141 OpenAPI mutations; no financial surface is classified none.`)
- `pnpm lint` — **PASSED**
- `pnpm typecheck` — **PASSED**
- `pnpm exec prettier --check` — **PASSED**
