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

## Remote CI readback

```text
Commit: b4c4a759fcfed70e3ad4a4bd57b4399317b93686
Workflow: CI
Conclusion: success
URL: https://github.com/leolionart/naai-erp/actions/runs/30981695825
```

Gate G0 is complete.
