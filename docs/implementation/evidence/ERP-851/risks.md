# ERP-851 risks and required decisions

The original cutover audit found 150 explicit source-review items:

- 96 purchase-invoice lines cannot be allocated from the source without inventing a proportional split. 175/271 lines were resolved only where quantity x unit price, tax rate, single-line totals or exact unit-price-as-line-net rules reconciled.
- 41 revenue rows indicate an invoice but contain no sales-invoice number. They must not be imported as issued invoices without the real number.
- 7 records lack a deterministic customer relationship.
- 6 project rows have ambiguous duplicate names and no SourceID.

Two purchase-invoice headers are internally inconsistent and require source/accountant correction:

- `1C25TMB`, 2025-08-26, VEXERE: net + VAT differs from gross by -238,000 VND.
- `1C25MTH`, 2025-08-22, DUONG NAM THANH: net + VAT differs from gross by +7,743,333 VND.

These items now have explicit dispositions and the open review count is zero. The local demo
business rows were reset and the verified draft package was imported, while excluded source classes
remain outside canonical financial reporting.

The 2026 accountant schedule reduced the backlog with authoritative invoice evidence. Remaining
items may be accepted through explicit header-level invoice lines, management-revenue/receipt
classification and source-row-specific project identities, but these dispositions must remain
visible in the staging workbook and must not fabricate a tax invoice identity.

The safe converter excludes all financial resources. The mapping-backed draft package now includes
121 purchase invoices and 112 expenses without claiming VAT eligibility or posting ledger effects.
It excludes 2 broken purchase headers, 4 incomplete/zero-identity purchase headers, 14 zero-value
expenses, 1 unknown-funding expense, 9 explicit source exceptions and all 45 revenue/receipt
activities. The imported purchase invoices and expenses are now posted. Revenue/receipt
reconciliation, real bank statements/opening cash and bank balances and final report reconciliation
remain required before the dashboard is the complete real financial position.

Nine source projects had no external customer by explicit source disposition. Canonical projects
require a client party, so they use the existing NAAI STUDIO party as an internal management bucket,
not as an inferred external customer. Project ownership uses the retained local owner identity;
these mappings must be reviewed if production organization/user IDs differ.

The eight official sales invoices initially lacked project/client and signed-contract capacity.
Current source matching still includes one buyer/payment conflict and several inferred commercial
relationships; those mappings must remain visibly marked for later correction.

The owner later accepted inference to prioritize completeness. The inferred parties/projects/
contracts and the dedicated inferred bank account are explicitly labelled and auditable. The 45 bank
movements are imported but not automatically reconciled or posted as revenue: investment returns,
owner movements, tiny unidentified credits and the conflicting VIOD/OCD receipt still require later
correction. No opening balance was invented, so the inferred account transaction total is not a
current bank balance.

The retained 2024 payroll rows are estimates, not source-confirmed transactions. They must stay draft,
must not affect official ledger/tax reports and must be replaced or corrected when actual payroll or
personal-account transfer evidence becomes available.

Payroll amounts of 1,000,000 and 5,000,000 VND remain unassigned bonuses because the supplied owner
clarification only identifies the recurring 10m/3m/2m recipients.
