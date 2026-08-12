# NAAI ERP MVP Executable Test Specification

This document defines the active proof required by the four-task invoice MVP. Historical accepted
evidence remains under `docs/implementation/evidence/`; it does not create new release scope.

## 1. Traceability

- Business rule: `BR-<MODULE>-NNN`.
- Test: `T-<LAYER>-<ERP-TASK>-NNN`; short aliases in the ledger remain valid.
- Golden fixture: `GF-<DOMAIN>-NNN`.

Every active task must map its rules to independently rerunnable commands in
`docs/testing/test-catalog.yaml`. A task is not done until positive, negative and relevant boundary
cases pass and its exact-commit evidence is recorded.

## 2. Required layers

### Unit and domain

- Exact minor-unit arithmetic, state transitions and accounting invariants.
- No network or shared database.
- Deterministic time, identifiers and policy versions.

### PostgreSQL integration

- Organization isolation, unique external identities and database constraints.
- Transactional posting, idempotent upsert/import and append-only audit effects.
- Invalid external payloads and import rows create zero business mutations.

### Contract and AI-native access

- Controller routes, OpenAPI operations and first-party CLI stay aligned.
- Active operations use stable IDs, organization scope, structured errors and exact values.
- The CLI calls REST only and emits JSON by default.
- Paperless/n8n webhook examples cover signature, timestamp, external identity and retry semantics.

### E2E

- Dedicated invoice and expense list/new/detail routes.
- Draft correction, lifecycle action, refresh persistence and visible API failure.
- Paperless reference, journal and payment/reconciliation links.
- Dashboard/report values equal canonical API responses and drill down to posted sources.
- Desktop and 390px mobile journeys avoid document overflow and retain accessible controls.

### Compose, release and import

- Clean Compose startup runs migration once and reaches healthy API/web/worker state.
- Restart preserves PostgreSQL data.
- Containers run non-root and contain no source secrets.
- Every main push runs a lightweight packaging-contract check and then publishes `main` and
  immutable `sha-<12>` images whose OCI revision equals the commit. The full quality, database and
  browser suites remain in the separate CI workflow, run for pull requests or manual dispatch, and
  do not consume a second runner on routine `main` pushes.
- Workbook inventory accounts for every sheet/header/row.
- Dry-run performs zero mutations; commit is retry-idempotent and reconciles source controls exactly.

## 3. Active golden fixtures

The repository currently maintains these reviewed fixtures:

- `GF-LEDGER-001`: Trial Balance and General Ledger.
- `GF-SALES-001`, `GF-SALES-002`, `GF-PURCHASE-001`: invoice and credit behavior.
- `GF-EXPENSE-001`, `GF-EXPENSE-002`: non-invoice expense, allocations and tax views.
- Draft-expense discard regression: only draft records can be removed; version, reason and
  idempotency are mandatory; retry returns the original result and audit/outbox evidence is singular.
- `GF-BANK-001`, `GF-TRANSFER-001`, `GF-AGING-001`: banking, transfers and AR/AP controls.
- `GF-PROJECT-001`: project profitability and control ties.
- `GF-FORECAST-001`, `GF-FORECAST-002`, `GF-KPI-001`: targets, forecast composition and comparisons.
- `GF-FINANCIAL-001`, `GF-VAT-001`, `GF-EQUITY-001`: statements, VAT and executive metrics.
- `GF-EXPORT-001`: snapshots, reproduction and accountant workbook.
- `GF-DASHBOARD-001`: canonical dashboard values and typed financial source chain.

Expected results are maintained independently of production code and use exact strings/minor units.
Golden changes require explicit review and a documented reason.

### ERP-867 — Executive metrics production readiness

- `T-UNIT-ERP-867-001`: policy parsing accepts `owner_loan` and rejects unsupported semantics,
  blank account codes, invalid signs and duplicate account mappings with stable indexed errors.
- `T-E2E-ERP-867-001`: all executive metric routes render canonical API values and keep filters and
  source drill-down usable.
