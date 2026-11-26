# ERP-992 — Acceptance

- Cleanup (`operational_activity_logs` before deleting `organizations`) in `customer-service-subscription` and `management-workbook` (plus `local-organization-reset`): verified across repeated scratch-DB runs with zero foreign-key violations.
- `management-workbook` expectations updated for the 3 ERP-958 `Dashboard ...` sheets (`Dashboard nguồn`, `Dashboard metrics`, `Dashboard tháng`) and reconciliation formula/value presence: verified in `management-workbook.integration.test.ts`.
- Target organization chart of accounts (`112`, `411`) seeded in `empty-organization-restore`: verified in `empty-organization-restore.integration.test.ts` (HTTP 201, balanced journal count and target hash match).
- Randomized unique organization/credential IDs in `accountant-exports` (and `management-workbook` / `local-organization-reset`): verified by running the suite twice consecutively against the same PostgreSQL database with zero primary-key or token-hash collisions.
- Stale Playwright specs in `apps/web/e2e/focused-records.spec.ts` repaired (`/documents` -> `/revenue`, exact `Dự án` and `Có hóa đơn` locators, mocked `master-data/categories`, updated create/quick-view labels, and hermetic `NEXT_PUBLIC_*` mock env in `apps/web/playwright.config.ts`): verified with 26/26 passing specs.
- 500-line rule respected: extracted `apps/web/e2e/focused-records.fixtures.ts` so both `focused-records.fixtures.ts` and `focused-records.spec.ts` satisfy ESLint `max-lines` (`<= 500` lines excluding blanks/comments) with zero warnings.
