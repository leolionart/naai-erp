# NAAI ERP Foundation Threat Model

## Protected assets

- Financial journals and reports.
- Invoice/expense/evidence documents.
- Bank/payment and project-cost data.
- Credentials, signing/encryption keys and personal data.
- Audit history, backups and release artifacts.

## Trust boundaries

- Browser/client to API.
- API/worker to PostgreSQL, Redis and object storage.
- External webhook/provider to inbound integration.
- GitHub Actions/GHCR to deployment host.
- Organization A to Organization B.

## Primary threats and baseline controls

| Threat                          | Baseline control                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Cross-organization data access  | Explicit organization context, default deny, composite ownership checks, planned RLS |
| Privilege escalation            | Scoped roles, maker/checker policy, audited elevated operations                      |
| Journal tampering               | Immutable posted entries, reversal workflow, append-only audit                       |
| Webhook replay/tampering        | HMAC/API identity, timestamp window, idempotency key and payload hash                |
| Evidence disclosure             | Authorized signed URLs, object-key indirection, encryption and access audit          |
| Secret leakage                  | Secret manager/runtime injection, scanning, redaction and no secrets in artifacts    |
| Duplicate/missing events        | Inbox/outbox, atomic transaction, retry and dead-letter evidence                     |
| Supply-chain compromise         | Frozen lockfile, dependency/image scanning, SBOM, provenance and signatures          |
| Destructive migration/data loss | Expand/contract migration, backup, restore drill and release approval                |

## Required reviews

- Update this model when a new external integration, auth provider or sensitive data class is introduced.
- The MVP gate requires existing security checks, non-root release containers and persistent Compose storage. Formal backup/restore rehearsal requires separate owner activation before production-critical rollout.
