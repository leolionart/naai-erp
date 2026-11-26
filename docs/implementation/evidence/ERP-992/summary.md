# ERP-992 — Repair stale integration and Playwright tests using the reference patch

## Outcome

Repaired the stale non-aging PostgreSQL integration fixtures/teardowns and refreshed the legacy Playwright specs in `apps/web/e2e/focused-records.spec.ts` while keeping every touched/created source file at or below the 500-line ESLint threshold.

## Files Changed

- `apps/api/src/customer-service-subscriptions/customer-service-subscription.integration.test.ts`: deleted `operational_activity_logs` rows for the test organization before deleting `organizations` in `afterAll`.
- `apps/api/src/portable-data-packages/empty-organization-restore.integration.test.ts`: seeded bootstrap chart-of-accounts rows (`112`, `411`) in the target organization prior to `restore-empty`.
- `apps/api/src/portable-data-packages/local-organization-reset.integration.test.ts`: switched to `randomUUID()` organization/credential identifiers and deleted `operational_activity_logs` before `organizations` in `afterAll`.
- `apps/api/src/report-exports/management-workbook.integration.test.ts`: randomized organization/token IDs, deleted `operational_activity_logs` in `afterAll`, and updated worksheet/cell assertions for the 3 ERP-958 `Dashboard ...` sheets (`Dashboard nguồn`, `Dashboard metrics`, `Dashboard tháng`).
- `apps/api/src/report-exports/accountant-exports.integration.test.ts`: randomized `org`, `otherOrg`, `token`, and `otherToken` with `randomUUID()` so repeated runs on a shared database never collide on `organizations_pkey` or `api_credentials_token_hash_unique`.
- `apps/web/playwright.config.ts`: pinned mock `NEXT_PUBLIC_*` environment variables on `webServer.env` (overriding any local `.env.local` values) and configured `--webpack --hostname localhost` matching `baseURL` (`http://localhost:${port}`) to avoid cross-origin HMR blocks and Turbopack dotdir/symlink watcher reload loops.
- `apps/web/e2e/focused-records.fixtures.ts`: extracted shared mocked API fixtures and added canonical `master-data/categories`, `expense-categories`, and `POST .../validate` route handlers (`<= 500` lines).
- `apps/web/e2e/focused-records.spec.ts`: updated stale `/documents` routes to `/revenue` (preserving query parameters previously stripped on redirect), disambiguated `getByLabel("Dự án", { exact: true })` and `getByRole("option", { name: "Có hóa đơn", exact: true })`, aligned Quick View and create-dialog assertions with current in-place editing (`Lưu bản nháp`, category selection before funding policy hint), and kept the file `<= 500` lines.
- `docs/testing/test-catalog.yaml` & `docs/implementation/task-ledger.yaml`: registered `T-INT-REPAIR-001` and marked `ERP-992` `done`.

## Coordination Note

Left `apps/api/src/aging/` untouched to avoid merge conflicts with `ERP-984`, which is implementing AP aging repairs in parallel.
