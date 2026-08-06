---
title: "NAAI ERP - Sequential Coding Plan"
doc_type: project-doc
project: "NAAI ERP"
status: active
tags:
  - coding-plan
  - invoice-mvp
  - paperless
  - n8n
  - docker-compose
created: 2026-08-05
updated: 2026-08-06
---

# NAAI ERP - MVP Sequential Coding Plan

> Canonical scope after the 2026-08-06 product reset. NAAI ERP is a structured invoice/expense data system and reporting application. Paperless-ngx owns source files; n8n/OCR owns extraction, normalization and retry orchestration.

## 1. Product boundary

Canonical flow:

```text
PDF/XML/image
  -> Paperless-ngx stores and indexes the source document
  -> n8n/OCR extracts and normalizes structured data
  -> NAAI ERP idempotent webhook/API upserts the business record
  -> NAAI ERP UI allows direct correction
  -> NAAI ERP reports revenue, expense, VAT, cash and profit
```

NAAI ERP owns:

- sales invoices, purchase invoices and credit notes;
- non-invoice expenses;
- customers, suppliers, projects, categories, tax codes and payment state;
- organization-scoped REST/OpenAPI/CLI and signed webhook ingestion;
- Paperless identity/reference metadata, not file bytes;
- duplicate prevention and idempotent upsert;
- P&L, Balance Sheet, direct Cash Flow, VAT, AR/AP and accountant export;
- production Docker Compose, main/SHA images and real-data import.

NAAI ERP does not own:

- OCR, PDF/XML parsing or source-document download;
- document archive/search/versioning;
- review/approval inbox for OCR results;
- replay/dead-letter orchestration for extraction errors;
- integration-source onboarding wizard;
- semantic release automation, automated deployment platform, formal pilot/hypercare program.

If an inbound payload is invalid, ERP returns a structured field error. n8n decides whether to retry, alert or route the item elsewhere. A user may edit an ERP draft directly; there is no separate review workflow.

## 2. Delivery principles

1. Reuse completed accounting/reporting modules; do not rebuild them.
2. ERP-710 through ERP-740 close the invoice MVP. ERP-800 is the only owner-reactivated extension
   and remains bounded by its ledger entry; no other enterprise scope is implied.
3. Out-of-scope UI routes and workflow commands are removed or unregistered from primary navigation and machine discovery. Underlying completed code may remain only as an explicitly supported, tested compatibility surface.
4. No generic approval, maker-checker or replay workflow is added for external invoice ingestion.
5. The same external Paperless identity must never create duplicate business records inside one organization.
6. Purchase invoice is the canonical supplier-invoice record. Expense is used for non-AP/non-invoice spend; legacy `invoice_backed` expense remains compatible but is not a second ingestion target.
7. UI uses dedicated list/new/detail routes. Modal/Sheet/Drawer remain bounded supporting interactions.
8. AI/n8n/UI call the same REST application services; no direct database integration.
9. Antigravity/Gemini may implement mechanical CRUD UI, clients, test boilerplate, Docker and docs from bounded task packets. Codex owns accounting invariants, integration, review and final gates.
10. One exact-commit CI proof closes each task; avoid redundant CI repair loops when targeted tests already identify the fault.
11. A route, menu, OpenAPI operation or CLI command is a product commitment. Do not advertise deferred capabilities merely because implementation code still exists.

## 3. Existing capability retained

The following completed capabilities are reused:

- organization, accounts, tax codes, parties and projects;
- double-entry journal and fiscal controls;
- sales/purchase invoices, credit notes and non-documented expenses;
- signed inbound webhooks and direct idempotent API commands;
- banking/reconciliation and AR/AP;
- P&L, Balance Sheet, direct Cash Flow, VAT/tax exceptions and accountant exports;
- executive dashboard and financial drill-down.

No work is planned merely to broaden these modules.

## 4. Remaining tasks

### ERP-710 — External invoice ingestion and Paperless identity

Deliverables:

