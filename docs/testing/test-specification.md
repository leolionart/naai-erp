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
- A successful main check publishes `main` and immutable `sha-<12>` images whose OCI revision equals
  the commit.
- Workbook inventory accounts for every sheet/header/row.
- Dry-run performs zero mutations; commit is retry-idempotent and reconciles source controls exactly.

## 3. Active golden fixtures

The repository currently maintains these reviewed fixtures:

- `GF-LEDGER-001`: Trial Balance and General Ledger.
- `GF-SALES-001`, `GF-SALES-002`, `GF-PURCHASE-001`: invoice and credit behavior.
- `GF-EXPENSE-001`, `GF-EXPENSE-002`: non-invoice expense, allocations and tax views.
- `GF-BANK-001`, `GF-TRANSFER-001`, `GF-AGING-001`: banking, transfers and AR/AP controls.
- `GF-PROJECT-001`: project profitability and control ties.
- `GF-FORECAST-001`, `GF-FORECAST-002`, `GF-KPI-001`: targets, forecast composition and comparisons.
- `GF-FINANCIAL-001`, `GF-VAT-001`, `GF-EQUITY-001`: statements, VAT and executive metrics.
- `GF-EXPORT-001`: snapshots, reproduction and accountant workbook.
- `GF-DASHBOARD-001`: canonical dashboard values and typed financial source chain.

Expected results are maintained independently of production code and use exact strings/minor units.
Golden changes require explicit review and a documented reason.

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

- Exact-commit CI is green.
- Fresh Compose stack is healthy and persistent.
- `main` and immutable SHA images are pullable and identify the exact commit.
- Real workbook dry-run, commit, retry and reconciliation evidence pass.

Gate G7/MVP is complete only when ERP-710 through ERP-740 are done with evidence and the final
exact-commit CI/release readback is green.

## 5. Evidence

Each task evidence folder records:

- commands and pass/fail/skip counts;
- fixture and reconciliation results;
- desktop/mobile screenshots where relevant;
- commit SHA and CI URL;
- image tags/digests and Compose readback for ERP-740;
- remaining risks or owner/accountant decisions.

Enterprise observability programs, semantic releases, automated deployment, parallel run, formal
cutover and hypercare are not part of this MVP and require new ledger/catalog entries before work.
