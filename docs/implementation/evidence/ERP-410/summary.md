# ERP-410 summary

- Task: ERP-410 — Reconciliation
- Start commit: `b13f3979c563923d7d4f9c59d4d80859cddb4900`
- Rules: BR-REC-001, BR-REC-002, BR-REC-003
- Tests: T-REC-001, T-REC-002, T-REC-P001

Implemented explainable bank-transaction candidate scoring, partial one-to-many and many-to-one allocations, explicit bank-fee/FX/suspense adjustments, matched reservations, balanced settlement journals, reasoned manual override, immutable reconciliation attempts and authorized unreconcile through reversal journals.

Machine and human interfaces share the same application service:

- versioned REST/OpenAPI and first-party CLI commands for candidates, suggest, match, reconcile, unreconcile and reconciliation readback;
- PostgreSQL migration `0018_sad_professor_monster.sql` with organization scope and append-only history;
- `/banking` reconciliation queue and dedicated `/banking/reconciliation/{transactionId}` workflow route;
- journal/source/evidence drill-down identifiers in API and UI readback.

The UI follows the project routing pattern: lists and queues stay on the module page, multi-step reconciliation moves to a dedicated route, short actions use dialogs, and high-risk unreconcile confirmation requires an explicit reason.