- generic external reference attached to invoice/expense: `system`, `externalId`, canonical URL, checksum/version, sync timestamp and metadata;
- unique `(organization, system, externalId)` constraint;
- idempotent upsert by external identity even if the HTTP idempotency key changes;
- preserve inbound `externalId` on the created business resource;
- add `credit_note.create` webhook support;
- cross-model duplicate rule: Paperless identity first, then supplier + invoice number/date/amount/currency;
- structured validation errors for n8n; no review/replay workflow;
- OpenAPI/CLI coverage and PostgreSQL isolation/idempotency tests.

Acceptance:

- same Paperless event/key creates one resource;
- different request key with the same external identity updates/returns the same resource;
- the same Paperless ID may exist in another organization without collision;
- invalid payload has zero business effect and returns field-level errors;
- purchase invoice cannot also be ingested as a separate invoice-backed expense.

### ERP-720 — Focused invoice and expense admin UI

Deliverables:

- `/documents`, `/documents/new`, `/documents/[documentId]`;
- `/expenses`, `/expenses/new`, `/expenses/[expenseId]`;
- draft edit/update and accounting lifecycle actions; no hard delete of posted records;
- Paperless source card with canonical external link and sync metadata;
- linked payment/reconciliation, journal and source references on detail pages;
- organization master-data selectors instead of hard-coded demo account codes;
- simplified MVP navigation; hide project/time/forecast/overhead/integration internals from the primary menu.

Acceptance:

- sales invoice, purchase invoice, credit note and non-invoice expense can be created, edited while draft, opened by stable URL and found after refresh;
- Paperless link opens the canonical remote record;
- API failure remains visible and never becomes simulated success;
- desktop and 390px mobile journeys pass without document overflow.

### ERP-730 — MVP reports and clean-install setup

Deliverables:

- minimal TT133 seed/setup for accounts, tax codes, categories and statement mapping;
- remove/report any remaining hard-coded demo assumptions;
- verify existing revenue, expense, profit, direct Cash Flow, VAT, paid/unpaid, MoM/YoY and monthly target reports against one exact cutoff;
- keep project profitability only when a project mapping exists;
- simplify dashboard to the MVP KPIs; no new formulas.

Acceptance:

- fresh database seed can create invoice/expense and load all MVP reports without `REPORT_MAPPING_NOT_FOUND`;
- report totals tie to posted journals and golden fixtures;
- dashboard value equals its canonical report response;
- accountant CSV/XLSX export remains reproducible.

### ERP-740 — Docker release and real-data import

Deliverables:

- production API/web/worker Dockerfiles running non-root;
- Docker Compose with PostgreSQL, migrate-once, health checks and persistent volume;
- GitHub Actions on `main` publishes `main` and immutable `sha-<12>` GHCR images after checks;
- manual Compose deploy/rollback documentation using immutable SHA tags;
- inventory and versioned import mapping for the two supplied XLSX workbooks;
- dry-run with row-level errors, explicit commit, idempotent retry and reconciliation report.

Acceptance:

- clean checkout builds images and a fresh Compose stack becomes healthy;
- restart preserves database data;
- exact main SHA image is pullable and OCI revision matches the commit;
- dry-run performs zero mutations;
- committed import reconciles every sheet/row and annual revenue/expense/profit controls;
- local release smoke covers invoice CRUD, report and export.

## 5. Gate

Gate G7/MVP is complete only when ERP-710 through ERP-740 are done with evidence and exact-commit CI. Enterprise work outside these four tasks is not registered in the active ledger and requires explicit owner reactivation.

### Owner-reactivated extension

ERP-800/G8 retains every supplied workbook row as organization-scoped review evidence, supports
safe correction through application services, and exposes explicitly non-canonical source controls
for dashboard/report review. It does not authorize guessed postings or bypass reversal, audit,
idempotency, organization scope or accounting reconciliation.

## 6. Cost-control execution

- Prepare one bounded task packet per implementation agent with explicit files and acceptance commands.
- Delegate mechanical work to Antigravity/Gemini where available.
- Run targeted tests during development; run the complete gate once before push.
- Preserve prior completed code unless it creates a concrete MVP defect.
- Stop rather than expand scope when a request belongs to Paperless, OCR or n8n.
