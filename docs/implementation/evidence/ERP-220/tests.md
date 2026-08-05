# ERP-220 Tests

- `pnpm --filter @naai-erp/domain test` — 46 tests passed.
- API unit/contract suite — passed locally; PostgreSQL workflow cases queued for CI.
- CLI suite — 13 tests passed.
- `pnpm db:check` — migration directory valid.
- `git diff --check` — passed.

Exact-commit GitHub CI passed for `5292a3665e8da025e9b5e449a8278d3afae109ce`:

- PostgreSQL 16 empty and upgrade-path migration passed.
- Workflow policy constraints and posted immutability tests passed.
- API maker/checker denial and bounded self-approval exception passed.
- Approve → post → reverse → repost, idempotency, audit/outbox and per-account reversal net-zero passed.
- Run: https://github.com/leolionart/naai-erp/actions/runs/30988388797
