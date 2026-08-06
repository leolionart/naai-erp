# ERP-740 Acceptance

- Four non-root images build successfully.
- Compose becomes healthy and preserves PostgreSQL data across restart.
- Main release published `main` and immutable `sha-edcbb6695aa3` tags for all four images in [run 31096200210](https://github.com/leolionart/naai-erp/actions/runs/31096200210), with OCI revision `edcbb6695aa31189e41c2c429b6a1644ce2f2f3f`.
- Import dry-run performs zero mutations and inventories all 14 workbook sheets.
- Commit is transactionally idempotent and organization-scoped.
  - Commit 1 successfully imported 14 parties, 14 roles, 29 projects, 41 sales invoices, and 200 expenses.
  - Skipped 14 zero rows.
  - Generated 241 journals (482 lines) and 241 external references, with 1 audit event.
  - Trial Balance: Debit = Credit = 987,753,157 (unbalanced = 0).
  - Retry/re-run created all zero records and counts remained unchanged, verifying idempotency.
- Calendar-year accounting totals remain separate from the static legacy mixed-year control.
  - Calendar Totals: Sales 195,261,583 / Expenses 443,293,388 / Profit -248,031,805.
  - Legacy Totals: Sales 244,717,833 / Expenses 298,148,067 / Profit -53,430,234.
- Variances are completely empty (no unexplained control variances; skipped zero rows = 14).
- Mapping v2 requires auditable per-row treatment and blocks missing/unaudited exclusions; aggregate variance waivers are v1-only.
- Reviewed sales-project mappings are explicit; unmatched customer/project relationships remain warnings rather than guesses.
- Native API execution was validated using an explicit `DATABASE_URL` environment variable; the temporary native API server has been stopped.
- Exact proof commit passed [CI run 31096199429](https://github.com/leolionart/naai-erp/actions/runs/31096199429); release digests are recorded in `summary.md` and `tests.md`.