- `T-E2E-ERP-867-002`: a missing policy/API failure renders an actionable empty state and no
  development fixture values.
- `T-E2E-ERP-867-003`: an approved policy with no reviewed ROI facts renders “Chưa cấu hình ROI”.

### ERP-868 — Organization-wide solopreneur mode

- `T-UNIT-ERP-868-001`: the centralized resolver derives solopreneur capabilities and allows
  self-approval only for an authenticated `owner`; controlled mode retains configured thresholds.
- `T-INT-ERP-868-001`: migration converts legacy `owner_final` rows to `solopreneur`; startup env
  bootstraps a missing policy without overwriting an existing controlled organization.
- `T-E2E-ERP-868-001`: settings displays “Doanh nghiệp một người”, persists `solopreneur`, and the
  same owner can approve executive policy while controlled mode retains independent-approval copy.

### ERP-869 — Truthful executive metric visibility

- `T-UNIT-ERP-869-001`: accumulated loss combines mapped retained earnings and canonical unclosed
  earnings while a missing contributed-capital balance still produces an explicit N/A denominator.
- `T-INT-ERP-869-001`: an approved TT133 mapping classifies standard reviewed operating counterpart
  accounts but leaves `3389-BANK-CLEAR` movements unresolved until the source purpose is known.
- `T-E2E-ERP-869-001`: Equity labels the owner balance as công nợ/vãng lai chủ and keeps source
  drill-down available.

### ERP-870 — Customer service subscription management

- `T-UNIT-ERP-870-001`: service-plan defaults, exact subscription pricing, recurrence boundaries and
  lifecycle transitions are deterministic; activation never creates accounting revenue.
- `T-DB-ERP-870-002`: organization-scoped service-plan/subscription keys, customer/project
  relationships, migration paths and optimistic versions are enforced by PostgreSQL.
- `T-API-ERP-870-003`: REST CRUD, filters and typed lifecycle actions enforce client role,
  customer-project consistency, audit, idempotency and structured errors.
- `T-CONTRACT-ERP-870-004`: concrete TypeScript/OpenAPI schemas expose exact money strings,
  relationships, resource versions and permitted next actions.
- `T-CLI-ERP-870-005`: the first-party CLI calls only canonical REST routes for service plans and
  customer subscriptions with matching filters and mutation headers.
- `T-PORTABLE-ERP-870-006`: Full ERP Data Package exports both resources, dry-runs relationship and
  version checks, and restores them through canonical services without direct SQL mutation.
- `T-DOC-ERP-870-007`: AI relationship documentation orders party/client role, optional project,
  service plan and subscription writes and prohibits invented IDs or inferred invoice relationships.
- `T-E2E-ERP-870-008`: desktop/mobile UI lists historical and active subscriptions, maps canonical
  customer/project relationships and performs create/edit/lifecycle actions in dialogs.

### ERP-871 — Owner-current reconciliation menu

- `T-API-ERP-871-001`: the read model resolves the approved Owner Current account mapping, includes
  posted/reversed journal evidence and returns exact signed liability/company-funds effects.
- `T-E2E-ERP-871-002`: the banking menu exposes owner-current movements, running balance, journal
  drill-down and an explicit warning when recorded repayments/withdrawals are missing.

### ERP-873 — Owner-current expense traceability

- `T-API-ERP-873-001`: owner-current rows joined to an expense return canonical expense identity,
  purpose, class, category and tax states without changing signed balance calculations.
- `T-E2E-ERP-873-002`: an owner-paid company-cost row shows meaningful expense information and links
  to the canonical expense detail while retaining journal drill-down.

### ERP-874 — Deterministic import mapping and dashboard cutoff

- `T-UNIT-ERP-874-001`: an explicit dashboard `asOfDate` remains unchanged when it precedes the
  selected period end; report queries clamp their effective end and future cutoffs clamp to today.
- `T-UNIT-ERP-874-002`: reviewed customer aliases deduplicate WATA Tech/WATAtek, unrelated names stay
  distinct, reviewed web labels map to `WEB`, and missing/unmapped labels retain explicit flags.
