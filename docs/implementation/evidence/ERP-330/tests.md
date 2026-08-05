# ERP-330 Tests

- Domain tests cover timestamp boundaries, explicit schema/event versions, unsafe keys and bounded exponential backoff.
- PostgreSQL API integration covers a valid signed expense event, exact retry, changed-payload conflict, bad signature, stale timestamp and authenticated quarantine with zero business effect.
- CLI contract covers organization-scoped inbox list/read and privileged replay routing.
- Migration adds organization/source idempotency, external-ID uniqueness, immutable raw fields and append-only attempts.

Exact-commit PostgreSQL CI passed at https://github.com/leolionart/naai-erp/actions/runs/30997337079:

- `pnpm check`
- `pnpm db:check`
- empty-database migrations
- database tests
- API tests including 20 PostgreSQL integration tests
