# ERP-1014 Risks & Follow-ups

## Remaining Risks

- None affecting ledger or financial data; `telegram_settings` and `telegram_notifications` are operational notification telemetry tables with zero schema migration required.
- Historical `failed` count for the trailing 7 days remains honestly reported in the numeric KPI (`failed`) with `Đã phục hồi` status until rows age past the 7-day window.

## Migrations

- None required.
