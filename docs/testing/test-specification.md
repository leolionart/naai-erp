# NAAI ERP Executable Test Specification

This document defines how business rules become repeatable automated proof. Tests are gate artifacts, not optional implementation detail.

## 1. Stable IDs and traceability

- Business rule: `BR-<MODULE>-NNN`.
- Test: `T-<LAYER>-<ERP-TASK>-NNN` for new catalog entries; short aliases in the task ledger remain valid.
- Golden fixture: `GF-<DOMAIN>-NNN`.
- Regression: `REG-YYYY-NNN`.

Each test catalog record must include:

```yaml
id: T-PROP-ERP-200-001
task: ERP-200
rules: [BR-LED-001]
title: Every posted journal balances
layer: property
fixture: GF-LEDGER-001
oracle: beancount
command: pnpm test:property --filter T-PROP-ERP-200-001
blocking_gate: G2
evidence: [junit, coverage, property-seed]
```

A task cannot be `done` until every mapped rule has positive, negative and relevant boundary tests, commands are independently rerunnable and evidence is stored.

## 2. Test layers

### Unit

- Domain formulas, value objects, state machines and policy selection.
- No network or shared database.
- Deterministic clock, UUID and exchange-rate inputs.

### Property-based

Mandatory properties:

- Posted debit equals credit.
- Reversal plus original nets to zero.
- Posted journal is immutable.
- Allocation sums to source total.
- Draft/rejected documents cannot post.
- Closed periods reject ordinary posting.
- Same idempotency key/payload has one effect.
- Webhook replay never increases ledger/report totals.
- AR/AP control accounts tie to subledgers.
- Reconciliation cannot overallocate.
- Internal transfer never changes P&L.
- Recognized, invoiced and collected remain independent.
- Project allocations sum to sources.
- Report drill-down sums to the summary.
- Cross-organization query returns no foreign data.
- Fiscal/timezone boundaries map to the correct period.
- Export/import round trip preserves amounts and dimensions.

Property failures save random seed and minimized counterexample.

### Integration

- PostgreSQL constraints, isolation and transactional posting/outbox.
- Redis retry/dead-letter behavior.
- Object storage checksum and authorization.
- Empty and populated database migrations.
- Crash/failure between posting and event dispatch.

### Contract

- OpenAPI lint and examples.
- Inbound/outbound webhook JSON Schema.
- N/N-1 schema compatibility where promised.
- Signature, replay window, retry and idempotency semantics.

### E2E

Required journeys:

1. Sales invoice → approve → post → partial/full payment → reconcile → reports.
2. Purchase invoice → VAT review → payment → AP aging.
3. Expense without invoice → approve → book → tax-ineligible report.
4. Credit/reversal → period close → approved reopen.
5. Milestone + timesheet + vendor cost → recognition → project margin.
6. Base/best/worst forecast → target → MoM/YoY.
7. Contribution + annual loss → retained earnings → equity consumed → runway.

### Security

- RBAC deny matrix and maker/checker segregation.
- Cross-org IDOR.
- Webhook tampering/replay.
- CSV formula injection, MIME spoofing, path traversal.
- SQL injection, XSS, SSRF and rate limits where applicable.
- Secret/dependency/container scans.
- Append-only audit and evidence access.

### Migration, Compose and release

- Migrate empty and production-like populated DB.
- Verify expand/contract compatibility.
- Backup → destroy → restore → financial checksum reconciliation.
- `docker compose config` and clean-host startup.
- Migration service is safe to rerun at orchestration level.
- Service restarts and dependency outage/recovery.
- Containers run non-root and shut down gracefully.
- GHCR digest, immutable tags, OCI labels, SBOM, provenance and signature readback.
- Deploy by digest, smoke test and rollback rehearsal.

## 3. Golden fixture catalog

Every fixture is immutable and reviewed before changes:

