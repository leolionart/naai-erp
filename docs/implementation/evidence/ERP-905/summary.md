# ERP-905 summary

Removed the obsolete workforce/time, derived project-cost, direct-cost allocation and overhead
allocation subsystems from the database schema, API, domain, contracts, CLI and web navigation.

Project profitability now reads canonical posted Expenses and posted purchase-document allocations
that carry the selected project. Unprojected Expenses remain company overhead and are excluded from
project margin. Canonical commercial documents, Expenses, posted journals, customer receipts,
freelance payables and purchase-funding behavior are unchanged.

The migration is `db/migrations/0051_remove_timesheet_workforce.sql`. No commit was created.
