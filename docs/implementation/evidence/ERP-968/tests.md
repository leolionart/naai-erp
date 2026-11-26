# Tests

- `vitest` web (127), api unit, cli — passed
- `RUN_DB_INTEGRATION=1 vitest src/commercial-documents -t "voids an issued invoice"` on a scratch Postgres — passed
- Playwright (desktop-chromium, mocked API, dead API URL so no real data is reachable) `e2e/focused-records.spec.ts`: 15 passed incl. void, no-void for draft expense, remembered columns; 8 legacy tests fail on stale selectors/data unrelated to this change.
