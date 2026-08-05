# ERP-200 Summary

Implemented the journal aggregate and AI-native posting surface.

- Domain aggregate uses exact `bigint` minor units, debit/credit XOR, balance validation, immutable posted state and linked reversal.
- PostgreSQL stores organization-scoped journal headers/lines, posting idempotency outcomes and transactional outbox events.
- Database triggers reject mutation of posted journal headers and lines.
- REST/OpenAPI and first-party CLI support list, get, create draft and privileged post operations.
- Posting serializes concurrent retries with a transaction-scoped advisory lock and commits state, audit, idempotency result and outbox atomically.

Start commit: `30e5cdc`.
