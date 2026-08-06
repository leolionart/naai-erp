# ERP-650 summary

- Task: ERP-650 — Accountant export and report snapshots
- Gate: G6 — Planning and management reporting
- Status: implemented locally; exact-commit CI pending

ERP-650 captures append-only, versioned report snapshots for P&L, Balance Sheet, direct Cash Flow, VAT reconciliation and tax-expense review. Each snapshot preserves its canonical request/result, formula and mapping versions, ledger cutoff, source manifest, unresolved items and deterministic hashes. Reproduction reruns the stored request and reports request/result/hash agreement without mutating the captured record.

Accountant exports render CSV and XLSX from one neutral workbook model with Summary, Report, Mapping, Unresolved and Source sections. Review-required snapshots may be exported but are always labelled non-final. Export bytes, content hash, size, media type and filename are retained; generated exports can only move to the audited `superseded` state and remain downloadable.

The REST API, canonical OpenAPI document, capability discovery and first-party CLI expose list/get/create/reproduce/download/supersede workflows. The admin UI provides dedicated list, create, export-detail and snapshot-detail pages, URL-backed Sheet filters, confirmation Dialogs, source/readiness Drawers, explicit non-final Alerts and responsive desktop/mobile journeys.

`GF-EXPORT-001` independently verifies canonical snapshot hashes, readiness, workbook structure and reproduction. The integrated local worktree passes all 34 migration-journal entries, all golden fixtures, the focused PostgreSQL 16 ERP-650 suite and 55/55 desktop/mobile Playwright journeys.
