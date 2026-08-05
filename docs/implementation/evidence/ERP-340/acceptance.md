# ERP-340 Acceptance

- [x] Business mutations continue to create outbox rows atomically in their existing transactions.
- [x] Versioned event envelope and exact raw-body HMAC delivery are implemented.
- [x] Active subscriptions fan out once per event/endpoint with unique constraints.
- [x] Leases use SKIP LOCKED and expired leases recover with attempt evidence.
- [x] Retry/backoff, permanent failure and dead-letter transitions are deterministic.
- [x] Delivery attempts are append-only and secrets/full sensitive responses are not returned.
- [x] Endpoint configuration and manual replay enforce organization RBAC, idempotency and audit.
- [x] Exact-commit PostgreSQL CI passes.
