# ERP-968

- New `POST /commercial-documents/{id}/reverse` voids an issued/posted document with a reversing journal (no replacement).
- Expense and revenue quick view and detail pages now offer delete draft / cancel / void with a mandatory reason (`RecordVoidControl`, `voidPlan`).
- Table column visibility is stored by header label per route (`table-columns.ts`), instead of by position and label set.
