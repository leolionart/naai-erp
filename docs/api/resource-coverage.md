# REST API and CRUD Coverage

This document is the human-readable inventory of NAAI ERP v1 endpoints. The authoritative
machine-readable contract is [`openapi-v1.json`](./openapi-v1.json), served at
`GET /api/v1/openapi.json`. Runtime discovery is available at `GET /api/v1/capabilities`.

## Conventions

- Base path: `/api/v1`.
- Organization-scoped paths start with `/organizations/{organizationId}`.
- Organization endpoints require bearer authentication. Mutations also use `Idempotency-Key`,
  `X-Correlation-Id`, and optimistic version headers where the resource is versioned.
- `C`, `R`, `U`, and `D` mean create, read, update, and hard delete.
- `A` means a named lifecycle action such as approve, post, reverse, deactivate, close, or replay.
- `—` does not automatically mean a product defect. Posted journals, issued documents, financial
  history, and referenced master data intentionally use reversal, cancellation, or deactivation
  instead of destructive delete.

## Coverage matrix

| Resource family              | Endpoint root                                                               |  C  |  R  |  U  |  D  | Lifecycle / special operations                               |                     First-party CLI                     |
| ---------------------------- | --------------------------------------------------------------------------- | :-: | :-: | :-: | :-: | ------------------------------------------------------------ | :-----------------------------------------------------: |
| API discovery                | `/api/v1/openapi.json`, `/api/v1/capabilities`                              |  —  |  ✓  |  —  |  —  | Contract and capability discovery                            |                            ✓                            |
| Master-data registry         | `/organizations/{organizationId}/master-data/resources`                     |  —  |  ✓  |  —  |  —  | Lists supported generic resources                            |                            ✓                            |
| Generic master data          | `/organizations/{organizationId}/master-data/{resource}`                    |  ✓  |  ✓  |  ✓  |  —  | deactivate, dry-run import, export                           |                            ✓                            |
| Journals                     | `/organizations/{organizationId}/journals`                                  |  ✓  |  ✓  |  —  |  —  | approve, post, reverse, repost                               |                            ✓                            |
| Posting rules                | `/organizations/{organizationId}/posting-rules`                             |  —  |  —  |  —  |  —  | evaluate                                                     |                            ✓                            |
| Fiscal periods               | `/organizations/{organizationId}/fiscal-periods`                            |  —  |  —  |  —  |  —  | close, reopen                                                |                            ✓                            |
| Opening balances             | `/organizations/{organizationId}/opening-balances`                          |  ✓  |  ✓  |  —  |  —  | dry-run                                                      |                            ✓                            |
| Commercial documents         | `/organizations/{organizationId}/commercial-documents`                      |  ✓  |  ✓  |  ✓  |  —  | capture, validate, verify, approve, issue, post, cancel      |                            ✓                            |
| Expenses                     | `/organizations/{organizationId}/expenses`                                  |  ✓  |  ✓  |  ✓  |  —  | submit, evidence pending, review, approve, reject, post      |                            ✓                            |
| Evidence                     | `/organizations/{organizationId}/evidence`                                  |  ✓  |  ✓  |  —  |  —  | review, signed download URL                                  |                            ✓                            |
| Inbound webhook              | `/api/v1/inbound/{sourcePublicId}/events`                                   |  ✓  |  —  |  —  |  —  | Signed idempotent event intake                               |                        API only                         |
| Inbound event admin          | `/organizations/{organizationId}/inbound-events`                            |  —  |  ✓  |  —  |  —  | Quarantine/readback                                          |                            ✓                            |
| Outbound endpoints           | `/organizations/{organizationId}/outbound-events/endpoints`                 |  ✓  |  ✓  |  ✓  |  —  | Endpoint configuration                                       |                            ✓                            |
| Outbox and deliveries        | `/organizations/{organizationId}/outbound-events/outbox`, `/deliveries`     |  —  |  ✓  |  —  |  —  | replay                                                       |                            ✓                            |
| Bank accounts                | `/organizations/{organizationId}/banking/accounts`                          |  ✓  |  ✓  | gap |  —  | deactivate                                                   | CLI update currently targets an unimplemented API route |
| Bank imports                 | `/organizations/{organizationId}/banking/imports`                           |  ✓  |  ✓  |  —  |  —  | dry-run                                                      |                            ✓                            |
| Bank transactions            | `/organizations/{organizationId}/banking/transactions`                      |  —  |  ✓  |  —  |  —  | suggest, match, reconcile, unreconcile, ignore, needs-review |                            ✓                            |
| Reconciliations              | `/organizations/{organizationId}/banking/reconciliations`                   |  —  |  ✓  |  —  |  —  | Read model                                                   |                            ✓                            |
| Internal transfers           | `/organizations/{organizationId}/banking/internal-transfers`                |  ✓  |  ✓  |  —  |  —  | match, unmatch                                               |                            ✓                            |
| Statement sessions           | `/organizations/{organizationId}/banking/statement-sessions`                |  ✓  |  ✓  |  —  |  —  | review, close, exception resolution                          |                            ✓                            |
| Workers                      | `/organizations/{organizationId}/time/workers`                              |  ✓  |  ✓  |  —  |  —  | No update/deactivate REST operation yet                      |                         Partial                         |
| Timesheets                   | `/organizations/{organizationId}/time/timesheets`                           |  ✓  |  ✓  |  —  |  —  | submit, approve, reject, revise, lock, bill, adjustments     |                            ✓                            |
| Cost rates                   | `/organizations/{organizationId}/time/cost-rates`                           |  ✓  |  ✓  |  —  |  —  | approve, retire                                              |                            ✓                            |
| Capacity versions            | `/organizations/{organizationId}/time/capacity-versions`                    |  ✓  |  ✓  |  —  |  —  | Capacity summary read model                                  |                            ✓                            |
| Project costs                | `/organizations/{organizationId}/project-costs`                             |  —  |  ✓  |  —  |  —  | Unallocated-source query                                     |                            ✓                            |
| Direct-cost allocations      | `/organizations/{organizationId}/direct-cost-allocations`                   |  ✓  |  ✓  |  —  |  —  | submit, approve, post, reverse                               |                            ✓                            |
| Project budgets              | `/organizations/{organizationId}/project-budgets`                           |  ✓  |  ✓  |  —  |  —  | submit, approve, reject                                      |                            ✓                            |
| Scope changes                | `/organizations/{organizationId}/scope-changes`                             |  ✓  |  ✓  |  —  |  —  | submit, approve, reject                                      |                            ✓                            |
| Recognition policies         | `/organizations/{organizationId}/recognition-policies`                      |  ✓  |  ✓  |  —  |  —  | approve, retire                                              |                            ✓                            |
| Milestone acceptances        | `/organizations/{organizationId}/milestone-acceptances`                     |  ✓  |  ✓  |  —  |  —  | accept, dispute, reject                                      |                            ✓                            |
| Revenue recognition events   | `/organizations/{organizationId}/revenue-recognition-events`                |  ✓  |  ✓  |  —  |  —  | submit, approve, post, reverse                               |                            ✓                            |
| Overhead policies            | `/organizations/{organizationId}/overhead-allocation-policies`              |  ✓  |  ✓  |  —  |  —  | submit, approve, reject                                      |                            ✓                            |
| Overhead source pools        | `/organizations/{organizationId}/overhead-source-pools`                     |  ✓  |  ✓  |  —  |  —  | —                                                            |                            ✓                            |
| Overhead runs                | `/organizations/{organizationId}/overhead-allocation-runs`                  |  ✓  |  ✓  |  —  |  —  | submit, approve, post, reverse                               |                            ✓                            |
| Revenue targets              | `/organizations/{organizationId}/revenue-targets`                           |  ✓  |  ✓  |  —  |  —  | publish, supersede                                           |                            ✓                            |
| Forecast versions            | `/organizations/{organizationId}/forecast-versions`                         |  ✓  |  ✓  |  —  |  —  | publish, supersede                                           |                            ✓                            |
| Forecast components          | `/organizations/{organizationId}/forecast-versions/{forecastId}/components` |  ✓  |  ✓  |  ✓  |  ✓  | review, exclude                                              |                            ✓                            |
| Planning actual facts        | `/organizations/{organizationId}/planning-actual-facts`                     |  —  |  ✓  |  —  |  —  | backfill, date-range summary                                 |                            ✓                            |
| Financial-statement mappings | `/organizations/{organizationId}/financial-statement-mappings`              |  ✓  |  ✓  |  —  |  —  | approve version                                              |                            ✓                            |
| Executive metric policies    | `/organizations/{organizationId}/executive-metric-policies`                 |  ✓  |  ✓  |  —  |  —  | approve version                                              |                            ✓                            |
| ROI definitions              | `/organizations/{organizationId}/roi-definitions`                           |  ✓  |  ✓  |  —  |  —  | approve version                                              |                            ✓                            |
| ROI input facts              | `/organizations/{organizationId}/roi-input-facts`                           |  ✓  |  ✓  |  —  |  —  | review                                                       |                            ✓                            |
| Report snapshots             | `/organizations/{organizationId}/report-snapshots`                          |  ✓  |  ✓  |  —  |  —  | reproduce exact version                                      |                            ✓                            |
| Accountant exports           | `/organizations/{organizationId}/accountant-exports`                        |  ✓  |  ✓  |  —  |  —  | download, supersede                                          |                            ✓                            |
| Workbook imports             | `/organizations/{organizationId}/workbook-imports`                          |  —  |  —  |  —  |  —  | dry-run, commit                                              |                            ✓                            |
| Workbook review rows         | `/organizations/{organizationId}/workbook-imports/review-rows`              |  —  |  ✓  |  ✓  |  —  | Versioned audited correction                                 |                            ✓                            |

