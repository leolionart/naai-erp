# ERP-988 — Acceptance Verification

- **F1 (`BR-EDIT-001` canonical category validation)**:
  - Verified in `canonical-category-validation.test.ts` (`6/6`), `expense.integration.test.ts` (`T-INT-EDIT-001`), and `commercial-document.integration.test.ts` (`T-INT-EDIT-001`) against a real migrated scratch PostgreSQL database: organizations with canonical `business_categories` / `expense_categories` and no `dimension_values` rows succeed on `PATCH .../metadata` and `PATCH .../category`; deactivated canonical categories reject with `CATEGORY_NOT_FOUND` without falling back to stale legacy rows; legacy-only categories still work as fallback.
- **F2 (`master-data/expense-categories` path)**:
  - Verified in `focused-record-list-workspace.tsx` and `focused-record-shared.test.ts`: `CATEGORY_LOOKUP_ENDPOINTS` queries `master-data/categories` and `master-data/expense-categories?limit=200`.
- **F3 (Remove `GET time/workers` and guard missing `workforce_profiles`)**:
  - Verified across `focused-record-list-workspace.tsx`, `focused-record-detail-workspace.tsx`, `focused-record-shared.test.ts`, and `time.controller.test.ts`: UI resolves employee/freelancer/supplier/client roles from `master-data/party-roles` without calling `time/workers`, and `TimeController` safely returns empty `items` on `42P01` / lowercase `workforce_profiles`.
- **F4 (Vietnamese error translation + load vs action error separation)**:
  - Verified in `error-messages.test.ts` and `focused-record-alerts.test.tsx`: raw API error codes (`CATEGORY_NOT_FOUND`, `EXPENSE_REVIEW_INCOMPLETE`, `INVALID_EXPENSE_TRANSITION`, `AUTH_REQUIRED`, etc.) render clear Vietnamese messages while load errors (`Không thể tải dữ liệu`) and action errors (`Không thể thực hiện thao tác`) use separate state and alert titles, including inside active dialogs.
