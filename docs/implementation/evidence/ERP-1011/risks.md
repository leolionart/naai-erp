# ERP-1011 — Risks & Follow-ups

## Risks

- Live lookup errors in `ExpenseOverviewChart` and `FilterPopover` degrade gracefully (`Promise.allSettled`) to static defaults so isolated unit/E2E environments without mocked category endpoints remain unaffected.

## Migrations

- None required.
