# ERP-1007 risks

- Default sort order changed to deterministic `(created_at desc, id)` for `internal-transfers` and `workbook-imports/review-rows`, and `(due_date desc, id)` for `project-freelance-payables` (`sort=date_asc` restores ascending order).
- Remaining low-cardinality configuration/lookup GET routes continue using `BoundedListInterceptor` in-memory paging as tracked in `docs/api/list-endpoint-inventory.md`.
