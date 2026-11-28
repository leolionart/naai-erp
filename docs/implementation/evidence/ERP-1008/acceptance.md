# ERP-1008 Acceptance

1. **Master-data lookups paginate past 100 items (`BR-MVP-007`, `BR-READ-001`)**: Verified in `focused-record-shared.test.ts` (`T-UNIT-ERP-1008-001`) and `client.test.ts` (`T-UNIT-READ-009`) that lookup paths omit manual `limit=`/`cursor=` query parameters and automatically follow `nextCursor` across pages.
2. **Supplier/payee display names render instead of raw `party-tax-...` IDs**: Verified all 127 production parties carry populated `display_name` values and are fetched across pages by Revenue Management, Expense Management, Business Directory, Subscriptions, and Admin Catalog workspaces.
3. **File-size ratchet (`BR-SIZE-001`) and docs contracts**: Verified via `pnpm check:file-size` and `pnpm test:docs`.
