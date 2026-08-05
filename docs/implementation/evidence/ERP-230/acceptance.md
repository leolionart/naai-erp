# ERP-230 Acceptance

- Open/soft/hard state machine: implemented and unit tested.
- Close/reopen reason, permission, actor and append-only events: implemented.
- Reopen restricted to owner/finance-admin roles: implemented.
- Soft-lock role configuration and hard-lock absolute denial: implemented.
- Posting/backdate/reversal enforcement by organization and date: implemented.
- Direct state mutation and overlapping periods: blocked in PostgreSQL.
- AI-native API/CLI: OpenAPI workflow paths and JSON-first CLI routing implemented.

Final acceptance passed on implementation commit `e42ace6cea02534f6580e372a38990bedeb03a31`.

- GitHub CI: https://github.com/leolionart/naai-erp/actions/runs/30989144652
- Result: all quality, migration, database and API jobs passed.
