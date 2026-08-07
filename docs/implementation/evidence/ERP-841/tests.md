# ERP-841 tests

## Ledger-derived dashboard regression

```text
pnpm --filter @naai-erp/web exec playwright test e2e/dashboard-drilldown.spec.ts --project=desktop-chromium --grep "ledger-derived bank cash owner payable and accounting profit"
```

Result: `1 passed` on 2026-08-07. The API fixtures provide separate bank, cash, owner-payable,
net-cash and canonical P&L values. The dashboard displays those exact values and replaces unavailable
CIT totals with an explicit missing-data state rather than a hardcoded amount.

Live local readback at the active `2026-08-07` cutoff returned:

- company bank and cash: VND 340,000,000;
- positive owner payable: VND 30,000,000;
- net available after owner payable: VND 310,000,000.
- accounting profit before tax from P&L: VND 90,000,000.
- provisional taxable profit: VND 90,000,000, with VND 20,000,000 purchase cost still CIT-unreviewed;
- provisional CIT: VND 18,000,000 using the approved 20% `CIT20` record;
- VAT payable: VND 15,000,000 = VND 15,000,000 output VAT - VND 0 eligible input VAT, with VND
  2,000,000 input VAT still unreviewed.

Additional gates:

- `pnpm --filter @naai-erp/web typecheck`: passed.
- `pnpm test:docs`: passed.
- `git diff --check`: passed.
- `pnpm --filter @naai-erp/api typecheck`: blocked by pre-existing errors in the missing
  `db/seed/tt133-mvp.mjs` module and report-export typing; the changed operating-dashboard files
  produced no reported TypeScript error.

- `pnpm demo:seed`: passed; all 13 report requests returned successfully.
- `pnpm demo:verify`: passed after the internal-transfer seed extension; all 13 report requests
  returned successfully.
- `pnpm demo:seed`: passed after adding itemized project payroll and two contract-backed project
  expenses. Canonical readback verified VND 70,000,000 direct payroll across two projects, VND
  18,000,000 freelance UI for `demo-project-web`, and VND 28,000,000 contract backend development for
  `demo-project-ai`.
- `pnpm demo:verify`: passed with the new `project-cost-readback` assertion in addition to all 13
  report requests.
- Live expense readback: `demo-expense-freelance-ui` and `demo-expense-contract-dev-ai` are `posted`
  contract-backed expenses with exact project allocations and payees.
- Live P&L readback after the expanded demo and recurring-burn data: revenue VND 290,000,000, direct
  cost VND 176,000,000, operating expense VND 125,000,000 and net loss VND 11,000,000;
  ledger/report control status `tied_out` with zero difference.
- `pnpm demo:verify`: passed after adding the runway fixture. Exact Executive Metrics readback is
  `averageOperatingNetCashFlowMinor: -24000000`, `netBurnMinor: 24000000`,
  `unrestrictedCashMinor: 261000000`, `runwayMonthsThousandths: 10875` and
  `runwayStatus: available`.
- `pnpm --filter @naai-erp/web typecheck`: passed.
- `RUN_DB_INTEGRATION=1 DATABASE_URL=... pnpm --dir apps/api exec vitest run
src/commercial-documents/commercial-document.integration.test.ts
src/operating-dashboard/operating-dashboard.integration.test.ts`: passed, 2 files and 6 tests.
- The contract-cap regression includes a future-signed contract and proves it cannot authorize a
  backdated invoice; a one-unit over-cap invoice returns `409` and creates no journal.
- Focused Playwright runs: project-revenue vocabulary tests passed, and the invoiced-basis selector
  test passed after scoping the duplicate label to its combobox. The combined dashboard file still
  has three unrelated/stale fixture assertions for ROS/review count and source-control period
  visibility.
- Browser readback at `http://localhost:3000/projects/demo-project-web`: contracts, two milestones,
  two linked invoices, approved budget, recognized/invoiced/collected axes and VND 40,000,000 posted
  project cost rendered without a framework overlay.
- AR readback at `asOf=2026-08-07`: VND 55,000,000 outstanding, VND 22,000,000 overdue, tie status
  `tied`, no exceptions.
- AP readback at `asOf=2026-08-07`: VND 22,000,000 outstanding and overdue, tie status `tied`.
- `pnpm cli internal-transfers list --organization naai`: returned two `reconciled` transfers. VCB
  to cash is VND 10,000,000; cash to VCB is VND 3,000,000; both have one posted journal and
  `transitOutstandingMinor: "0"`.
- Browser readback at `/banking/internal-transfers`: both transfer rows render with account direction,
  exact amount, transit account `113-TRANSIT` and status `Đã đối soát`.
- General Ledger readback for `3388-OWNER`, `2026-08-05..2026-08-07`: VND 90,000,000 debit for
  company money held by the owner, VND 120,000,000 credit for owner-paid payroll, closing balance
  `-30000000` under the report's debit-minus-credit convention. Economically this is a VND
  30,000,000 payable to the owner.
- General Ledger readback at `2026-08-07`: `112-BANK` closing debit balance VND 333,000,000 and
  `642-OPEX` payroll/operating expense VND 120,000,000.
- Live P&L readback at `2026-08-07`: operating expense VND 120,000,000, net profit VND 90,000,000
  and control status `tied_out`.

Repository-wide API typecheck is currently blocked by pre-existing unrelated errors in the removed
TT133 seed import and report-export changes; these errors were not introduced by ERP-841.

Accounting-list export contract evidence:

- `pnpm --filter @naai-erp/contracts exec vitest run src/filtered-document-exports.test.ts`: passed,
  1 file and 1 test.
- `pnpm --filter @naai-erp/contracts typecheck`: passed.
- `pnpm --filter @naai-erp/cli exec vitest run src/client.test.ts src/main.test.ts`: passed, 2 files
  and 121 tests.
- `pnpm --filter @naai-erp/cli typecheck`: passed.
- `python3 -m json.tool docs/api/openapi-v1.json`: passed.
- `pnpm test:docs`: passed.
- `git diff --check`: passed.