- `T-INT-ERP-874-003`: workbook import accepts only active organization service-line codes, rejects
  invalid codes before mutation and persists the valid project reporting fallback.

### ERP-876 — Owner-current source-of-funds and repayment classification

- `T-API-ERP-876-001`: owner-paid payroll and purchase invoices require canonical source evidence
  plus a posted Owner Current credit; a legacy expense with no funding snapshot resolves the current
  configured treatment from its canonical expense category, while other Owner Current credits remain
  unresolved.
- `T-E2E-ERP-876-002`: Owner Current visibly separates owner-paid company costs, company repayments,
  owner funding and review-required adjustments with truthful source-specific empty states.

### ERP-877 — Simplified expense quick-edit metadata

- `T-API-ERP-877-001`: a versioned, idempotent posted-expense metadata correction updates only the
  exact active supplier/payee, business purpose, line descriptions and active category, records an
  audit event and leaves amounts, tax states, allocations, accounts and journal linkage unchanged.
- `T-E2E-ERP-877-002`: Expense Quick View exposes one save action for payee, description and category,
  removes redundant category/update controls and refreshes the row with the saved values.

### ERP-879 — Production migration registration

- `T-DB-ERP-879-001`: a fresh database migration run includes
  `0046_expense_quick_edit_metadata` and permits the audited posted-expense metadata command without
  relaxing amount, tax, account or journal immutability.

### ERP-880 — Stable collapsed-sidebar submenu navigation

- `T-UNIT-ERP-880-001`: collapsed submenu composition uses the shared HoverCard primitive and has
  no custom pointer timers while retaining named triggers, navigation landmarks and active-link
  semantics.
- `T-E2E-ERP-880-002`: after the desktop sidebar is collapsed, hovering a grouped navigation icon
  opens its submenu and moving the pointer onto a destination keeps the submenu visible long enough
  to navigate without flicker.

### ERP-878 — Category-filtered owner-paid expense list

- `T-API-ERP-878-001`: the expense list accepts `fundingTreatment=owner_paid_company_cost`, uses the
  persisted line snapshot first and falls back to the canonical category mapping for legacy null
  snapshots, including legacy category codes stored in dimensions.
- `T-E2E-ERP-878-002`: Owner Current loads the owner-paid section from the filtered expense list while
  repayments, owner funding and unresolved adjustments remain ledger-derived; executive dashboard
  metrics and the mapped closing Owner Current balance are unchanged.

### ERP-881 — Confirmed owner cash timeline

- `T-API-ERP-881-001`: the confirmed timeline uses an expense's persisted funding snapshot first and,
  only for legacy null snapshots, its reviewed canonical category treatment; strict company bank/cash
  repayments and owner funding are also confirmed. Invoice-only or company-funded-category costs remain
  review items. Running balance is chronological and excludes review items, while the complete ledger
  closing balance remains unchanged and separately disclosed.
- `T-E2E-ERP-881-002`: the primary Owner Current table shows confirmed cash movements and the balance
  immediately after each row. Unproven imported expenses appear only in a separate review section and
  never mix with the confirmed timeline or dashboard metric.

### ERP-882 — Monthly expense analysis

- `T-API-ERP-882-001`: organization-scoped report APIs aggregate posted purchase invoices and posted
  direct expenses by calendar month, count payees once per source, aggregate category by line, retain
  explicit unclassified rows and reconcile totals separately for every currency.
- `T-CONTRACT-ERP-882-002`: the versioned response keeps exact minor-unit strings, date range,
  dimension identity, currency series, monthly groups and source-count metadata machine-readable.
- `T-CLI-ERP-882-003`: the first-party CLI reads both report dimensions and drill-down using the same
  date/currency filters and paths as OpenAPI.
- `T-E2E-ERP-882-004`: both report pages preserve URL period filters, display monthly totals and all
  dimension rows, and drill down to Expense Management with the exact month and payee/category filter.

### ERP-883 — Expense analysis period and filter parity

- `T-UNIT-ERP-883-001`: expense analysis keeps exact API date-range queries and drill-down links
  while the table value has no redundant decorative arrow.