## Read-only reports

All report endpoints are organization-scoped `GET` operations. Summary report routes are available
through the CLI; the aging party/item drill-down exception is recorded under known parity gaps.

| Report                                         | Endpoint                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Trial Balance                                  | `/reports/trial-balance`                                             |
| General Ledger                                 | `/reports/general-ledger`                                            |
| AR/AP aging and drill-down                     | `/reports/ar-aging`, `/reports/ap-aging`                             |
| Project profitability                          | `/reports/project-profitability`                                     |
| Profit and Loss                                | `/reports/financial-statements/profit-and-loss`                      |
| Balance Sheet                                  | `/reports/financial-statements/balance-sheet`                        |
| Cash Flow                                      | `/reports/financial-statements/cash-flow`                            |
| Financial statement drill-down/source resolver | `/reports/financial-statements/drilldown`, `/source-resolver`        |
| VAT reconciliation and expense exceptions      | `/reports/tax/vat-reconciliation`, `/reports/tax/expense-exceptions` |
| Performance comparisons                        | `/reports/performance-comparisons`                                   |
| Executive metrics                              | `/reports/executive-metrics`                                         |
| Operating dashboard                            | `/reports/operating-dashboard`                                       |

## Generic master-data resources

The generic master-data CRUD family currently covers:

