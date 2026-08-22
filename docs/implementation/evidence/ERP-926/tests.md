# Tests

- `pnpm --filter @naai-erp/web test` — passed (26 files, 87 tests)
- `pnpm --filter @naai-erp/web typecheck` — passed
- `pnpm --filter @naai-erp/web build` — passed (49 routes)
- `pnpm test:docs` — passed
- Raw palette scan over `apps/web/src` — passed; no raw color utility overrides found.
- Browser visual smoke — unavailable in this environment (no connected browser); production build is the fallback validation.
