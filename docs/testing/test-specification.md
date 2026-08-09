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
