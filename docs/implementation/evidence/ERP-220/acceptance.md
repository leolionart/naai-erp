# ERP-220 Acceptance

- Draft → approve → post: implemented with strict state checks.
- Maker/checker: default different-actor enforcement plus bounded, explicitly audited small-team exception.
- Posted immutability: preserved by database triggers and no mutable API route.
- Reverse: linked inverse journal, one reversal maximum and per-account net-zero test.
- Repost: one linked replacement draft with normal approval required afterward.
- RBAC/audit/idempotency/outbox: applied to workflow commands.
- AI-native API/CLI: OpenAPI paths and CLI routing implemented.

Final acceptance remains pending exact-commit PostgreSQL CI.
