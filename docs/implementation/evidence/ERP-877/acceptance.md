# ERP-877 acceptance

- One quick-edit save action: proven by focused E2E and localhost browser readback.
- Posted metadata correction: API accepts payee, purpose, line description and category as one atomic payload.
- Relationship safety: non-null payee must be one active supplier in the same organization.
- Financial immutability: migration permits only the named metadata fields; store tests retain journal and financial values.
- Auditability: update increments resource version and writes audit plus outbox events under idempotency control.
