# ERP-907 summary

## Outcome

ERP-907 changes solopreneur operation from "not approved, therefore absent" to "valid canonical
input is recorded immediately; incomplete classification or evidence is a local warning".

- A solopreneur owner can create a valid sales document or expense with one save-and-record
  transaction. The same transaction completes the eligible owner lifecycle steps, posts the
  accounting effect, writes audit/outbox/idempotency evidence and returns the final resource.
- The web create workspaces derive their primary action from workflow capabilities and display
  **Lưu và ghi nhận** for an eligible solopreneur owner. Controlled organizations retain the draft
  action and their existing approval separation.
- Financial statements and the operating dashboard continue to read posted/reversed journals.
  Solopreneur reports may use the latest effective mapping or policy when no approved version
  exists, while returning a local configuration warning. Controlled mode remains approved-only.
- Performance comparisons now derive actuals from canonical posted revenue, expense and banking
  sources instead of a copied planning actual-fact cache. Planning and dashboard reads therefore do
  not require a separate refresh/backfill action before newly posted activity is visible.
- Accounting expense remains part of management profit even when tax evidence or classification is
  incomplete. VAT and CIT eligibility remain independent fields and warnings; they do not erase the
  booked expense.
- Migration `0053_remove_planning_actual_fact_cache.sql` removes the stale-prone
  `planning_actual_facts` cache. It does not delete canonical documents, expenses, banking records,
  journals or journal lines.

## Main implementation surfaces

- Commercial-document and expense PostgreSQL stores and integration tests.
- Financial-statement and operating-dashboard stores and regression tests.
- Performance-comparison and planning read paths.
- Workflow capability API, CLI contract and solopreneur create-action UI policy.
- Database schema/index exports and migration 0053.

The database, API, CLI, web, documentation, lint, typecheck, test and build gates pass. The product
owner accepted the UI and requested that further manual UI testing be skipped; ERP-907 is complete.
