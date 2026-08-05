# ERP-340 Summary

Implemented versioned outbound webhook delivery on top of the existing transactional outbox.

- Active endpoint subscriptions store only runtime secret references and versioned retry policy.
- Worker transactionally materializes outbox deliveries, uses PostgreSQL SKIP LOCKED leases and sends exact JSON envelopes with HMAC-SHA256 signatures.
- HTTP/network failures use deterministic bounded exponential backoff; exhausted or permanent failures enter dead-letter.
- Delivery attempts are append-only and retain redacted HTTP/error evidence.
- Organization-scoped REST/OpenAPI and CLI expose endpoint configuration, outbox/delivery inspection and audited idempotent replay.
- Private/localhost endpoint targets are rejected at the API boundary to reduce SSRF exposure.
