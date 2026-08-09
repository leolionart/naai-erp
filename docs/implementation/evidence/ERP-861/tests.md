# ERP-861 tests

## Type checking

```bash
pnpm --filter @naai-erp/web typecheck
```

Result: passed.

## Focused E2E

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_OUTPUT_DIR=/tmp/naai-erp-owner-liquidity \
pnpm --filter @naai-erp/web exec playwright test \
  e2e/dashboard-drilldown.spec.ts \
  --project=desktop-chromium \
  --grep "ledger-derived bank|single owner obligation"
```

Result: 2 passed.

## Production-backed localhost readback

```bash
curl -sS 'http://localhost:3000/dev-api/api/v1/organizations/naai/reports/operating-dashboard?asOf=2026-08-09'
```

Verified `cashAndBankMinor=78333660`, `ownerPayableMinor=65438650`,
`netCompanyFundsMinor=12895010`, `actualOwnerPaidCompanyCostMinor=352758650`,
`unclassifiedOwnerPaidCount=0`, `unclassifiedOwnerPaidMinor=0`, and
`ownerPaidClassificationStatus=ready`.

## Draft classification readback

All twelve `expense-inferred-payroll-2024-01` through `expense-inferred-payroll-2024-12` records
were read before mutation, updated with `If-Match` and a stable idempotency key, and read back.
Result: 12/12 remain `draft`, 12/12 use `SALARY`, and 12/12 snapshot
`owner_paid_company_cost`.
