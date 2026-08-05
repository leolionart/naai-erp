# ERP-320 Risks and Follow-ups

- The built-in validator checks allowlisted signatures and unsafe XML markers; a production malware engine and quarantined scan workflow remain mandatory before Gate G7.
- Process-memory storage is permitted only when S3 configuration is absent in development/tests; production must configure private S3-compatible storage.
- The current upload API accepts bounded base64 content. A later hardening task should add streaming/direct multipart upload and orphan-object reconciliation for large files.
- An object uploaded immediately before a failed database transaction may become an orphan; a storage reconciliation/sweeper is required before production hardening.
- Signed URLs generally remain valid until their short expiry even if permission is revoked; new URL issuance is denied immediately.
- Legal retention duration and physical purge policy require an owner/accountant/legal decision; no delete endpoint exists and stored history is retained.
