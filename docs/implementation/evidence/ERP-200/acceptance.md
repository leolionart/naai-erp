# ERP-200 Acceptance

- Exact money and debit/credit polarity: implemented in domain and database constraints.
- Posted balance invariant: domain validation and transactional PostgreSQL posting query.
- Atomic posting: state, audit event, idempotency outcome and outbox event use one transaction.
- Concurrent/idempotent posting: advisory transaction lock plus replay record; integration test included.
- Posted immutability: deep-frozen aggregate plus PostgreSQL mutation triggers.
- AI-native access: versioned REST/OpenAPI and JSON-first CLI use the application API.
- Organization/RBAC controls: organization-scoped composite keys, authenticated actor context and privileged posting roles.

Exact-commit PostgreSQL CI passed: https://github.com/leolionart/naai-erp/actions/runs/30987090756
