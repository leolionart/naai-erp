# ERP-335 Tests

- `pnpm --filter @naai-erp/web typecheck`: passed.
- `pnpm --filter @naai-erp/web test`: 2 files, 4 tests passed.
- `pnpm --filter @naai-erp/web build`: passed.
- Playwright fallback QA at `http://localhost:3000` (Browser runtime unavailable):
  - documents form opened and `Số hóa đơn` became visible;
  - ledger workspace rendered the `Bút toán` control;
  - evidence workspace rendered its operational heading;
  - mobile viewport retained 10 navigation items;
  - no browser console errors were observed.
- Exact-commit PostgreSQL CI passed: https://github.com/leolionart/naai-erp/actions/runs/30998376669
