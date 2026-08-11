# ERP-905 acceptance

- Obsolete workforce, timesheet, labor-rate and capacity tables/enums are removed from the current
  schema and explicitly dropped by migration 0051.
- Derived project-cost queues, direct-cost allocations and overhead policy/pool/run tables/enums are
  removed from the current schema and runtime contracts.
- REST discovery, OpenAPI, CLI and web navigation no longer advertise the removed resources.
- Project profitability includes posted projected Expenses and posted projected purchase allocations
  once, excludes drafts and unprojected company overhead, and retains canonical revenue/AR/budget
  measures.
- Migration SQL contains no cascade and no mutation of journal, Expense or commercial-document
  tables.
- Customer receipts, project freelance payables and purchase-invoice funding declarations remain in
  the database and application modules.

- Migration 0051 applied successfully to the populated `naai_erp_demo` database and to a newly
  created empty database. The populated database retained canonical Expense, commercial-document,
  journal, customer-receipt and freelance-payable tables after all 15 obsolete tables were removed.
- The PostgreSQL profitability integration proves that only posted projected canonical sources are
  counted, while drafts and unprojected company overhead are excluded.
- The repository-wide `pnpm check` gate passed after formatting, lint, typecheck, documentation,
  security, fixtures, native database, unit tests and production builds.
