# ERP-140 remaining risks and follow-ups

- Credential provisioning is an administrative bootstrap operation and must later receive a guarded CLI/runbook without printing raw tokens.
- Bulk apply mode, CSV/XLSX parsing and partial-failure writes are deferred; dry-run JSON validation and JSON export establish the initial contract.
- Resource-specific domain application services should progressively replace generic persistence for complex workflows; the registry deliberately blocks arbitrary tables and immutable fields.
- Rate limiting and stronger credential secret derivation/rotation are part of ERP-730 security hardening.
- Exact-commit CI passed PostgreSQL migration and API integration; Gate G1 is closed.
