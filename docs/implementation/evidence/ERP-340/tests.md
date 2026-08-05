# ERP-340 Tests

- Domain: versioned immutable event contracts, transition rules, retry schedule, dead-letter and audited replay.
- Worker unit: exact-body signature headers, success, transient retry, permanent/exhausted failure and delay cap.
- PostgreSQL worker integration: fan-out, lease, signed delivery, retry state and append-only attempt trigger.
- PostgreSQL API integration: redacted endpoint/outbox/delivery reads, endpoint creation idempotency, SSRF rejection and audited replay conflict behavior.
- API/CLI contract suites and migration consistency checks pass locally.
- Exact commit `94fb91ba4faa925a729db3862ff4aa0fc46db4b2` passed CI, including database, API and worker PostgreSQL integration suites: https://github.com/leolionart/naai-erp/actions/runs/31001442711
