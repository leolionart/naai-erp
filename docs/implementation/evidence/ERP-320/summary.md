# ERP-320 Summary

Implemented organization-scoped evidence management for PDF, XML, JPEG and PNG resources.

- Evidence metadata is separated into logical records and immutable sequential byte versions.
- Uploads validate size, allowlisted media type, content signature and unsafe XML markers before storage.
- SHA-256 is computed server-side; same-organization matches are returned as warnings and never auto-classify accounting or tax state.
- Replacement creates a new opaque object key, supersedes the prior active version and preserves history.
- Review stores state, reviewer, reason, timestamp and optional reference independently from accounting/tax review.
- Download URL issuance enforces organization/RBAC, a 30–300 second TTL and append-only access/audit events.
- S3-compatible storage is used when object-storage configuration is present; process-memory storage is development/test-only.
- Expense approval now derives required invoice/contract evidence from accepted active evidence versions rather than caller-provided checklist booleans.
- REST/OpenAPI, first-party CLI routing and the local admin API console expose the same application-service controls.

Start commit: `28ec9ceba2c5167caa4e5acafbf2039729c60980`.
Implementation commit: `674ba25cfac58070f8afe828fa25f120d043213b`.
Verified CI: https://github.com/leolionart/naai-erp/actions/runs/30995722902
