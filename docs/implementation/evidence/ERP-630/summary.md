# ERP-630 summary

- Task: ERP-630 — Financial statements and tax reconciliation
- Gate: G6 — Planning and management reporting
- Status: implementation complete and locally verified; exact-commit PostgreSQL CI pending

ERP-630 derives an accrual-management P&L, Balance Sheet, direct Cash Flow, VAT reconciliation and tax-expense exception view from one organization-scoped ledger cutoff. Statement mappings and reconciliation policies are explicit and versioned; unmapped or unreconciled amounts remain visible and can block readiness instead of being silently guessed.

The Balance Sheet must satisfy `Assets = Liabilities + Equity`, direct Cash Flow must satisfy `opening cash + net movement = closing cash`, and all statement totals must tie to the same posted-ledger source set. VAT output, input, eligible input, ineligible input and review exceptions remain distinct.

The admin UI uses a report landing page plus dedicated statement pages. Filters use a Sheet, source tracing uses a Drawer, and invalid/tie-failure states use blocking Alerts. No AI surface is visible; the same REST/OpenAPI/CLI contracts remain discoverable for machine clients.

`GF-FINANCIAL-001` independently verifies P&L, Balance Sheet and direct Cash Flow, while `GF-VAT-001` verifies VAT partitions and independent management/CIT/VAT tax axes without importing production code. The integrated worktree passes repository quality/build checks, all 32 migration-journal entries, all golden fixtures and 47/47 desktop/mobile Playwright journeys.
