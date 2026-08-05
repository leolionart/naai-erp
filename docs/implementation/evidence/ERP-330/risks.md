# ERP-330 Risks and Follow-ups

- Processing is synchronous in ERP-330; PostgreSQL inbox remains the source of truth. Worker polling with leases, automatic retry scheduling and operational dead-letter handling should be hardened with ERP-340/operations work.
- The first contract signs timestamp plus exact raw body. Nonce/key-rotation support and per-source rate limiting remain security-hardening follow-ups.
- Authenticated payloads are retained in PostgreSQL JSONB; production retention/encryption policy must be configured before sensitive high-volume integrations.
- Corrected replay payloads are stored separately from immutable originals, but a richer revision list may be needed for multiple corrections.
- Crash after business commit but before inbox completion remains safe from duplicate business effects through application idempotency, but inbox/result reconciliation should be automated.
