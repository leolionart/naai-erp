# ERP-1009 — Risks & Follow-ups

## Risks

- **Frontend-only presentation change**: No database schema, API response, CLI command, or posted ledger formula was modified; rollback if ever needed is a stateless web image rollback.
- **4-column card width on desktop (`xl:grid-cols-4`)**: Addressed with CSS container queries (`@container` and `text-2xl @[250px]:text-3xl`) inside `MetricCard` so large VND amounts never wrap awkwardly on narrower desktop viewports.

## Migrations

- None required.
