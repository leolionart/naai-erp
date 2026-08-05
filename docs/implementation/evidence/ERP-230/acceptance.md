# ERP-230 Acceptance

- Open/soft/hard state machine: implemented and unit tested.
- Close/reopen reason, permission, actor and append-only events: implemented.
- Reopen restricted to owner/finance-admin roles: implemented.
- Soft-lock role configuration and hard-lock absolute denial: implemented.
- Posting/backdate/reversal enforcement by organization and date: implemented.
- Direct state mutation and overlapping periods: blocked in PostgreSQL.
- AI-native API/CLI: OpenAPI workflow paths and JSON-first CLI routing implemented.

Final acceptance remains pending exact-commit PostgreSQL CI.
