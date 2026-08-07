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
