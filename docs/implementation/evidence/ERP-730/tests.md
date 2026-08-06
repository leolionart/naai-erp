# ERP-730 Tests

Native clean-install and runtime verification established:

- Native PostgreSQL migration journal contained all 33 expected migrations.
- TT133 setup was present for fiscal years 2025 and 2026.
- Seed execution remained explicit, organization-scoped, and idempotent.
- Profit and Loss loaded successfully and tied to the imported ledger data.
- Balance Sheet loaded successfully and passed its internal balance/tie checks for the available ledger state.
- Direct Cash Flow loaded successfully and tied to the same posted journals.
- AR aging tied to the imported sales-invoice receivable balance.
- AP aging was empty as expected because the real workbook import created non-invoice expenses and no purchase invoices.
- Report readiness did not require weakening production seed guards.

Exact-commit CI and pushed-SHA proof remain pending commit and push.
