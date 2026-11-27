# ERP-997 — Acceptance

- `BR-READ-001` / `BR-READ-002`: every organization-scoped collection GET not yet using SQL keyset is bounded by `BoundedListInterceptor` (`apps/api/src/common/bounded-list.interceptor.ts`, default 50, max 200) and returns `page`/`hasMore`/`nextCursor`/`meta`.
- `T-UNIT-READ-008`: verified by `apps/api/src/common/bounded-list.interceptor.test.ts` and `pnpm check:list-inventory`.
