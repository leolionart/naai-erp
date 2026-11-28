# ERP-1008 Summary

## Outcome

Removed ad-hoc `?limit=100..500` query parameters from master-data lookup requests across web workspaces (`parties`, `party-roles`, `projects`, `categories`, `expense-categories`, `purchase-products`, `dimensions`, `contracts`, and `milestones`) so `createApiClient` automatically follows `nextCursor` across all backend pages instead of treating those lookups as self-paged and truncating after the 100-item backend page limit.

## Root Cause & Fix

- `createApiClient` (`apps/web/src/lib/api/client.ts`) treats any path containing `limit=` or `cursor=` as `isSelfPaged` and returns only the first page.
- Backend `master-data/*` routes cap `limit` at `100`. Once organization `naai` exceeded 100 parties (growing to 127 after historical 2024 supplier ingestion), parties `#101..#127` were omitted from the frontend lookup map and fell back to rendering raw IDs (`party-tax-...`).
- Dropping manual `?limit=...` parameters allows `followPages` to fetch every page transparently while respecting the client safety cap.

## Files Changed

- `apps/web/src/app/workspaces/focused-record-shared.ts`
- `apps/web/src/app/workspaces/focused-record-shared.test.ts`
- `apps/web/src/app/workspaces/focused-record-create-workspace.tsx`
- `apps/web/src/app/workspaces/customer-subscription-workspace.tsx`
- `apps/web/src/app/workspaces/project-freelance-payables-workspace.tsx`
- `apps/web/src/app/workspaces/business-directory-workspace.tsx`
- `apps/web/src/app/workspaces/expense-category-policy-workspace.tsx`
- `apps/web/src/app/workspaces/category-catalog-workspace.tsx`
- `apps/web/src/app/workspaces/purchase-product-workspace.tsx`
- `apps/web/src/app/workspaces/dashboard/dashboard-filters-popover.tsx`
- `docs/product/business-rules.md`
- `docs/testing/test-specification.md`
- `docs/testing/test-catalog.yaml`
- `docs/implementation/task-ledger.yaml`
