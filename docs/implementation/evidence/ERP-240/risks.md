# ERP-240 Risks and Follow-ups

- Exact SQL/migration behavior must pass the clean PostgreSQL GitHub CI job before ERP-240 and Gate G2 can close.
- Opening AR/AP detail currently uses structured journal-line dimensions (`partyId`, `documentRef`); ERP-300/430 will introduce durable document/subledger entities and tie-out rules.
- Report pagination and report snapshots belong to later reporting/export tasks; current deterministic JSON is appropriate for the accounting-kernel gate dataset.
- The opening import uses the existing journal approval/post workflow as the authoritative control path; future UI must call the same API rather than mutating batch status directly.
