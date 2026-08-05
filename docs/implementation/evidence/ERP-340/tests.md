# ERP-340 Tests

- Domain: versioned immutable event contracts, transition rules, retry schedule, dead-letter and audited replay.
- Worker unit: exact-body signature headers, success, transient retry, permanent/exhausted failure and delay cap.
- PostgreSQL worker integration: fan-out, lease, signed delivery, retry state and append-only attempt trigger.
- PostgreSQL API integration: redacted endpoint/outbox/delivery reads, endpoint creation idempotency, SSRF rejection and audited replay conflict behavior.
- API/CLI contract suites and migration consistency checks pass locally; exact-commit PostgreSQL CI is pending.
