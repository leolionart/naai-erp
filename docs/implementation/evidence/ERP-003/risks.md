# ERP-003 Risks and Follow-ups

- CI remote status must be read back after push.
- Integration database migration tests begin when the first schema migration exists.
- Pre-commit is intentionally lighter than the full CI check; full test/build still runs in CI.
- Docker/Compose and security scans remain later tasks.
