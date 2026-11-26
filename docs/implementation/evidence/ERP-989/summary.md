# ERP-989 Summary — One-Click Draft Recording and Batch Dry-Run/Commit for Solopreneur Owners

## Outcome

Implemented `ERP-989` (`BR-REC-001`, `BR-REC-003`) across the REST API, OpenAPI contract, solopreneur gate matrix, first-party CLI, and Web UI while keeping every new source file strictly below 500 non-blank/non-comment lines and shrinking existing >500-line workspace files.

### Key Deliverables

1. **Single-record atomic endpoints (`BR-REC-001`, `BR-REC-003`)**:
   - Added `POST /api/v1/organizations/:organizationId/expenses/:id/record` and `POST /api/v1/organizations/:organizationId/commercial-documents/:id/record` (`200 OK`, idempotent via `Idempotency-Key`).
   - Restricted to `owner` role when the organization workflow policy is `operatingMode = 'solopreneur'` (`403 FORBIDDEN` for non-owners, `409 SOLOPRENEUR_POLICY_REQUIRED` in `controlled` mode).
   - Evaluates all eligibility rules inside a single locked PostgreSQL transaction (`draft`/`submitted`/`evidence_pending`/`approved` expenses; `draft`/`captured`/`verified`/`approved` purchase invoices; `draft`/`validated` sales invoices and credit notes; base currency; open/soft-locked fiscal period; active counter/control/posting/VAT accounts; owner-current mapping; line allocations; linked `external_references` accepted as source evidence; freelancer rules; and `ERP-982` payment-evidence gating).
   - Applies `ERP-971` and `ERP-982` tax/payment-evidence defaults (`applySolopreneurExpenseDefaults` / `applySolopreneurPurchaseDocumentDefaults`), posts a balanced double-entry journal (`debit = credit`), records resource/audit/outbox events with default editable reason `"Chủ ghi sổ"`, and returns `journalId`.
   - Rolls back completely on any failure (`422 DRAFT_RECORD_BLOCKED`) with zero partial mutations and returns every structured blocker in `reasons`.

2. **Batch draft recording (`POST /drafts/record` + CLI `drafts record --dry-run|--commit`)**:
   - Added `POST /api/v1/organizations/:organizationId/drafts/record` supporting explicit `items` or organization-wide draft discovery, evaluating each item inside an isolated PostgreSQL `SAVEPOINT`.
   - `dryRun: true` performs zero database mutations (full transaction rollback after evaluation) and returns a deterministic `planHash` plus `counts`, `succeeded` (ready), `blocked`, and `items` with structured `reasons`.
   - `commit: true` verifies `planHash` (`409 DRAFT_RECORD_PLAN_MISMATCH` on drift), requires `Idempotency-Key`, commits all eligible items, leaves blocked items untouched in draft state with structured `reasons`, and writes an organization audit event.
   - Added CLI routing (`drafts record --dry-run|--commit --plan-hash <hash>`, `expenses record`, `commercial-documents record`) via `apps/cli/src/draft-recording-cli.ts` and `apps/cli/src/cit-client.ts`.

3. **Routine default reason vs mandatory ledger-change reason (`BR-REC-003`)**:
   - Routine recording and workflow transitions (`record`, `submit`, `approve`, `post`, `capture`, `verify`, `validate`, `issue`) default to `"Chủ ghi sổ"` when omitted by an owner in `solopreneur` mode while remaining editable.
   - Actions that reverse, void, discard, reject, or reclassify accounting facts (`reverse`, `cancel`, `delete`, `request-evidence`, `reject`, `reclassify-funding`, `reclassify-accounts`) continue to require an explicit non-empty reason.

4. **Web UI simplification for solopreneur owners (`BR-REC-001`, `BR-REC-003`)**:
   - Extracted `focused-record-actions.ts`, `focused-record-action-bar.tsx`, and `focused-record-quick-view-dialogs.tsx`, reducing `focused-record-list-workspace.tsx` and `focused-record-detail-workspace.tsx`.
   - When `canSaveAndRecord(capabilities)` holds (`solopreneur` + `owner`), both the detail toolbar and quick-view dialog present a single primary `"Ghi sổ"` button with an inline editable `"Lý do ghi sổ"` input defaulted to `"Chủ ghi sổ"`, hide intermediate `submit`/`approve`/`verify`/`validate`/`issue` buttons and the maker-checker self-approval warning, and move secondary exception actions (`Báo thiếu chứng từ`, `Từ chối`) into a `"Tác vụ phụ"` overflow menu.
   - `controlled` mode and non-owner roles retain the full multi-step workflow unchanged.

5. **Post-Wave-1 baseline hygiene**:
   - Fixed a duplicate partial JSON object in `db/migrations/meta/_journal.json` and unused-variable lint leftovers in `pg-expense.store.ts` and `pg-operating-dashboard.store.ts` introduced during Wave 1 merge integration so `drizzle-kit migrate` and `pnpm lint` succeed cleanly.

## Files Changed

- `apps/api/src/draft-recording/draft-recording.types.ts`
- `apps/api/src/draft-recording/draft-recording-checks.helper.ts`
- `apps/api/src/draft-recording/draft-recording-journals.helper.ts`
- `apps/api/src/draft-recording/draft-recording-batch.helper.ts`
- `apps/api/src/draft-recording/expense-record.helper.ts`
- `apps/api/src/draft-recording/commercial-document-record.helper.ts`
- `apps/api/src/draft-recording/draft-recording.service.ts`
- `apps/api/src/draft-recording/draft-recording.controller.ts`
- `apps/api/src/draft-recording/draft-recording.test-helper.ts`
- `apps/api/src/draft-recording/draft-recording.integration.test.ts`
- `apps/api/src/expenses/expense.controller.ts`
- `apps/api/src/expenses/expense.service.ts`
- `apps/api/src/expenses/pg-expense.store.ts`
- `apps/api/src/commercial-documents/commercial-document.controller.ts`
- `apps/api/src/commercial-documents/commercial-document.service.ts`
- `apps/api/src/operating-dashboard/pg-operating-dashboard.store.ts`
- `apps/api/src/api-exception.filter.ts`
- `apps/api/src/app.module.ts`
- `apps/cli/src/draft-recording-cli.ts`
- `apps/cli/src/draft-recording-cli.test.ts`
- `apps/cli/src/cit-client.ts`
- `apps/cli/src/main.ts`
- `apps/web/src/app/workspaces/focused-record-actions.ts`
- `apps/web/src/app/workspaces/focused-record-actions.test.ts`
- `apps/web/src/app/workspaces/focused-record-action-bar.tsx`
- `apps/web/src/app/workspaces/focused-record-quick-view-dialogs.tsx`
- `apps/web/src/app/workspaces/focused-record-detail-workspace.tsx`
- `apps/web/src/app/workspaces/focused-record-list-workspace.tsx`
- `apps/web/src/lib/api/error-messages.ts`
- `db/migrations/meta/_journal.json`
- `scripts/verify-solopreneur-gate-matrix.mjs`
- `docs/api/openapi-v1.json`
- `docs/implementation/solopreneur-gate-matrix.json`
- `docs/product/business-rules.md`
- `docs/testing/test-specification.md`
- `docs/testing/test-catalog.yaml`
- `docs/implementation/task-ledger.yaml`
- `docs/implementation/evidence/ERP-989/{summary,tests,acceptance,risks}.md`
