# ERP-841 tests

## Relationship backfill API and CLI

- `T-API-ERP-841-028` covers inventory `projectIds`/`contractIds`, zero-mutation dry-run,
  deterministic plan hashing, version conflicts and idempotent reverse/replacement commit.
- `T-CLI-ERP-841-029` covers both CLI resources and requires explicit JSON, key and version; commit
  additionally requires an idempotency key.
- Production verification was read-only inventory/audit only; no commit endpoint was invoked.

## Final review gate — 2026-08-09

- Fresh PostgreSQL database migrated through all 40 migrations: passed.
- Commercial document, expense, master-data and operating-dashboard integration suites on the fresh
  database: 24/24 passed after correcting the bank fixture to satisfy canonical bank metadata.
- API unit suite: 121 passed, 92 skipped integration cases when no database was supplied.
- Web unit suite: 47/47 passed; API and web typecheck passed.
- CLI suite: 129 passed, 1 skipped; relationship-backfill focused CLI suite: 128/128 passed.
- Focused Kanban and relationship-aware Playwright regressions passed.
- Documentation verification and `git diff --check`: passed.
- Review fixes reject reversal of settled/reconciled sources, preserve cancelled/reversed history,
  keep Kanban state unchanged until PATCH succeeds and prevent allocation-total corruption.
- Local runtime used Node 26 although the repository declares Node 22–24; commands completed with an
  engine warning and this environment mismatch remains recorded as a non-product risk.

## Relationship-complete revenue and expense drafts

- `T-API-ERP-841-026` runs the commercial-document and expense unit/integration suites. Its focused
  regressions prove sales customer/project agreement, optional contract ownership, rejection of
  missing, closed or mismatched relationships, expense supplier independence, allocation inheritance
  from line dimensions and preservation when a draft PATCH omits lines.
- `T-E2E-ERP-841-027` runs focused desktop Chromium journeys matching `relationship-aware`. Revenue
  must select a client, then a client-owned project, then an optional project-owned contract. Expense
  keeps supplier/payee independent while selecting an optional receiving project and contract. Both
  journeys assert canonical allocation IDs and `dimensions.projectId`/`dimensions.contractId` in the
  submitted payload and preserved values on edit.
- Final verification on 2026-08-09 passed API and web typecheck, 18/18 web Vitest files with 47/47
  tests, and the relationship API suite with 4/4 files and 39/39 tests against local PostgreSQL 16.
  The focused desktop Chromium relationship journeys passed 2/2. Documentation verification and
  `git diff --check` also passed.
- Live production-backed localhost readback opened both create dialogs without submitting records.
  Revenue showed named customers, customer-owned project choices and the dependent contract field;
  selecting `OCD 2026 services` retained the selected customer relationship. Expense showed the
  complete optional receiving-project list while supplier/payee remained a separate field.

## Operational project editor

- `pnpm --filter @naai-erp/web typecheck`: passed on 2026-08-09.
- `pnpm --filter @naai-erp/web test`: passed, 18 files and 43 tests.
- `pnpm --filter @naai-erp/web test:e2e -- business-directory.spec.ts`: passed, 5/5 desktop Chromium
  tests. The project editor regression verifies the lifecycle dropdown, `250.000.000` display,
  multiline operating note, and a mocked PATCH payload containing `state: on_hold` and
  `budget_minor: 36000000` after entering `36.000.000`.
- `pnpm test:docs`: passed; 11 ADRs, 12 rule references and 27 AI relationship resources verified.
- `git diff --check`: passed before the evidence update and rerun after it.
- Focused development-proxy tests passed, 7/7 across the proxy and shared API client. Coverage proves
  project PATCH is disabled by default, requires the explicit development flag, accepts only an
  existing project route, rejects other master-data resources and forwards `If-Match` plus the
  idempotency key.
- `T-E2E-ERP-841-025` covers URL-restored Kanban mode, lifecycle columns, native drag-and-drop,
  canonical PATCH payload and post-save column movement.
- Full `business-directory.spec.ts` execution passed 6/6 desktop Chromium tests after the Kanban
  addition. Web typecheck, 45 unit tests, documentation verification and `git diff --check` also
  passed. Live browser readback showed 40 production projects in Kanban: 34 completed, 6 closed and
  zero active.
- Focused expense-dialog E2E passed with isolated API fixtures. It verifies the dialog opens from the
  list, supplier and employee names are visible while their canonical IDs are submitted, and saving
  closes the dialog without navigating to a separate creation page. The development proxy suite
  passed 5/5, including disabled-by-default and idempotent expense POST forwarding.
