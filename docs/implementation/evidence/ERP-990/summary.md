# ERP-990 Summary — Auto-Record Flag for Integration Sources with Visible Draft Reasons

## Outcome

Implemented `ERP-990` (`BR-REC-002`) across PostgreSQL (`0079_integration_auto_record_and_draft_reasons.sql`), Drizzle schema, REST API, OpenAPI contract, solopreneur gate matrix, first-party CLI, and Web UI while keeping every new source file strictly `<= 500` lines and shrinking all touched `> 500`-line files (`pg-expense.store.ts`, `pg-commercial-document.store.ts`, `apps/cli/src/client.ts`, `apps/cli/src/main.ts`, `focused-record-list-workspace.tsx`).

### Key Deliverables

1. **Database migration `0079` and Drizzle schema**:
   - Added `name`, `auto_record` (default `false`), `version`, and `updated_at` on `api_credentials`.
   - Added `auto_record` (default `false`) on `integration_sources`.
   - Added `draft_reasons jsonb not null default '[]'::jsonb` on `expenses` and `commercial_documents`.
   - Updated `db/migrations/meta/_journal.json` (`idx: 78`).

2. **Organization-scoped integration configuration API (`IntegrationSettingsController` / `IntegrationSettingsService` / `PgIntegrationSettingsStore`)**:
   - `GET /api/v1/organizations/:organizationId/integration-sources`: returns current `operatingMode`, redacted `apiCredentials` (never exposing `token_hash`), and `webhookSources` (never exposing secret values).
   - `GET /api/v1/organizations/:organizationId/integration-sources/:id`, `POST /api/v1/organizations/:organizationId/integration-sources`, `PATCH /api/v1/organizations/:organizationId/integration-sources/:id`: audited, idempotent, optimistic-versioned webhook source management (`owner` / `finance_admin`).
   - `GET /api/v1/organizations/:organizationId/api-credentials`, `PATCH /api/v1/organizations/:organizationId/api-credentials/:id`: audited, idempotent, optimistic-versioned `autoRecord` and `name` updates on service/API tokens (`owner` / `finance_admin`).

3. **Atomic savepoint auto-recording on ingestion & visible `reasons` fallback (`auto-record-ingestion.helper.ts`)**:
   - Propagated `autoRecord` from authenticated `api_credentials` (`PgMasterDataStore.authenticate`) and verified `integration_sources` (`PgInboundWebhookStore.source` / `InboundWebhookService.process`).
   - During `PgExpenseStore.create` and `PgCommercialDocumentStore.create`, when `operatingMode === 'solopreneur'` and `context.autoRecord === true` on a non-owner integration actor:
     - Executes `recordExpenseOnClient` / `recordCommercialDocumentOnClient` inside a PostgreSQL `SAVEPOINT` using default reason `"Tự động ghi sổ từ nguồn tích hợp"`.
     - **Eligible items**: reach `posted` / `paid` / `issued` immediately with one balanced journal (`debit = credit`), `ERP-971`/`ERP-982` defaults, singular posted outbox event (`BR-NOTIFY-003`), and audit records under the integration `actorId` (`autoRecorded: true`).
     - **Blocked items**: roll back the savepoint with zero partial ledger mutations, stay in `draft` state (`autoRecorded: false`), persist structured `reasons` into `draft_reasons`, and record an `auto_record_blocked` audit event under the integration `actorId`.
   - `GET /expenses`, `GET /expenses/:id`, `GET /commercial-documents`, and `GET /commercial-documents/:id` expose `reasons` and `draftReasons` while in `draft` state and clear `draft_reasons` upon draft edit or recording/posting/issuing.
   - `controlled` operating mode and `autoRecord = false` always preserve `draft` state.

4. **CLI & Web UI Parity**:
   - Added `apps/cli/src/integration-sources-cli.ts` supporting `integration-sources list|get|create|update|set-auto-record` and `api-credentials list|update|set-auto-record` with `--auto-record true|false`, plus typed `NaaiErpClient` methods.
   - Added `/settings/automation` (`automation-settings` in sidebar under `Cấu hình & Vận hành`) and embedded `IntegrationAutoRecordSection` in `/settings/master-data`.
   - Added `DraftReasonsBadge` and `DraftReasonsAlert` (`draft-reasons-banner.tsx`) on Revenue/Expense list rows, quick-view dialogs, and detail pages.