- `T-E2E-ERP-883-002`: both expense analysis pages expose the shared year/quarter/month navigator,
  a URL-backed custom date filter and responsive controls matching Revenue and Expense Management.

### ERP-884 — Owner settlement from custody cash and evidenced withdrawals

- `T-API-ERP-884-001`: owner settlement adds configured owner-paid costs and owner funding, subtracts
  reconciled owner-custody cash and evidenced personal withdrawals, keeps unsupported repayment
  journals in review, and separately returns statutory Owner Current. Dashboard debt is the
  nonnegative confirmed position and a negative position becomes owner-held company funds.
- `T-E2E-ERP-884-002`: Owner Current and Dashboard use the same confirmed position, distinguish owner
  custody from personal withdrawal, show unsupported repayment separately and retain statutory ledger
  reconciliation. The production control equation is `165,483,950 - 135,320,000 - 52,000,000 =
-21,836,050`; company debt is zero and owner-held company funds are `21,836,050` until the unsupported
  `100,000,000` repayment receives canonical evidence.

### ERP-886 — Simplified service-plan quick create

- `T-UNIT-ERP-886-001`: Vietnamese and punctuation-heavy service names produce stable uppercase
  ASCII plan codes, with a non-empty fallback.
- `T-API-ERP-886-002`: create accepts only schema version, readable name and exact default price;
  the canonical service applies VND/monthly defaults, resolves an active organization service line
  and allocates a unique stable code without returning `SERVICE_LINE_NOT_FOUND` on the happy path.
- `T-E2E-ERP-886-003`: desktop/mobile quick-create dialogs show aligned name and price controls only,
  submit the minimal canonical REST payload and do not expose code, service-line, interval count,
  billing day or reason as required user fields.

### ERP-887 — Remove unconfirmed Owner Current review table

- `T-E2E-ERP-887-001`: Owner Current renders confirmed settlement metrics and movements only; review
  records returned by the API remain excluded from owner debt and are not shown as a table or metric.

### ERP-892 — Sidebar-owned sibling-page navigation

- `T-UNIT-ERP-892-001`: navigation data exposes complete named submenus for receivables/payables,
  banking and planning without promoting their children to unrelated top-level destinations.
- `T-E2E-ERP-892-002`: desktop, collapsed and mobile navigation reaches every sibling page while the
  corresponding workspace main content contains no tab-like route switcher.

### ERP-888 — Canonical owner cash withdrawal entry

- `T-API-ERP-888-001`: one authorized idempotent command creates an organization-scoped negative
  bank/cash transaction, canonical withdrawal evidence and a balanced posted Dr Owner Current / Cr
  selected financial-account journal; inactive/mismatched accounts, missing mapping and locked periods
  fail without partial writes, and the read model classifies the result as confirmed personal withdrawal.
- `T-CLI-ERP-888-002`: the first-party CLI sends the versioned withdrawal payload and idempotency key
  to the canonical banking endpoint without accepting ledger account codes.
- `T-E2E-ERP-888-003`: Owner Current exposes a responsive dialog for date, active source account,
  formatted VND amount and note; successful submission refreshes the confirmed settlement timeline.

### ERP-891 — Native development data-source profiles

- `T-OPS-ERP-891-001`: the native development launcher rejects unknown profiles and production-write
  flags in local mode, validates local PostgreSQL/API readiness without starting servers, and delegates
  production checks to the server-only production API proxy without exposing its token to browser code.

### ERP-889 — Canonical manual customer receipts

- `T-API-ERP-889-001`: an authorized idempotent receipt posts one balanced Dr funding / Cr AR
  journal, allocates one or many same-customer invoices, derives partial/full invoice states and
  rejects over-allocation, currency/customer mismatch, locked periods and cross-organization IDs
  without partial writes.
- `T-CLI-ERP-889-002`: the first-party CLI sends the versioned exact-money receipt payload to the
  canonical REST endpoint and never accepts direct ledger SQL or a UI-only paid flag.