- Revenue-dialog E2E verifies the create action stays on the list, opens the dialog and renders the
  client business name without exposing its raw party key. The proxy suite also covers the exact,
  explicitly enabled commercial-document POST route.
- Live production-backed localhost readback on 2026-08-09 opened **Tạo hóa đơn bán ra** from
  `/documents` without navigation, showed the **Tạo hóa đơn** dialog and rendered client names such
  as `CÔNG TY CỔ PHẦN TƯ VẤN QUẢN LÝ OCD`, `CÔNG TY CỔ PHẦN BM WINDOWS` and `Phygital LABS`.
  No invoice was submitted during this verification. Final web Vitest passed 18/18 files and 47/47
  tests; web typecheck, documentation verification and `git diff --check` also passed.

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

Result: `1 passed` on 2026-08-09. The API fixtures provide distinct bank, cash, owner-payable,
net-cash and canonical P&L values. The dashboard consolidates bank and cash into one company-funds
card and displays owner payable separately from the approved `owner_current` ledger mapping. It does
not show a hypothetical balance after settling that liability.

The regression fixture additionally proves that owner-funded equipment increases the statutory
owner-current balance but not the management owner-obligation card, while a posted Dr Owner Current / Cr
company bank withdrawal reduces the management obligation as a repayment.

The focused PostgreSQL operating-dashboard integration test also passed `1/1` on 2026-08-09. It
proves that an unclassified legacy expense posted against the mapped owner-current account is
reported as review-required, while net company funds follows the posted owner liability rather than
the cumulative `owner_paid_company_cost` category total.

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

## Production bank-ledger correction — 2026-08-09

- Posted nine owner-repayment journals totaling VND 287,320,000 as Dr `3388-OWNER` / Cr
  `112-BANK`; all nine are balanced and `posted`.
- Reconciled eight positive bank transactions totaling VND 118,558,950 to issued sales invoices as
  Dr `112-BANK` / Cr `131-AR`; seven invoices are `paid` and invoice 8 is `partially_paid` with VND
  2,100,000 remaining.
- Created audited clearing account `3389-BANK-CLEAR` and posted 33 unresolved positive bank
  transactions totaling VND 281,712,775 as Dr `112-BANK` / Cr clearing without changing revenue.
- Final production `112-BANK` readback: VND 400,271,725 debit, VND 321,938,065 credit and VND
  78,333,660 closing debit balance.
- Final transaction states: eight `reconciled`, 37 reviewed/ignored with explicit journal references,
  zero remaining `imported` rows. Trial Balance period debit and credit both equal VND 1,428,364,203;
  closing debit and credit both equal VND 700,547,188; difference is zero.
- Temporary self-approval was capped first at VND 100,000,000 for owner repayments and then VND
  60,000,000 for clearing journals. It was restored to `false` with a null ceiling after posting;
  final policy resource version is 6.
- `pnpm --filter @naai-erp/web exec playwright test e2e/admin-navigation.spec.ts --workers=1`:
  4/4 passed across desktop and mobile.
- `pnpm --filter @naai-erp/web test`: 25/25 passed; production web build completed with all 48
  routes generated successfully.
- `pnpm test:docs`: passed.
- `git diff --check`: passed.

Shared expense overview evidence on 2026-08-09:

- `pnpm --filter @naai-erp/web typecheck`: passed.
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/focused-record-chart.test.ts`: passed, 1 file and 3 tests.
- Focused desktop Chromium E2E passed for shared Dashboard/Expense Management data: canonical domain and cloud categories, exact VND 15,000,000 total, `invoiceStatus=all` drill-down and no synthetic `Chưa phân bổ` label.
- In-app Browser selection returned `No browser is available`; repository Playwright supplied rendered evidence.

Shared table column-control evidence on 2026-08-09:

- `pnpm --filter @naai-erp/web typecheck`: passed.
- `pnpm --filter @naai-erp/web test`: passed, 18 files and 47 tests.
- `NEXT_PUBLIC_API_URL=http://localhost:3001 NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION=1 pnpm exec playwright test --project=desktop-chromium --grep 'column visibility'`: passed, 1 test. The regression proves the shared toolbar exposes search plus the outline column menu, filters and restores rows, opens the checkbox menu and preserves hidden columns after reload.
- `git diff --check -- apps/web/src/components/ui/table.tsx apps/web/e2e/focused-records.spec.ts`: passed.
- The in-app Browser runtime returned `No browser is available`; repository Playwright supplied the rendered interaction evidence.

Expense category recovery evidence on 2026-08-09:

