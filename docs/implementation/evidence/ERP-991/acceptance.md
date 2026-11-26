# ERP-991 — Acceptance Verification

- **Real-UI Playwright specs against real API + scratch PostgreSQL (no mocks)**:
  - Verified in `apps/web/e2e/real-ui-operations.spec.ts` via `pnpm test:e2e:real` (`scripts/run-real-ui-e2e.mjs`): zero `page.route` stubs are used; every UI action mutates and reads back from a live `@naai-erp/api` instance backed by a freshly migrated disposable PostgreSQL database seeded with canonical categories only (`business_categories` and `expense_categories`, zero `dimension_values` rows).
- **Zero background API errors and canonical lookups (`BR-EDIT-001`)**:
  - `attachApiFailureMonitor` verifies `/expenses` and `/revenue` render canonical category badges (`Văn phòng`, `Dịch vụ`) on desktop and 390px mobile with zero `>= 400` API responses and zero requests to obsolete `expense-categories` or `time/workers` routes.
- **Edit metadata & change canonical category (posted & draft)**:
  - Verified in-place Quick View metadata + canonical category edits on a posted expense (`OFFICE -> TRAVEL`, `PATCH /expenses/{id}/metadata`), an issued sales invoice (`SERVICE -> CONSULTING`, `PATCH /commercial-documents/{id}/metadata`), and an integration-created draft expense (`OFFICE -> TRAVEL`, `PATCH /expenses/{id}`), confirming state and original `journalId` preservation via API readback.
- **Reclassify funding (posted expense & posted purchase invoice)**:
  - Verified Quick View `"Đổi nguồn thanh toán"` moves a posted expense from `3388-OWNER` to owner-held custody cash (`fa-custody` / `111-CASH`) and moves a posted purchase invoice to company bank (`112-BANK`), reversing/cancelling originals and auto-posting linked replacements in solopreneur mode.
- **Void posted records & delete drafts**:
  - Verified Quick View `"Void (đảo bút toán)"` reverses a posted expense (`state = reversed`) and cancels an issued sales invoice (`state = cancelled`), `"Xóa bản nháp"` discards an integration draft expense, and `"Xóa hóa đơn nháp"` deletes an OCR-ingested draft purchase invoice (`404` on readback).
- **Single & batch recording**:
  - Verified owner single-step `"Lưu và ghi nhận"` from the create dialog, single integration-draft recording on `/expenses/{id}` (supporting one-click `"Ghi sổ"` when available or `submit -> approve -> post`), and batch draft recording via `recordDraftBatchCompat` (`POST /drafts/record` when available or sequential fallback).
- **Vietnamese error translation & load-vs-action alert separation**:
  - Verified a real `409 VERSION_CONFLICT` from `PATCH /expenses/{id}/metadata` renders under `"Không thể thực hiện thao tác"` (never `"Không thể tải dữ liệu"`) with translated Vietnamese copy instead of raw `VERSION_CONFLICT`.
- **CI wiring and 500-line code-size rule**:
  - Wired `pnpm test:e2e:real` into `package.json`, `apps/web/package.json`, and `.github/workflows/ci.yml`; all new files are well under 500 lines.