- `T-E2E-ERP-889-003`: receivables expose a responsive record-receipt action using readable funding
  account and invoice choices, then refresh aging with the derived balance and payment state.

### ERP-890 — Project freelance actual payables

- `T-API-ERP-890-001`: posting one canonical freelancer expense creates one linked project payable;
  partial/full payments post balanced journals idempotently and AP aging excludes purchase invoices.
- `T-CLI-ERP-890-002`: the CLI lists and pays the canonical payable through REST only.
- `T-E2E-ERP-890-003`: Expense captures project, freelancer and due date while Payables lists and
  settles only actual unpaid freelance costs on desktop and mobile.

### ERP-900 — Solopreneur gate inventory

- `T-DOC-ERP-900-001`: every OpenAPI POST/PATCH/DELETE operation appears exactly once in the
  machine-readable gate matrix with a valid financial-effect classification and reviewed safeguards.
- `T-CONTRACT-ERP-900-002`: no journal, period, document, expense, payment, reconciliation,
  recognition, allocation commit or financial import mutation is classified `none`.

### ERP-905 — Remove obsolete time and cost-allocation subsystems

- `T-DB-ERP-905-001`: migration removes only the obsolete workforce, timesheet, derived project-cost,
  direct-allocation and overhead-allocation tables/enums while canonical journals, Expenses,
  commercial documents and their control totals remain unchanged.
- `T-API-ERP-905-002`: project profitability counts each posted project Expense and posted purchase
  allocation once, excludes unprojected overhead and drafts, and no removed route appears in discovery.
- `T-CLI-ERP-905-003`: CLI exposes no removed resource and retains canonical Expense, purchase and
  project-profitability access through REST.
- `T-INT-ERP-905-004`: database upgrade succeeds on an existing tenant and post-migration report totals
  tie to the posted canonical sources without a derived cost queue.

### ERP-906 — Bounded export storage and migration-safe latest updates

- `T-API-ERP-906-001`: portable export uses reviewed dispositions, emits no empty or duplicate child
  worksheets and records every excluded resource with a stable manifest reason.
- `T-DB-ERP-906-002`: successful portable and accountant exports retain only the configured newest
  records for the same organization and export class without deleting another organization, canonical
  business data, journals or resource audit events.
- `T-OPS-ERP-906-003`: the supported latest-image update command pulls images, runs and waits for the
  one-shot migrate service before recreating API/web/worker, then performs health and migration
  readback; migrate failure stops rollout.
- `T-INT-ERP-906-004`: storage diagnostics identify relation/TOAST growth and dead tuples read-only,
  while any lock-heavy reclaim command requires an explicit maintenance confirmation.

### ERP-907 — Immediate canonical management data in solopreneur mode

- `T-API-ERP-907-001`: an authenticated owner in persisted solopreneur mode creates a valid sales
  document, purchase document or expense through one idempotent save-and-record action; the source
  reaches issued/posted state with one balanced journal and singular audit/outbox effects. Controlled
  mode still returns a draft and preserves maker-checker.
- `T-DB-ERP-907-002`: planning actuals read canonical recognition, invoice and collection sources
  without a persisted stale cache or manual backfill endpoint. Fresh and upgraded databases remove
  the obsolete planning fact table safely.
- `T-E2E-ERP-907-003`: dashboard, account balances and reports show newly posted canonical data on
  the next read. Missing evidence, dimensions or tax eligibility appears as a local warning and does
  not blank unrelated cards or reports.
- `T-REG-ERP-907-004`: balanced posting, posted immutability, reversal/replacement, hard period locks,
  duplicate prevention, organization scope, audit and idempotency remain enforced in both operating
  modes. Unreviewed VAT/CIT affects only eligibility/finality axes, not accounting profit.

## 4. Active MVP gate

### ERP-710 — External ingestion

- Same external identity returns or updates one resource even when request idempotency keys differ.
- Cross-organization identities do not collide.
- Credit-note ingestion and invoice/expense duplicate prevention pass.
- Invalid payloads return field errors and create no business effect.

### ERP-720 — Focused admin UI