- Dry-run classified 245 records before mutation: 124 expenses and 121 purchase invoices.
- Commit used category-only REST mutations with stable idempotency keys and returned 245 assignments across 12 declared ERP categories.
- Live API readback: 124/124 expenses categorized and 190/190 purchase-invoice lines categorized. Only the declared category codes remain active; 12 temporary workbook-inference category masters/dimensions were deactivated after remapping.
- `pnpm --filter @naai-erp/cli typecheck`: passed.
- `pnpm --filter @naai-erp/api typecheck`: passed.
- `pnpm --filter @naai-erp/web exec vitest run src/app/workspaces/focused-record-chart.test.ts`: passed, 1 file and 3 tests.
- `git diff --check`: passed.

# Project directory filters

- `T-UNIT-ERP-841-016` covers the default all-state view, retained text search, overlapping date
  intervals, excluded non-overlapping intervals and open-ended projects. Focused Vitest execution
  passed: 1 file, 3 tests.
- `T-E2E-ERP-841-017` opens the project directory with `state`, `startsOn` and `endsOn` URL
  parameters, verifies that only the matching lifecycle/date rows render, and verifies the filter
  controls restore the URL values when reopened. Focused desktop Chromium execution passed: 1 test.
- `pnpm test:docs`: passed. `git diff --check`: passed.
- ERP-841 remains `in_progress` because its wider gate still contains the previously recorded
  fully-loaded profitability blocker.

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

# Revenue and expense chart category consistency

- `T-UNIT-ERP-841-018`: focused Vitest passed 1 file and 3 tests. Coverage proves per-line
  commercial-document grouping, canonical expense-list category consumption and explicit
  unclassified revenue labeling.
- `T-E2E-ERP-841-019`: focused desktop Chromium coverage passed 2 cases for revenue and expense
  chart/list category consistency.
- `T-INT-ERP-841-020`: passed 1 file and 6 tests against a freshly migrated PostgreSQL 16 database.
  The regression verifies list fallback to `expense_category_code` when category dimensions are
  absent and list/detail category readback must agree.
- ERP-841 remains `in_progress`; this focused change does not close the existing fully-loaded
  profitability acceptance gap.

## Operational project mutability and deletion

- `T-UNIT-ERP-841-021` targets service guardrails: project-only deletion with mandatory reason,
  optimistic version and idempotency.
- `T-API-ERP-841-022` targets PostgreSQL/API behavior: one audited deletion and idempotent replay for
  an unreferenced project, `PROJECT_DELETE_REFERENCED` for a referenced project, and a precondition
  error when the version is missing.
- `T-CLI-ERP-841-023` targets the REST client `DELETE` request with `If-Match`, stable
  `idempotency-key` and reason body.
- `T-E2E-ERP-841-024` targets the admin confirmation flow and verifies its reason and current version.
- ERP-841 remains `in_progress`; the coordinating agent records pass results after concurrent
  implementation settles.
- `pnpm --filter @naai-erp/web typecheck` — passed after dashboard card/footer and project-pipeline layout changes.
- `git diff --check` — passed.
- `apps/api/src/operating-dashboard/operating-dashboard.integration.test.ts` now proves that an
  uncategorized line without the owner-paid funding treatment does not create an owner-paid
  classification warning.
- `pnpm --filter @naai-erp/api test -- src/operating-dashboard/operating-dashboard.integration.test.ts`
  — passed; Vitest executed 34 files / 119 tests with 30 files / 89 tests skipped by environment gates.
- `pnpm --filter @naai-erp/web typecheck` — passed after separating review and import-backlog alerts.
- `pnpm test:docs` — passed: 11 accepted ADRs, 12 rule references and 27 AI relationship resources.
- `pnpm --filter @naai-erp/web test -- 'src/app/dev-api/[...path]/route.test.ts'` — passed as
  part of the 18-file / 42-test web suite. Coverage proves server-only bearer forwarding, exact
  organization locking and production-runtime rejection.
- Live local proxy readback against `https://erp.naai.studio` returned HTTP 200 with 81 parties,
  59 party roles, 16 client roles and 40 projects; a POST to the same proxy returned HTTP 405.
- `http://localhost:3000/projects` returned HTTP 200 after switching the local web process to the
  server-side production read proxy.
- Regression follow-up: the live-data mode now clears stale `naai-erp-admin-settings-v2` browser
  connection overrides. The web suite passed 18 files / 43 tests, and the running Customers page
  read both `parties` and `party-roles` through `/dev-api` with HTTP 200 after the full reload.
