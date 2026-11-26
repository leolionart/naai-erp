# ERP-983 Tests

## Scratch PostgreSQL Integration Tests (`RUN_DB_INTEGRATION=1`)

- Empty-database migration (`0000` through `0077_owner_funding_and_repayment`) via `pnpm db:migrate` on isolated scratch DB: **passed**.
- `T-INT-PAY-004` (`apps/api/src/owner-funding/owner-funding.integration.test.ts`): **1 passed (1)** — verified bank-transaction and manual-referenced `owner_funding` (`Dr 112 / Cr 3388`, zero revenue), idempotent replay, negative guards (wrong transaction sign, missing manual reference, cash account rejection, hard-locked period, cross-bank expense link mismatch), `company_bank` expense traceability (`linkedSpendMinor` & `linkedRecords`), bank-transaction and manual `owner_repayment` (`Dr 3388 / Cr 112`), `owner-current-movements` summary/timeline, and `operating-dashboard` financials.
- Regression scratch-DB suites (`banking.integration.test.ts`, `operating-dashboard.integration.test.ts`, `expense.integration.test.ts`): **27 passed (27)**.

## Repository Quality Gates

- `node scripts/verify-docs.mjs`: **passed**
- `node scripts/verify-solopreneur-gate-matrix.mjs`: **passed** (`127/127 OpenAPI mutations; no financial surface is classified none`)
- `pnpm db:check`: **passed** (`77 entries`)
- `pnpm lint`: **passed**
- `pnpm typecheck`: **passed** (`10/10 packages`)
- `pnpm test`: **passed** (including `owner-funding.service.test.ts` and `owner-funding-cli.test.ts`)
