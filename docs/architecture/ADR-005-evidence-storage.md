# ADR-005: Evidence and Object Storage

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002
- Rules: BR-EVD-001, BR-EVD-002, BR-SEC-002

## Context

Invoices, XML, receipts, contracts and acceptance evidence may contain sensitive financial information and must remain traceable when replaced.

## Decision

- Store object bytes in S3-compatible storage; store metadata/version/hash in PostgreSQL.
- Local MinIO is development-only; production uses managed or separately backed-up object storage.
- Objects are addressed by generated keys, not user filenames.
- Evidence replacement creates a new version and marks prior version superseded.
- Validate size, media type and content signature; malware scanning is required before production gate.
- Downloads use short-lived signed URLs after application authorization.
- Hash duplicate detection is a control signal, not automatic accounting classification.
- Object encryption, retention and audit apply to upload/download/export.

## Consequences

- Container filesystem is never the durable evidence store.
- Deleting a draft does not silently destroy evidence needed by audit/retention policy.
- Backup/restore includes database-to-object consistency checks.
