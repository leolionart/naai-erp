# ERP-1006 tests

Measured on a scratch PostgreSQL 16 with 50,000 rows per table (API `inject`, first call includes warm-up):

| List                                        | Before                                            | After                      |
| ------------------------------------------- | ------------------------------------------------- | -------------------------- |
| journals first page / deep page             | 39.4 ms / 18.7 ms (sequential scan, grouped join) | 6.0 ms / 1.2 ms            |
| commercial documents first page / deep page | 134.0 ms / 94.3 ms (grouped join over all rows)   | 6.7 ms / 2.4 ms            |
| expenses first page / deep page             | 21.7 ms / 2.7 ms                                  | 26.4 ms (warm-up) / 2.5 ms |

- `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/banking/bank-list.integration.test.ts`
- Full API integration suite and Playwright re-run before push (see commit message).