- Invoice and expense CRUD/lifecycle journeys pass on desktop and mobile.
- Organization master data is used instead of demo account assumptions.
- Out-of-scope routes/workflows are absent from primary navigation and product discovery.

### ERP-730 — Reports and clean setup

- Fresh seeded organization can create/post MVP sources and load required reports.
- P&L, Balance Sheet, direct Cash Flow, VAT, AR/AP and accountant export controls tie at one cutoff.
- Dashboard and drill-down values match canonical report APIs and golden fixtures.

### ERP-740 — Release and import

- Exact-commit CI reports quality independently; image publication is gated only by release and
  Compose packaging contracts so a flaky browser test cannot prevent deployment artifacts.
- Fresh Compose stack is healthy and persistent.
- `main` and immutable SHA images are pullable and identify the exact commit.
- Real workbook dry-run, commit, retry and reconciliation evidence pass.

Gate G7/MVP is complete only when ERP-710 through ERP-740 are done with evidence and the final
exact-commit CI/release readback is green.

### ERP-800 — Owner-reactivated import correction extension

- Every supplied workbook row has a stable, organization-scoped review identity and dry-run is
  deterministic with zero mutations.
- Review edits are audited, version-checked and retry-idempotent.
- Replacing a legacy posted expense with a purchase invoice requires exact source linkage, normal
  reversal and replacement posting; control totals must reconcile without duplicate accounting.
- Source controls remain explicitly non-canonical in reports and the interactive dashboard chart.
- Review, dashboard and financial-statement journeys pass on desktop and 390px mobile.
- In-place editing inside Quick View Dialog updates records seamlessly without full page navigation.
- Formatted currency inputs properly display `₫` and thousand separators, and submit exact amounts without floating-point issues.
- Quick period selectors (MTD, YTD, full year) correctly update parameters across financial report workspaces.
- Revenue and expense management listings default to all invoice-presence states, visibly preserve
  invoiced versus recognized revenue axes, and open each mixed row through its canonical endpoint.
- The `present` and `missing` filters exclude the opposite source class without hiding other valid
  non-invoice expense classes.

Gate G8 is complete only after ERP-800 evidence, exact-commit CI and post-push readback are green.

### ERP-841 — Complete management listings and accountant workbooks

- Revenue and expense management listings keep invoice, recognition and non-invoice expense axes
  distinct while retaining stable detail routes.
- Sales invoice and purchase-invoice/expense workbook downloads honor the same date, lifecycle,
  party/payee, project and invoice-presence filters exposed by the first-party CLI.
- Workbook controls reconcile to filtered canonical records; exact money remains minor-unit strings
  and purchase invoices are never fuzzy-merged with expenses.
- Production login accepts the server-only username/password configured in the deployment
  environment and returns an existing organization-scoped API credential only after successful
  authentication. Login secrets must not use public browser environment variables.
- Project management defaults to all lifecycle states and offers a URL-restorable Kanban view with
  all lifecycle columns; dragging a card sends the canonical project PATCH and moves the card only
  when the update succeeds. Kanban cards expose no redundant state dropdown.

## 5. Evidence

### ERP-862 — Persistent production login

- A valid production login sets a 30-day encrypted `HttpOnly`, `Secure`, same-site cookie and does
  not return or persist the API token in browser JavaScript.
- Refresh, a new tab and an application container update retain the session when the same
  `SESSION_SECRET` is supplied to web and API.
- Tampered, expired or cross-organization cookies fail closed. Cookie-authenticated mutations reject
  a foreign Origin; normal CLI Bearer authentication remains unchanged.
- Logout clears the cookie and a deliberate secret rotation invalidates all existing sessions.

### ERP-855 — Purchase product VAT catalog

- Empty-database migration creates an organization-scoped purchase-product catalog.
- API and CLI create, list, read, update and deactivate products through the shared master-data
  contract with audit, idempotency and resource versions.
- VAT rates other than 8% or 10% return a structured validation error and create no product.

### ERP-858 — Solopreneur single-user expense workflow

