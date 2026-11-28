# ERP-1007 - SQL keyset pagination for remaining dated list routes

- Migration `0081_keyset_list_indexes_2.sql` adds `(organization_id, <date/timestamptz> desc, id)` btree indexes for `internal_transfers`, `project_freelance_payables`, `report_snapshots`, `accountant_exports`, and `workbook_import_review_rows`.
- `GET /banking/internal-transfers` pages in SQL by `(created_at, id)` using `EXISTS` for `financialAccountId` (avoiding `DISTINCT` across joined legs) and expands `view` only for rows in the returned page.
- `GET /project-freelance-payables` pages in SQL by `(due_date, id)`, retains its bare-array `data` shape with `page` and `meta` beside it, and changes `get(org, id)` to query a single row directly instead of scanning the full list.
- `GET /report-snapshots` and `GET /accountant-exports` page in SQL by `(captured_at, id)` and `(generated_at, id)` via `report-export-list.queries.ts` (shrinking `pg-report-export.store.ts`), omitting `bytea` content on export list queries and batch-loading referenced snapshots.
- `GET /workbook-imports/review-rows` preserves RBAC verification order (`requireReviewRole` first) and pages in SQL by `(created_at, id)` with `limit`, `cursor`, `sort`, `q`, `status`, and `includeTotal`.
