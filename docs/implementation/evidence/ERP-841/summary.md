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
development keeps its fixture-token workflow. Production accepts a username and password configured
through server-only environment variables; the Next.js server releases the corresponding existing,
organization-scoped API credential only after a constant-time credential check. No login secret is
declared through a `NEXT_PUBLIC_*` variable or rendered into the initial browser payload.

Final commercial documents now expose a dedicated audited category-metadata mutation. The endpoint
updates only `dimensions.category`, validates the category against active organization master data,
and remains idempotent and RBAC-scoped. The database trigger continues rejecting every financial or
structural child mutation on issued/posted documents. The revenue and expense quick view exposes the
same operation without reopening the financial document lifecycle.

The shared table primitive now exposes a column-visibility menu for every application table. Each
table derives a stable route-and-header configuration key, stores hidden-column indexes in browser
application configuration and restores them on reload while preventing users from hiding every
column.

Posted non-invoice expenses now expose the same category-metadata correction path as commercial
documents. The organization-scoped API validates active category master data, updates only
`expense_lines.dimensions.category`, returns idempotent audit evidence and exposes the category in
expense list readback. The database still rejects changes to amounts, tax review, funding treatment,
allocations and every other posted financial field. Expense Quick View can save the category and the
combined expense list refreshes without direct database access.

Production sales-invoice metadata was reclassified from the temporary catch-all revenue category
using its persisted client and project relationships. The eight 2026 invoices now use web,
software-development, consulting, design/media and system-maintenance categories. The outbound UI
catalog includes the active `WEB` category so list and Quick View surfaces render its Vietnamese
name instead of the raw category code.

Projects now have an optional `default_service_line_code` available through the same versioned,
organization-scoped master-data API used by the first-party clients and through the project admin
editor. Migration 0038 adds the nullable project field and database guards that require an active
same-organization `service_line` dimension and prevent an assigned dimension from being deactivated
or deleted. Project profitability continues to prefer approved timesheet attribution, but falls back
to this project default when no approved timesheet supplies a service line. This removes false
`service-line-unclassified` review signals without inventing timesheets or mutating posted ledger
history.

The project directory now follows the established invoice-management filter pattern. It defaults to
active projects and provides a compact filter popover for lifecycle state and quick/custom execution
dates. Applied state and date values are persisted in `state`, `startsOn` and `endsOn` URL parameters,
while the existing free-text search remains combined with them. Date filtering uses interval overlap,
so a monthly or long-running project remains visible whenever any part of its execution period falls
inside the selected range; an open-ended project continues to match future ranges.

Revenue and expense management charts now follow the same category contract as their focused detail
surfaces. Commercial documents are split and aggregated by each line's canonical category dimension
instead of assigning the entire document to the first line. Non-invoice expenses consume the
canonical category returned by the list API, whose read model falls back from
`dimensions.category` to `expense_category_code`. Records without either value remain visible under
the explicit **Doanh thu chưa phân loại** or **Chi phí chưa phân loại** series.

## Operational project mutability boundary

Posted accounting entries, issued financial documents and retained audit history remain immutable,
but ordinary operational project attributes remain editable. An unreferenced duplicate project can
be deleted through the organization-scoped application service used by API, CLI and UI, with
optimistic version, reason, idempotency and append-only audit evidence. Any canonical business or
financial reference blocks deletion with a structured conflict; deletion never cascades into
accounting or historical records.

The project editor now prioritizes frequently changed operational fields. Project state is selected
from the canonical lifecycle values instead of entered as free text; approved budget is displayed
with Vietnamese thousand separators while the API still receives an exact digit-only minor-unit
string; planned end date and multiline operating notes include concise management guidance. The
project profile and directory also render Vietnamese lifecycle labels instead of raw enum values.
Identity and classification fields remain editable in a separate lower section of the dialog.

Local production-backed UI development remains read-only by default. An explicit development-only
flag can enable PATCH for one narrow route shape: an existing project record in the configured
organization. The proxy still rejects project creation/deletion, customer changes and every
financial mutation. It forwards the server-held credential plus correlation, idempotency and
optimistic-version headers without exposing the production token to browser code.

The project directory now defaults to all lifecycle states and also provides a URL-backed Kanban
view. Its five lifecycle columns use the canonical project states, show live counts and support
drag-and-drop updates. Cards stay compact with project identity and a direct profile link; the
project editor remains the non-drag path for precise state changes. State moves are optimistic in the
UI, call the same guarded project PATCH as the editor and roll back visibly if the API rejects the
update.

Production cleanup on 2026-08-09 moved all 34 projects that were still marked `active` to
`completed`. Readback over all 40 production projects returned zero remaining active records and no
failed updates.

Expense creation now opens as a large, scrollable dialog on the expense management list; the legacy
`/expenses/new` URL redirects into that dialog. Payee suggestions are limited to supplier-role
parties and render `display_name` instead of raw `party-*` IDs. Employee choices come from active
workforce profiles joined back to party names. The current production organization has no workforce
profiles, so the dialog truthfully shows that the employee catalog is empty rather than offering
unrelated suppliers or clients as employees.