`organizations`, `fiscal-years`, `fiscal-periods`, `exchange-rates`, `accounts`,
`statutory-mappings`, `tax-code-versions`, `dimensions`, `dimension-requirements`,
`default-mappings`, `parties`, `party-roles`, `projects`, `contracts`, `milestones`,
`posting-rule-versions`, and `accounting-workflow-policy`.

Use these operation shapes:

```text
GET    /master-data/{resource}
GET    /master-data/{resource}/{key}
POST   /master-data/{resource}
PATCH  /master-data/{resource}/{key}
POST   /master-data/{resource}/{key}/deactivate
POST   /master-data/{resource}/import/dry-run
GET    /master-data/{resource}/export
```

## Known parity gaps

The audit on 2026-08-07 found these gaps. They must not be treated as working endpoints until their
own task and acceptance evidence are complete.

1. `PATCH /banking/accounts/{accountId}` exists in OpenAPI and is targeted by the CLI, but the API
   controller does not implement it.
2. Aging party/item drill-down endpoints exist in REST/OpenAPI, but the CLI does not yet expose a
   correct dedicated route for them.
3. The CLI contains a worker-deactivation path, while REST/OpenAPI expose only worker list/create.
4. Several post-MVP draft/config resources support create/read plus lifecycle actions but do not yet
   provide a general update operation. A dedicated CRUD-parity task is required; they must not be
   added inside ERP-800 without ledger scope and rule/test mappings.

## Deletion policy

Hard delete is deliberately rare. Use:

- `deactivate` for referenced master data and bank accounts;
- `cancel` for eligible unissued commercial documents;
- `reverse` for posted accounting effects;
- version supersession or retirement for policies, forecasts, snapshots, and exports.

Forecast components are currently the only resource family with an explicit hard-delete operation,
and that operation remains subject to forecast state rules.
