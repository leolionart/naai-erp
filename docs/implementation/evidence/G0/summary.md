# Gate G0 Foundation Evidence

## Local gates

- Clean clone install and full check: PASS.
- Repository CI/tooling: PASS.
- Empty PostgreSQL 16 migration: PASS.
- API/web health checks and worker heartbeat: PASS.
- ADR-001 through ADR-008: Accepted.
- Threat model, secret policy and backup/restore design: verified.

## Empty database readback

```text
Container image: postgres:16-alpine
Database: naai_erp (clean)
pnpm db:migrate: migrations applied successfully
Drizzle metadata table count: 1
Container removed after verification
```

Remote CI status must be successful on the exact final foundation commit before G0 is marked complete.
