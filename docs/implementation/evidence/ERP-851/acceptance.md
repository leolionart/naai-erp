# ERP-851 acceptance

- Full pre-reset backup created and checksum verified: passed.
- Local reset unavailable in production or through non-loopback host: passed.
- Exact organization/package/checksum/idempotency guards: passed.
- Reset rollback on an injected mid-transaction failure: passed.
- Organization identity, credentials, backup and baseline configuration preservation: passed in integration test.
- Four source workbooks inventoried and normalized without modifying source files: passed.
- Exact duplicate purchase rows removed and invoice-backed expenses de-duplicated: passed.
- Workbook formulas, typed values and visual render verified: passed.
- Accountant-maintained VAT schedule inventoried and reconciled to staging: passed.
- Separate sales and purchase/expense exports match the accountant schedule structure while retaining canonical raw sheets: passed.
- Review queue resolved with auditable dispositions: passed, zero open items.
- Broken source headers and buyer conflict retained as explicit non-posting exceptions: passed, 9 exceptions.
- Live local reset and canonical draft import: passed; corrected package committed 343/343 rows and
  the commit replay was idempotent.
- Final staging SHA converted deterministically to Portable Data Package v1: passed.
- Detached external package registration and safe canonical dry-run: passed, 110/110 rows ready and
  zero party/project mutations.
- Conservative draft-financial package dry-run: passed, 343/343 rows ready with VAT remaining
  unreviewed and no ledger mutation.
- Post-import imported-scope readback: passed for counts, totals, preserved configuration, demo-row
  removal, duplicate-reference checks and posted-journal balance.
- Complete real financial position: not yet accepted because revenue/receipt activities,
  bank/opening balances and lifecycle posting are not represented in the verified package.
- Owner-confirmed conservative official recognition of imported purchases/expenses: passed;
  233/233 records posted and every generated journal balances.
- Owner-authorized completeness-first inferred sales mapping: passed; 8 official sales invoices
  issued and all 45 supplied revenue/receipt movements imported for reconciliation.
- Funding-source balance presentation: passed; owner-paid and AP-backed costs remain visible without
  being presented as reductions to company bank/cash, and tax eligibility stays a separate axis.
