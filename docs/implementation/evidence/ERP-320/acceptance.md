# ERP-320 Acceptance

- PDF/XML/image upload: implemented through versioned REST with server-side content validation and SHA-256.
- Generated storage key: opaque tenant prefix and UUID; original filename is display metadata only and sanitized.
- Version/replacement: sequential, concurrency-controlled and history preserving; prior object metadata is immutable.
- Duplicate detection: organization-scoped warning list, no cross-organization leak and no automatic accounting/tax decision.
- Review: accepted/rejected/needs-review with authorized reviewer, reason, timestamp and optional reference.
- Signed download: short-lived S3 URL after organization/RBAC authorization; issuance is audited without persisting URL credentials.
- Access history: append-only database control for upload and signed-download issuance.
- Expense integration: invoice/contract evidence readiness derives from accepted active evidence records.
- AI-native contract: list/get/upload/review/download-url are available through REST/OpenAPI, CLI and local admin console.

Final acceptance is pending exact-commit PostgreSQL integration CI.
