# ERP-841 tests

## Project default service line

```text
pnpm --filter @naai-erp/api exec vitest run src/master-data/resource-registry.test.ts
```

Result on 2026-08-09: passed, 1 file and 3 tests. The project registry exposes
`default_service_line_code` on both writable and mutable columns, keeping project classification
available through the canonical master-data API rather than direct database updates.

```text
RUN_DB_INTEGRATION=1 DATABASE_URL=postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp pnpm --filter @naai-erp/api exec vitest run src/project-profitability/project-profitability.integration.test.ts
```

Result on 2026-08-09 against a freshly migrated integration database: passed, 1 file and 4 tests.
The suite proves project-default fallback, resolved service-line name, absence of a false
missing-dimension confidence code, rejection of an unknown default, and protection against
deactivating an assigned service line. A later rerun against the long-lived shared database stopped
during setup because its fixed `org-erp540` fixture already existed; that environmental collision
does not replace the clean-database passing result.

## Final-document category metadata

- Commercial-document service tests: 12/12 passed, including the category-only mutation.
- API and web typechecks passed.
- Migration directory verification passed with migration 0036.
- The database trigger permits only a `dimensions.category` delta; all other final-document child
  mutations still raise `FINAL_DOCUMENT_IMMUTABLE`.

## Server-only environment login

```text
pnpm --filter @naai-erp/web exec vitest run src/lib/auth/environment-login.test.ts src/app/auth/session/route.test.ts
```

Coverage verifies successful username/password exchange, invalid-password rejection without token
disclosure, fail-closed behavior when configuration is incomplete, and server-only environment
parsing. The Compose contract passes the four non-public login variables only to the web container.
The focused suite passed 7/7 tests across the login route, environment authenticator and production
authentication gate. `pnpm check`, the production Next.js build, Compose packaging verification,
documentation verification and `git diff --check` all passed on 2026-08-08.

The login-theme Playwright regression now mocks the server-only `/auth/session` exchange, submits
username/password, verifies the returned API token is stored in session storage and retains the
desktop dark-mode and mobile overflow assertions.

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
- `pnpm --filter @naai-erp/web exec playwright test e2e/admin-navigation.spec.ts --workers=1`:
  4/4 passed across desktop and mobile.
- `pnpm --filter @naai-erp/web test`: 25/25 passed; production web build completed with all 48
  routes generated successfully.
- `pnpm test:docs`: passed.
- `git diff --check`: passed.

Runtime export evidence on the local `naai` organization, 2026-08-08:

- API typecheck passed; report-export service tests passed, 3/3.
- Web typecheck passed; the two focused export Playwright cases passed, 2/2 with one worker.
- Contract tests passed, 62/62. CLI tests passed, 123/123 with one unrelated skipped test.
- Live filtered sales workbook returned 200 with Summary, Records, Lines and Filters; Records had
  four data rows for the 2026 filter and every sheet had AutoFilter.
- Live purchase-invoice/expense workbook returned 200 with the same four-sheet contract; Records had
  five data rows and preserved invoice versus non-invoice source type.
- A newly captured P&L snapshot generated an 18-sheet accountant XLSX. Readback included 30 journal
  entries, 77 journal lines, four sales invoices, two purchase invoices, three expenses, allocation,
  bank, payment/reconciliation, account and party sheets. The Report sheet contained the real P&L
  rows, not a hardcoded or empty placeholder.
- ExcelJS readback confirmed AutoFilter, VND number format, landscape print setup and repeating row 1.
- Full repository `pnpm check` passed after formatting, including lint, typecheck, documentation,
  security/fixture/native-DB checks, package tests and production builds.
- The legacy DB integration fixture could not be rerun against the long-lived shared database because
  its fixed organization IDs already existed. Equivalent runtime SQL and workbook generation were
  exercised through a fresh local snapshot and authenticated API calls instead.

Revenue and expense management listing proof:

- `pnpm --filter @naai-erp/web exec playwright test e2e/focused-records.spec.ts --workers=1`:
  11/11 passed across desktop and 390px mobile.
- Coverage proves default-all revenue and expense sources, present/missing invoice filtering,
  row-local Quick View endpoints, stable detail links, XLSX filter forwarding, draft correction and
  no document overflow.
- `pnpm --filter @naai-erp/web typecheck`: passed.
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

Cash-fund history evidence on 2026-08-08:

- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/banking-workspace.test.tsx`:
  passed, 1 file and 3 tests. Coverage proves bank-account rows are excluded, reconciled/ignored cash
  movements remain visible and the withdrawal filter accepts both negative `amountMinor` and
  `outflowMinor` API shapes.
- `pnpm --filter @naai-erp/web typecheck`: passed.
- `pnpm test:docs`: passed.
- `git diff --check`: passed.
- Browser plugin selection returned `No browser is available`, so rendered QA used the repository's
  Playwright runtime against `http://localhost:3000/banking` with the local authenticated API
  session. Desktop rendered two cash movements (+VND 10,000,000 deposit and -VND 3,000,000
  withdrawal), no console/page errors, and switching the direction filter to withdrawal removed the
  deposit row.
- The 390px view rendered the cash-history section without horizontal page overflow, but the existing
  application sidebar produced a React hydration warning and development issue overlay. The mismatch
  is outside the banking workspace change and remains a separate responsive-shell risk.

Banking naming-alignment evidence on 2026-08-08:

- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/banking-workspace.test.tsx src/lib/navigation.test.ts`:
  passed, 2 files and 5 tests.
- `pnpm --filter @naai-erp/web typecheck`: passed.
- Playwright readback at `http://localhost:3000/banking` verified browser title
  `Tài khoản & Giao dịch | NAAI ERP`, page heading `Tài khoản & Giao dịch`, module breadcrumb
  `Tiền mặt & Ngân hàng` and the three matching workspace links. No desktop console or page errors
  were recorded.

# Production connection regression

- `pnpm --filter @naai-erp/web exec vitest run src/lib/api/connection.test.ts` verifies that a
  production browser uses the public same-origin API instead of its own `localhost:3001`, while
  local development retains the split-port default.
- `pnpm test:release` verifies that the API runtime image contains the OpenAPI document required by
  the public discovery/capabilities endpoint.
- `pnpm --filter @naai-erp/web exec vitest run src/components/authentication-gate.test.ts` verifies
  that production routes require an explicit browser session token while development/test routes
  retain their fixture workflow.

# Posted expense category metadata

- `pnpm --filter @naai-erp/api exec vitest run src/expenses/expense.service.test.ts`: passed, 1 file
  and 12 tests.
- `RUN_DB_INTEGRATION=1 pnpm --filter @naai-erp/api exec vitest run src/expenses/expense.integration.test.ts`:
  passed, 1 file and 5 tests after migration 0037. Coverage includes posted category-only update,
  list/detail readback, audit, idempotent replay, inactive category rejection and continued
  financial-field immutability.
- API and web typecheck: passed.
- `pnpm --filter @naai-erp/web exec playwright test e2e/focused-records.spec.ts --project=desktop-chromium --grep "posted expense category"`:
  passed, 1 test.
- `pnpm db:check`: passed with 40 migration entries.
- `pnpm test:docs`: passed.
- `git diff --check`: passed.
