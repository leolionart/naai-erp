# ERP-110 remaining risks and follow-ups

- Deep hierarchy cycle detection requires repository traversal when account mutation APIs are added; self-parent and immediate ownership/root constraints are already enforced.
- Effective-date overlap is enforced by domain validation. Repository transactions must call it before insert; a PostgreSQL exclusion constraint can be added later if date-range extensions are adopted.
- Tax policies are decision-support configuration and require accountant review; the code does not assert statutory correctness.
- Actual manual-posting enforcement, ledger-history lookup and statutory export readiness belong to later accounting/export tasks.
- Local PostgreSQL integration could not run because Docker Desktop and a native PostgreSQL client/server were unavailable. The updated GitHub CI supplies PostgreSQL 16 and is the current verification path.
