# ERP-841 summary

Expanded the local NAAI demo from report-only readiness into linked project economics. The demo now
creates real contracts and milestones, approved project budgets, acceptance evidence, a posted
revenue-recognition event, current and overdue sales/payables, and a separate contract-asset
classification. The project profile now renders allocation-linked invoices, contracts, milestones,
budget/revenue axes and posted purchase costs.

Changed surfaces include the local demo seed, project profile UI, project revenue API adapter,
commercial-document project rendering, recognition revenue-position query, and project-cost read
model filtering.

The dashboard now names and calculates signed contract value, invoiced value, recognized revenue,
customer collections and uninvoiced contract value as separate measures. Historical reads exclude
future-dated invoices and future reconciliations. Issuing a sales invoice now requires a
customer-owned project with contract capacity signed by the invoice date; the current safeguard is
an aggregate project-level cap, not an allocation-level contract or milestone identity.

The banking demo also includes a VND 10,000,000 withdrawal from the company VCB account into the
company cash fund and a VND 3,000,000 cash deposit back into VCB. Both transfers use paired imported
transaction legs, post through the canonical direct internal-transfer API and remain P&L-neutral.

The banking workspace now exposes those cash-account legs in a dedicated **Sổ quỹ tiền mặt** section
instead of hiding completed movements from the reconciliation queue. Users can switch quickly
between all movements, deposits and withdrawals and filter the specific company cash account while
retaining every lifecycle state.

Banking navigation now uses one hierarchy consistently: **Tiền mặt & Ngân hàng** is the module;
**Tài khoản & Giao dịch**, **Chuyển tiền nội bộ** and **Kiểm soát sao kê** are the three list
workspaces. The sidebar, local navigation, breadcrumb, page heading and browser title use the same
labels, and detail breadcrumbs link back to the correct parent list.

The owner-current-account demo now contains the complete custody/overspend case: the owner withdraws
VND 90,000,000 from the company bank to hold for company spending, then pays VND 120,000,000 of
company payroll using the held funds plus personal funds. The resulting `3388-OWNER` balance is a
VND 30,000,000 credit, meaning the company owes the owner that amount.

The dashboard now keeps unrestricted cash for runway separate from bank balance, company cash and
owner-adjusted net cash. The operating read model totals active financial-account records by bank and
cash kind, reads positive owner payable through the approved `owner_current` statement mapping, and
computes net cash without embedded demo values. Debit owner-current balances are not treated as
available cash. Accounting profit comes directly from the canonical P&L; the UI does not present it
as taxable profit while CIT adjustments remain incomplete.

The top dashboard card set is now intentionally compact. It focuses on receivables to collect, bank
and cash balances, owner-adjusted net cash, runway, VAT payable and provisional CIT. Revenue axes,
contract backlog, project fully-loaded profit and ROS stay on their focused document, project, P&L
and executive-metric workspaces.

VAT uses `output VAT - eligible input VAT` and exposes unreviewed input separately. Provisional CIT
uses posted-ledger accounting profit before tax plus reviewed CIT-ineligible expenses, keeps
unreviewed expenses visible, and multiplies by the effective accountant-approved `cit` tax-code rate.

The demo cost mix is now more representative of actual project delivery. The existing VND
120,000,000 payroll payment is itemized without increasing its total: VND 35,000,000 is attributed to
the website project, VND 35,000,000 to the AI project and VND 50,000,000 remains shared operating
payroll. Separate contract-backed, owner-paid expenses record VND 18,000,000 of freelance UI work for
the website project and VND 28,000,000 of backend development for the AI project. Both expenses have
explicit freelancer payees, accepted synthetic contract/acceptance evidence, independent tax review,
project allocations and posted journal links.

Runway is now demonstrable from canonical ledger data rather than an N/A state. October, November
and December each contain VND 24,000,000 of paid operating cost split across team payroll, workspace
rent, cloud/tools and marketing. At the full-year cutoff, unrestricted cash is VND 261,000,000 and
the reviewed three-month average operating burn is VND 24,000,000 per month, producing 10.875 months
of runway.

ERP-841 now also defines two accountant-facing filtered XLSX exports. Sales invoices are exported
on their own axis; purchase invoices and non-invoice expenses share a workbook while preserving
canonical `sourceType`. OpenAPI and the first-party CLI expose identical date, lifecycle,
party/payee, project and invoice-presence filters. Both workbook contracts contain Summary,
Records, Lines and Filters sheets with exact minor-unit strings and SHA-256 controls.

The full accountant export now appends canonical detail sheets for posted journals and lines,
sales and purchase invoices, expenses, document and expense allocations, bank transactions,
payments, reconciliation attempts and allocations, accounts and parties. The workbook uses real
snapshot/report rows, VND/date formats, filters, frozen headers and print settings; no demo amount is
embedded in the export implementation.

The primary operational navigation now uses **Revenue Management** and **Expense Management**.
Both listings default to all invoice-presence states. Revenue combines tagged sales/credit documents
with revenue-recognition activity while visibly preserving the invoiced versus recognized axes;
Expense combines tagged purchase invoices with every expense class. Mixed rows retain their own
canonical endpoint, correction form and stable detail route, so the UI no longer opens an expense ID
through the commercial-document service or filters non-invoice expenses down to one class.

Production application routes are now wrapped by an explicit browser-session authentication gate.
Unauthenticated users are redirected to `/login` with their intended destination preserved. Local
development keeps its fixture-token workflow, while production requires the organization and access
token entered through the login form rather than treating infrastructure environment variables as a
user session.
