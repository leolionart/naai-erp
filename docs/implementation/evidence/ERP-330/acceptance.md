# ERP-330 Acceptance

- HMAC/source/timestamp verification occurs before persistence and processing.
- Versioned envelopes support sales invoice, purchase invoice and expense draft creation only.
- Same retry creates one business effect and returns the prior result; conflicting reuse returns 409.
- Raw payload/hash and attempts are retained without rewriting history.
- Invalid/unmapped authenticated messages enter quarantine and create no business document/journal.
- Admin inbox inspection and manual replay enforce organization scope, privileged roles, reason and audit.
- OpenAPI and CLI expose machine-readable receipt, inspection and replay contracts.

Final acceptance is pending exact-commit PostgreSQL integration CI.