- `GF-LEDGER-001`: capital contribution 500,000,000.
- `GF-SALES-001`: service invoice 110,000,000 including VAT 10%, unpaid.
- `GF-SALES-002`: partial/overpayment, credit note and refund.
- `GF-PURCHASE-001`: eligible input VAT purchase invoice.
- `GF-EXPENSE-001`: booked no-invoice expense, tax ineligible.
- `GF-EXPENSE-002`: multi-project allocation.
- `GF-BANK-001`: bank fee, partial and many-to-one match.
- `GF-TRANSFER-001`: internal transfer without P&L impact.
- `GF-PROJECT-001`: milestone, labor, freelancer and overhead.
- `GF-FORECAST-001`: actual + committed + weighted pipeline scenarios.
- `GF-EQUITY-001`: two loss years, added capital and withdrawal.
- `GF-FX-001`: foreign invoice/payment and realized FX.
- `GF-PERIOD-001`: lock, rejected late posting, reopen and reversal.
- `GF-YEAR-END-001`: close/open and retained earnings.
- `GF-VAT-001`: input/output, ineligible evidence and rounding.
- `GF-MULTIORG-001`: duplicated references across isolated organizations.

Fixture layout:

```text
tests/fixtures/golden/<fixture-id>/
  input.json
  expected-journals.csv
  expected-trial-balance.csv
  expected-pnl.csv
  expected-balance-sheet.csv
  expected-cash-flow.csv
  expected-project-margin.csv
  expected-tax-view.csv
  oracle.beancount
  README.md
```

Use exact decimal/minor units, timezone `Asia/Ho_Chi_Minh`, fixed fiscal calendar and explicit rounding policy.

## 4. Independent oracle policy

- Ledger/statements: Beancount or independently maintained accountant-approved fixture.
- KPI formulas: reviewed spreadsheet/reference calculation.
- API/webhook: OpenAPI/JSON Schema.
- Migration: pre/post snapshots and reconciliation SQL.
- UI: compare read model/API to ledger, not only screenshots.
- Release: image digest, labels, SBOM, provenance and runtime readback.

Do not generate expected results with production code. Do not update golden output just to make a test pass. Golden changes require explicit review and a documented reason.

## 5. Test data

- Synthetic/anonymized data only.
- Deterministic factories and fixed seeds.
- Small PR, medium nightly and large performance datasets.
- Include month/quarter/year ends, leap day and timezone midnight.
- Include zero, negative where legal, very large, rounding and currency boundaries.
- Include concurrent duplicate webhook/post/reconcile attempts.
- Import fixtures include valid, malformed, duplicate and partial failure rows.

## 6. Blocking gates

### Pull request

- Format/lint/typecheck/unit/contract.
- Changed business rules have mapped tests.
- Domain/accounting branch coverage target ≥ 90%; repository ≥ 80% after foundation supports measurement.
- Accounting-kernel mutation score target ≥ 80%.
- No unapproved Critical/High security finding.
- Migration and Compose smoke green once available.

### Nightly

- Full integration, E2E and property suites.
- At least 10,000 generated property cases for ledger/idempotency after G2.
- Zero unexplained golden reconciliation variance.
- Backup/restore and selected failure injection.
- Performance and accessibility suites after G7.
- Retry-pass is recorded as flaky and remains actionable.

### Release

- Required gates green on the exact commit/image digest.
- Zero orphan rules/tests.
- Golden statements match.
- Clean-host Compose deploy and rollback pass.

## 7. Evidence contract

Each run creates:

```text
artifacts/runs/<timestamp>-<sha>/
  manifest.json
  summary.md
  junit/
  coverage/
  reconciliation/
  screenshots/
  logs/
  migrations/
  compose/
  security/
  property-seeds/
  failed-task.md
```

`manifest.json` records commit SHA, image digest if any, DB migration version, fixture version, commands, environment and result.

Task evidence under `docs/implementation/evidence/<task-id>/` links or summarizes the immutable run artifact.

## 8. Gate traceability

- G1: organization, fiscal, account/tax/dimension mapping.
- G2: ledger properties, concurrency, workflows, close/reopen and golden statements.
- G3: invoice/expense/evidence/webhook lifecycle and replay.
- G4: banking, reconciliation, transfer and aging tie-out.
- G5: rates, time, costs, recognition, allocations and project margin.
- G6: forecast, comparisons, statements, equity and reproducible exports.
- G7: E2E UX, accessibility, security, performance and restore.
- G8: images, Compose, CI/release, migrations, backup and rollback.
- G9: imports, parallel reconciliation, cutover and production smoke.

No gate passes with unexplained variance, missing evidence or an orphan rule.

