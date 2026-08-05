# ERP-430 summary

- Task: ERP-430 — AR/AP aging
- Start commit: `621ccebc0d120acbc3cecf5ae52a1f0ff46fc6ef`
- Rules: BR-AR-002, BR-AP-002
- Tests: T-AR-002, T-AP-002

Implemented from posted ledger effects through an explicit `asOf` date, not from current document state or matched reservations. AR and AP are separate report/read models with per-currency buckets, separate credit/advance balances and control-account tie-out.

The read model applies source, allocation and reversal journal dates historically; returns missing-due-date, unsupported-FX and control-variance exceptions explicitly; and keeps deterministic source/journal/reconciliation/evidence drill-down identifiers.

Human UI uses separate receivable/payable queues and dedicated counterparty detail routes. Headless access is discoverable through OpenAPI, capabilities and CLI without visible AI controls or branding.