The development production proxy remains mutation-deny-by-default and now has a second explicit,
narrow capability flag for `POST /expenses`. It does not allow generic POST, party creation or any
other financial endpoint and forwards the API client's idempotency key.

Revenue creation now follows the same in-context pattern. **Tạo hóa đơn bán ra** opens a scrollable
dialog on revenue management, and `/documents/new` redirects to that dialog. Customer options are
derived from `client` party roles and display the real customer name instead of a `party-*` key. The
development proxy exposes commercial-document POST only behind its own explicit flag and exact route
allowlist.

Revenue and expense draft forms now carry the relationships required for project reporting instead
of creating disconnected records. Revenue selects a client-role customer, then a customer-owned
project, then an optional contract belonging to that project. Expense keeps its supplier/payee
independent while optionally selecting the project receiving the cost and one contract from that
project. Both flows persist canonical `projectId` and optional `contractId` inside allocation
dimensions. API validation rejects missing or cross-organization projects, closed projects,
customer/project mismatches and contract/project mismatches. Draft PATCH requests that omit lines
preserve stored lines and allocations; edit forms retain allocation identity and unrelated dimensions
when updating the selected relationships.

## Shared table column control follow-up

Every shared table now follows the shadcn data-table toolbar pattern: a client-side row search sits on
the left and the outline `Cột hiển thị` dropdown sits on the right above the table. Search matches the
full canonical row text independently of which columns are currently hidden. The existing checkbox
menu and per-table local visibility persistence are unchanged.

## Shared expense overview

Dashboard and Expense Management now render the same `ExpenseOverviewChart` from the same canonical
purchase-invoice plus non-invoice expense population. Both use the same period filtering, category
builder, Vietnamese category labels and exact minor-unit totals. Dashboard no longer creates the
separate workbook-derived `Chưa phân bổ` series and drills down with `invoiceStatus=all`.

## Expense category recovery

The local `naai` organization had 124 expense rows and 190 purchase-invoice lines with no canonical
category metadata. An audited, idempotent API backfill reconstructed workbook expense categories by
source row and classified purchase invoices through the same deterministic inference rules. Readback
now returns categories for every expense and purchase-invoice line. Workbook commit and workbook
expense migration now persist inferred category dimensions when creating future records.

## Dashboard layout follow-up

- Metric-card titles now use the full card width; provisional/review badges sit in a dedicated
  footer below the primary value and long statuses truncate instead of squeezing titles vertically.
- The empty `Budget burn & EAC` fallback table was replaced by a commercial project pipeline using
  actual contracted, invoiced and remaining values from the operating-dashboard read model.
- Dashboard review signals now exclude workbook-import backlog rows and disclose that backlog as a
  separate data-normalization count, so the Finance review total matches the exceptions it renders.
- Dashboard liquidity cards now use posted-ledger balances consistently: bank and cash are
  consolidated into one company-funds card, the amount owed to the owner comes from the approved
  owner-current operating subledger, and no hypothetical post-settlement cash card is shown. The
  management amount includes operating losses borne by the owner, excludes equipment/assets and
  owner financing, and subtracts posted repayments from company bank or cash. Legacy expense lines
  posted to the mapped owner account without a funding snapshot are disclosed as review-required
  instead of producing a false `ready` state.
- Local UI development can use a development-only server-side read proxy to production. It keeps
  the production API token out of browser code, locks organization scope and exposes only GET/HEAD,
  so interface work does not need a second database and cannot mutate production financial truth.

## Controlled relationship backfill

Commercial documents and expenses now expose organization-scoped relationship inventories with
top-level `projectIds` and `contractIds`. Corrections use inventory → zero-mutation dry-run → commit.
Dry-run requires `If-Match`, a complete replacement and reason, and returns a deterministic SHA-256
`planHash` plus reverse/replacement effects. Commit requires the unchanged plan/version, returned
hash and `Idempotency-Key`, then uses the canonical reverse/replacement service: document originals
become cancelled, expense originals become reversed, journal history is reversed under period locks,
and a linked replacement draft retains the external identity and invoice identity.

Production audit was read-only; no mutation or deployment occurred. It found 129 documents (8 issued
sales, 121 posted purchase) and 124 expenses (112 posted, 12 draft). All sales have projects, none has
contracts; seven have deterministic one-contract candidates. `sinv-c26tnt-5-2026` has customer
`party-0108180534` but its project is owned by `party-0101362912`, so master data must be corrected
first. Purchase invoices have valid suppliers but no project/contract attribution; six duplicate
groups cover 12 documents. All expenses lack payee/project/contract/employee attribution. Eighteen
have one likely invoice counterpart and one is ambiguous; these remain duplicate-source review cases,
not automatic links.
