# ERP-988 — Summary

## Outcome

Implemented `ERP-988` (`BR-EDIT-001`) to fix metadata/category edits on real organization data, eliminate stale background API requests on Revenue and Expense workspaces, translate raw API error codes into clear Vietnamese messages, and separate load error banners from action error banners.

## Key Changes

- **F1 — Canonical category validation (`BR-EDIT-001`)**:
  - Extracted `apps/api/src/master-data/canonical-category-validation.ts` (`resolveExpenseCategory`, `applyExpenseLineCategoryUpdate`, `assertDocumentCategory`, `applyDocumentLineCategoryUpdate`) and wired it into `pg-expense.store.ts` (`updateMetadata`, `updateCategory`) and `pg-commercial-document.store.ts` (`insertDocumentLine`, `updateMetadata`, `updateCategory`).
  - Validates categories against canonical organization catalogs (`expense_categories` and `business_categories`), rejects deactivated canonical entries, and falls back to legacy `dimension_values(kind='category')` only when absent from canonical catalogs.
- **F2 — Expense category endpoint path**:
  - Fixed `focused-record-list-workspace.tsx` (via `CATEGORY_LOOKUP_ENDPOINTS` in `focused-record-shared.ts`) to request `master-data/expense-categories?limit=200` instead of non-existent `expense-categories`.
- **F3 — Obsolete `time/workers` cleanup**:
  - Removed `GET time/workers` calls from `focused-record-list-workspace.tsx` and `focused-record-detail-workspace.tsx`, resolving `client`, `supplier`, `freelancer`, and `employee` options from canonical `master-data/party-roles` (`partiesByRole`).
  - Hardened `apps/api/src/time/time.controller.ts` to handle lowercase `workforce_profiles` and SQLSTATE `42P01` gracefully by returning an empty `items` array.
- **F4 — Vietnamese error translation and load-vs-action separation**:
  - Added `apps/web/src/lib/api/error-messages.ts` (`VIETNAMESE_API_ERROR_MESSAGES`, `translateApiErrorCode`, `resolveApiClientErrorMessage`, `formatApiErrorMessage`) and integrated it with `ApiClientError` and focused record workspaces.
  - Added `apps/web/src/app/workspaces/focused-record-alerts.tsx` (`FocusedRecordErrorAlert`) and extracted `focused-record-detail-dialogs.tsx` to keep files concise and render distinct headings for load errors (`Không thể tải dữ liệu`) versus action errors (`Không thể thực hiện thao tác`).
