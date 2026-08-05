# ADR-008: Database Access and Migration Tooling

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-003

## Decision

- Use PostgreSQL through `pg` and Drizzle ORM for typed schema/query composition.
- Use Drizzle Kit for schema-derived migration generation.
- Financial posting paths may use explicit SQL/transactions when clarity or locking requires it.
- Migrations are committed SQL files, reviewed and executed once before application rollout.
- Production seeding is forbidden; development seeding requires explicit opt-in and synthetic data.
- Schema changes follow expand/contract compatibility.

## Consequences

- Business tables are added only by owning tasks after business-rule/test mapping.
- Database transactions remain visible and testable rather than hidden behind repository magic.
- Migration validation and upgrade tests become blocking gates.
