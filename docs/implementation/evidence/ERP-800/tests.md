# ERP-800 Tests

- `T-INT-ERP-800-001`: dry-run inventory and deterministic review-row classification.
- `T-INT-ERP-800-002`: atomic/idempotent staging persistence, organization isolation, version conflict and audit proof.
- `T-E2E-ERP-800-001`: review queue filters, focused detail editing and persisted readback.

Local proof:

- Fresh native PostgreSQL migration plus workbook import integration: 10/10 passed.
- Real workbook mapping-v3 extraction: 399 stable review IDs; 345 pending, 54 posted; complete project/sales/expense raw fields, 111 control/master rows, PII exclusion and 25 duplicate Paperless-reference flags passed.
- Full CLI suite: 253 passed, 2 skipped.
- Full Playwright suite: 69 passed.
- Repository `pnpm check`: passed, including 31/31 native DB tests and production build of `/imports/review`.
- Mapping-v3 Playwright smoke renders 399 total / 345 pending / 54 processed, all new control kinds,
  interactive chart filtering and desktop/mobile layouts without console/API errors.
- Exact-commit CI proof is recorded after the implementation push; no deployment is part of G8.

2026-08-06 mapping-v3 proof:

- `ERP740_PROJECT_WORKBOOK=... ERP740_FINANCE_WORKBOOK=... pnpm --filter @naai-erp/cli test -- import-workbooks.real.test.ts`: 256 passed.
- `pnpm --filter @naai-erp/cli typecheck`: passed.
- `pnpm --filter @naai-erp/api test -- workbook-import.integration.test.ts`: 81 passed, 76 skipped because PostgreSQL-gated suites were not enabled by that command.
- `pnpm --filter @naai-erp/api typecheck`: passed.
- `pnpm test:docs`: passed.
- Live API dry-run: valid, zero errors, 108 warnings, no mutations.
- Live API commit: zero new parties/projects/documents/expenses, 14 zero-value expenses skipped, staging updated idempotently to 399 rows.
- Post-commit readback: 0 payroll PII leaks; 25 duplicate invoice-file rows flagged; canonical counts unchanged at 29 projects, 41 documents, 200 expenses and 241 journals; ledger debit and credit both remain 987,753,157 VND.
- Full repository `pnpm check`: passed after formatting, including lint, typecheck, docs/security/fixture checks, 31 native DB tests, all package tests and production builds.

2026-08-06 report/chart completion proof:

- Canonical `planning-actual-facts/backfill` for `actualBasis=invoiced`, 2024-01-01 through 2026-12-31: 41 facts refreshed, audited and idempotency-protected.
- Live workbook re-commit after typed normalization: valid with zero errors; canonical resource counts unchanged.
- Live operating-dashboard readback: 111 source controls (42 bonus, 28 debt, 14 expense categories, 3 payroll, 12 planning and 12 profitability), 24 monthly control points, 28 debt rows and 14 category rows.
- Focused web E2E: 16/16 passed; web unit tests: 25/25 passed; operating-dashboard native PostgreSQL tests: 3/3 passed.
- Final repository `pnpm check`: passed after formatting, including all quality gates and production build.
- In-app browser proof: `/dashboard` selects `CAL-2025-10` with `Basis: invoiced`, renders the 12-month exact-value revenue chart and the 111-row non-canonical source-control marker; `/imports/review` renders 399/345/54, localized control kinds, pagination and an operable detail drawer without console/API errors.

2026-08-06 owner-requested completion proof:

- Real workbook mapping-v3 test with the two supplied Downloads workbooks: 1/1 focused test passed.
- Interactive dashboard E2E: 6/6 passed, including all/3-month selection and 390px overflow check.
- ERP-800 focused E2E set: 16/16 passed before the final chart assertion adjustment; the rerun of
  the dashboard subset passed 6/6.
- Web unit tests: 25/25 passed; web typecheck passed.
- Repository `pnpm check`: passed, including formatting, lint, typecheck, docs/security/fixtures,
  native PostgreSQL harness, package tests and production builds.
- The in-app Browser runtime was unavailable (`No browser is available`), so rendered validation
  used the repository Playwright desktop/mobile projects and captured failure artifacts during the
  test-first repair loop; no Browser screenshot is claimed.
- Validation ran under Node 26 and emitted the repository engine warning (`>=22 <25`); all commands
  passed, but CI remains the supported-Node exact-commit proof.