- Organization policy is readable and writable through REST and the first-party CLI with audit,
  organization isolation and idempotency.
- Solopreneur defaults persist management, CIT and VAT decisions on documented expense and purchase
  invoice lines; explicit overrides and non-documented/fixed-asset boundaries remain intact.
- Financial statements and dashboard taxable-profit/VAT controls read persisted line decisions and
  do not hardcode purchase invoices as unreviewed.
- Legacy finalization supports deterministic dry-run, explicit commit and retry idempotency with
  exact record and money controls.

### ERP-859 — Project is the user-facing commercial contract

- Invoice and expense create/edit dialogs load projects from canonical project master data and do
  not expose a separate contract selector.
- Selecting a project on a sales invoice derives the linked customer from that project.
- The project profile presents the single legacy contract's reference, signed date and commercial
  value as project facts, while keeping approved budget distinct from contract value.
- Multiple legacy contract rows are surfaced as a data-quality warning instead of being silently
  treated as one contract.

### ERP-861 — Owner liquidity and owner-paid classification

- The executive dashboard shows one company cash-and-bank amount, one complete Owner Current
  liability and one net-company-funds amount calculated as cash and bank less that liability.
- It does not show a separate zero operating-owner obligation or duplicate Owner Current card.
- It does not show a Runway headline card; the dashboard leaves operating-duration judgment to the
  owner from the displayed cash position.
- In approved `solopreneur` mode, legacy posted expenses credited to the reviewed owner-current
  account are included in owner-paid company cost and do not remain in the unclassified queue.
- Dashboard amounts come from the operating-dashboard API/read model; the UI contains no demo or
  hardcoded financial totals.

Each task evidence folder records:

- commands and pass/fail/skip counts;
- fixture and reconciliation results;
- desktop/mobile screenshots where relevant;
- commit SHA and CI URL;
- image tags/digests and Compose readback for ERP-740;
- remaining risks or owner/accountant decisions.

Enterprise observability programs, semantic releases, automated deployment, parallel run, formal
cutover and hypercare are not part of this MVP and require new ledger/catalog entries before work.

### ERP-908 — Automation and AI protocol examples

- The expense page header exposes an `API & tự động hóa` button which opens a responsive dialog.
- The complete purchase-invoice example posts to the canonical commercial-document endpoint and
  includes supplier, exact minor-unit totals, VAT accounts, project/category relationships,
  optional company funding and an external Paperless/n8n identity.
- The dialog explains that clients follow response `nextActions` and do not blindly replay the
  controlled lifecycle when solopreneur owner creation already posted the invoice.
- A production API token is returned only after an authenticated same-origin POST, with private
  no-store caching. It is never present in source code, the initial HTML or public environment
  variables.
- Production-backed native development uses the server-only upstream token injected by the approved
  launcher or the same macOS Keychain credential; the production runtime never accepts those
  fallbacks and requires an encrypted session.
- Copy actions produce complete cURL examples for purchase-invoice ingestion and purchase-product
  creation. The UI warns operators to store the stable token in an n8n Bearer credential.

### ERP-909 — Contextual automation protocols on every input screen

- Customer, project, subscription, purchase-product, revenue and expense list pages expose the
  shared `API & tự động hóa` action in their page header.
- Each page reveals only its own complete production cURL examples after an explicit token action;
  opening the dialog alone performs no credential request.
- Contract tests cover organization scope, bearer authentication, idempotency and canonical
  relationship fields for all supported resources. Customer creation includes the ordered party and
  `client` role requests; subscription creation references customer, plan and optional project IDs.
- Desktop E2E covers all six page contexts. Mobile E2E verifies that long invoice cURL content stays
  inside the responsive dialog without causing document-level horizontal overflow.
- Repository regression gates confirm that the shared component does not change accounting,
  authorization, organization-scope or existing input workflows.

### ERP-910 — Minimal OCR purchase-invoice protocol

- The expense dialog presents separate supplier, supplier-role and quick-invoice cURLs before the
  full accounting example so n8n imports one HTTP node at a time.
