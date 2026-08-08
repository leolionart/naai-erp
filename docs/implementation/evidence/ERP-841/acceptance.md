# ERP-841 acceptance

- Actual project contracts and milestones exist and are visible on the project profile: passed.
- Approved project budgets exist for both demo projects: passed.
- Posted milestone revenue recognition is visible independently from invoiced and collected axes:
  passed.
- Project-linked sales and purchase invoices render when the relationship exists on allocations:
  passed.
- Current and overdue AR/AP cases exist and AR/AP control reports tie: passed.
- Posted purchase invoice costs render on the project profile with source and journal drill-down:
  passed.
- Dashboard distinguishes contract, invoiced, recognized, collected and remaining contract value:
  passed.
- Future invoices and future reconciliations are excluded from historical `asOf` measures: passed.
- Sales invoice issue requires customer/project/currency agreement and aggregate signed contract
  capacity as of the invoice date: passed.
- Explicit allocation-level invoice-to-contract/milestone identity: not implemented; the current
  accepted boundary is project-level aggregate enforcement and is documented as such.
- Company-bank withdrawal into company cash and company-cash deposit back into company bank are
  available as paired, reconciled internal-transfer demo cases with zero P&L effect: passed.
- Banking workspace shows the complete cash-fund history, including reconciled records, with quick
  all/deposit/withdrawal switching and cash-account filtering: passed.
- Banking module menu, local tabs, breadcrumb, page heading and browser title use the same canonical
  Vietnamese labels, with list and detail routes linked to the correct parent: passed.
- Owner withdraws VND 90,000,000 for company custody and pays VND 120,000,000 of company payroll;
  posted-ledger readback shows the company owes the owner the VND 30,000,000 excess: passed.
- Dashboard derives bank and cash balances from active company financial accounts, owner payable from
  the approved `owner_current` statement mapping, and accounting profit from canonical P&L. It shows
  VND 333,000,000 bank, VND 7,000,000 cash, VND 30,000,000 owner payable, VND 310,000,000 net cash and
  VND 90,000,000 accounting profit at 2026-08-07: passed.
- Dashboard and executive-metric workspaces contain no embedded financial demo amounts; missing API
  data renders as an explicit missing-data state: passed.
- Dashboard top cards are limited to owner-actionable cash, receivable and tax controls. Contract,
  invoice, fully-loaded profit and ROS cards remain available through their dedicated pages: passed.
- VAT card reads output, eligible-input and unreviewed-input VAT from the canonical reconciliation;
  provisional CIT reads accounting PBT, CIT adjustments and the approved CIT rate record: passed.
- Dashboard renders a complete three-column grid with separate actionable cards for unreviewed input
  VAT and unreviewed CIT expense: passed.
- Fully-loaded profit backed by a posted overhead allocation run: pending; source materialization API
  is not available yet.
- Payroll remains VND 120,000,000 in total but is split into VND 70,000,000 direct project labor
  across the website and AI projects plus VND 50,000,000 shared operating payroll: passed.
- Contract-backed freelance UI cost of VND 18,000,000 is posted to the website project with a
  freelancer payee and accepted contract/acceptance evidence: passed.
- Contract backend-dev cost of VND 28,000,000 is posted to the AI project with a freelancer payee and
  accepted contract/acceptance evidence: passed.
- `pnpm demo:verify` fails if those canonical expense/journal records lose their exact posted state,
  amount, payee or project allocation: passed.
- Full-year Executive Metrics reads three reviewed monthly operating cash outflows of VND 24,000,000,
  unrestricted cash of VND 261,000,000 and returns `runwayStatus: available`: passed.
- Runway is calculated exactly as `261,000,000 / 24,000,000 = 10.875` months and is protected by the
  demo verification readback: passed.
- Versioned OpenAPI paths exist for filtered sales-invoice and purchase-invoice/expense XLSX
  downloads with date, state, party/payee, project and invoice-presence filters: passed.
- First-party CLI downloads both workbook kinds through those REST paths and requires an explicit
  output filename: passed.
- Workbook contracts preserve exact minor-unit totals, SHA-256 controls and the Summary, Records,
  Lines and Filters sheet inventory: passed.
- Accountant XLSX reads P&L from canonical `result.rows`, handles `direct_cash_flow`, and includes
  journal, sales/purchase invoice, expense, allocation, bank, payment/reconciliation, account and
  party detail sheets at the snapshot cutoff: passed by live local workbook readback.
- Revenue and expense management pages expose separate XLSX buttons that preserve the active URL
  filters, show loading/failure states and do not require a full accountant export: passed.
- Primary navigation and page headings use Quản lý doanh thu / Quản lý chi phí: passed.
- Revenue defaults to sales/credit documents plus separately labeled recognition activity; it never
  adds invoiced and recognized axes into one listing total: passed.
- Expense defaults to purchase invoices plus all expense classes. Present/missing invoice filters
  preserve canonical row sources, endpoints, forms and stable detail routes: passed.
- Production application routes require an explicit login session and preserve the requested route
  through the login redirect; local development fixture authentication remains available: passed.
- Production username/password are deployment environment settings consumed only by the web server;
  invalid credentials disclose no API token and incomplete configuration fails closed: passed by
  route and constant-time comparison unit coverage.
- Posted expenses accept an audited, idempotent category metadata correction through REST while
  amounts, tax states, funding treatment, allocations and journal linkage remain immutable: passed.
- Expense Quick View saves the category and the combined expense listing receives the persisted
  category through canonical API list readback: passed.
- Project create/update exposes optional `default_service_line_code` through the generic master-data
  registry and the admin project editor: implementation complete; registry unit proof passed.
- Project default service line is constrained to an active same-organization `service_line`, and an
  assigned dimension cannot be deactivated or deleted: passed on a freshly migrated integration
  database.
- Project profitability prefers approved timesheet service-line attribution and otherwise uses the
  project default without emitting a false `service-line-unclassified` confidence flag: integration
  proof passed; production report readback remains pending.
- Project directory defaults to active projects and combines text search with explicit lifecycle and
  overlapping execution-date filters: passed by 3 focused unit cases.
- Project lifecycle and date filters persist in the URL and restore their selected values after
  navigation or refresh: passed by focused desktop Chromium E2E.
- Revenue and expense charts aggregate commercial-document amounts per canonical line category,
  matching the dimension identity shown on focused record surfaces: passed by 3 focused web unit
  cases and 2 focused desktop Chromium E2E cases.
- Expense list readback falls back to the persisted line `expense_category_code` when
  `dimensions.category` is absent: passed against a freshly migrated PostgreSQL integration database.
- Missing chart category data is labeled explicitly as revenue or expense unclassified and is never
  silently assigned to a configured business category: passed by focused web unit proof.
