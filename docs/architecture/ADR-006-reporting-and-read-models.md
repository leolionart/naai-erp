# ADR-006: Reporting and Read Models

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002
- Rules: BR-RPT-001, BR-RPT-002, BR-RPT-003, BR-RPT-004, BR-SNP-001

## Context

Operational models and financial reports have different query shapes. Dashboard speed must not create a second financial truth.

## Decision

- Posted ledger remains the financial source of truth.
- Synchronous core reports may query ledger/subledger views.
- Materialized/read models may accelerate dashboards but record source cutoff/version and are rebuildable.
- Report snapshots store organization, period, dimensions, accounting basis, formula versions and ledger cutoff.
- Every aggregate drills down to read-model rows, journal lines and source documents.
- Balance Sheet validation fails loudly if Assets != Liabilities + Equity.
- Recognized, invoiced and collected values are labeled separately.
- Metabase may consume curated read models but does not own formulas or write transactions.

## Consequences

- Dashboard-only formulas are forbidden.
- Read-model lag and unresolved-data confidence indicators are visible.
- Snapshot/golden tests prove reproducibility.