- The quick invoice has no project allocation or funding source and records the known gross amount
  as management cost with zero deductible VAT and tax eligibility `unreviewed`.
- Contract tests assert the absence of invented project/payment relationships. Mobile E2E opens the
  minimal example and verifies long cURL content remains responsive.

### ERP-911 — Paste-ready n8n OCR mapping expression

- The expense dialog shows a single expression object that can be pasted into n8n Edit Fields or an
  HTTP JSON body in Expression mode.
- It maps the Vietnamese OCR labels visible in `$json.output`, retains Paperless source metadata and
  raw OCR output, and normalizes tax ID, VND amounts and `dd/MM/yyyy` dates.
- The result separates supplier, supplier-role, invoice candidate, OCR metadata and validation. It
  leaves unsupported accounting relationships null and sets `readyToPost` false until exact net,
  VAT, due date, accounts and allocation controls are supplied.
- Tests protect the paste syntax, mapped field inventory, absence of project/funding guesses and
  responsive rendering alongside existing cURL examples.

### ERP-912 — Safe and immediate n8n invoice handoff

- Every operational request is a separate importable cURL: create supplier, assign supplier role,
  then create the quick invoice.
- The quick invoice works with the basic date, description, category and gross amount from OCR; it
  does not require a project or payment account and does not claim input VAT that was not extracted.
- A staging wrapper accidentally posted to `/commercial-documents` returns `VALIDATION_FAILED`
  rather than `CANNOT_READ_PROPERTIES_OF_UNDEFINED`.
- Contract, API and E2E tests cover the three independent requests and responsive copy flow.

### ERP-913 — One-call supplier-aware purchase-invoice ingestion

- One organization-scoped POST accepts only the basic supplier and OCR invoice fields, resolves an
  exact normalized tax ID, creates the supplier party/role if absent and delegates to the canonical
  purchase-invoice service.
- The backend derives fiscal year, due date, safe zero-VAT totals and active organization account
  mappings. It never guesses a project, funding account or deductible VAT claim.
- Category may be an internal code, an OCR label or omitted when the description provides a strong
  unique match. Resolution uses only active canonical organization categories; ambiguous or unknown
  input fails before creating supplier master data.
- Retry uses the normal commercial-document idempotency and external identity controls. An existing
  active supplier is reused; an inactive supplier or missing category/account mapping fails clearly.
- The expense automation dialog exposes one directly copyable ingestion cURL instead of three setup
  requests, plus a separate cleanup cURL for draft test invoices.
- Draft deletion requires `If-Match`, reason and idempotency, retains audit evidence and rejects any
  invoice that has progressed, has a journal or is referenced by another business resource.
- API/CLI contract, focused unit/integration tests, responsive E2E and the full repository gate cover
  the one-call ingestion and safe cleanup paths.

### ERP-914 — Paperless OCR expression normalization

- The Expense automation dialog provides one n8n expression object whose result is the exact
  one-call purchase-invoice request body, not an intermediate supplier/invoice staging structure.
- Vietnamese formatted amounts such as `408.601`, timestamps such as
  `27/07/2026 07:22:52`, punctuated tax IDs and sparse invoice-number fields normalize to the API
  contract. When OCR does not expose the invoice number separately, the expression extracts it from
  the Paperless document content.
- A representative Paperless payload regression test proves the normalized date, amount, tax ID,
  invoice number, category and external reference.

### ERP-915 — Immediate automation examples

- Opening the contextual API dialog automatically resolves the credential from the authenticated
  session and renders the examples without an intermediate warning or reveal action.
- The dialog makes one credential request per mounted session, shows only a short loading state and
  preserves the existing desktop/mobile copy and responsive behavior.

### ERP-916 — Reverse-proxy session-origin validation

- The production automation-token route accepts an authenticated request when the browser Origin
  matches the public origin reconstructed from trusted reverse-proxy host/protocol headers, even when
  the internal Next.js request URL uses a container origin.
- Missing sessions and genuinely cross-origin browser requests remain rejected, and no credential is
  exposed in error responses or logs.
