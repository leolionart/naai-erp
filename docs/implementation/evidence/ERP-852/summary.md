# ERP-852 summary

Implemented organization-scoped expense-category funding treatment across the database, API,
expense workflow, dashboard read model, settings UI and E2E contract.

- Categories support `company_funds`, `owner_paid_company_cost` and `tax_only_non_cash`.
- Expenses snapshot the selected category and funding treatment so later category edits do not
  rewrite historical meaning.
- Owner-paid company costs reduce net company funds and increase the amount payable to the owner;
  tax-only evidence remains available to VAT/CIT reporting without reducing company cash.
- The dashboard exposes bank cash, cash on hand, owner payable, accounting profit and net company
  funds from the operating read model.
- Users can configure future category behavior under master-data settings.

Key implementation surfaces include the `0035_abandoned_tony_stark.sql` migration, expense and
master-data application services, operating-dashboard queries, shared contracts and the settings
workspace.
