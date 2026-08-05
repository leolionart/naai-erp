# ERP-110 test evidence

Node runtime: `v22.21.1`.

## Local quality gate

Commands:

```sh
pnpm check
pnpm db:check
```

Results:

- Domain: 5 files passed, 16 tests passed.
- Format, lint, typecheck, documentation/security checks and builds passed across 9 packages.
- Migration directory validation passed with 4 entries.
- Database integration tests were registered but skipped locally because neither Docker daemon nor local PostgreSQL was available.

## Native development preview

Command: `pnpm dev:preview`

Verified responses:

- `http://localhost:3000/health` → `{"service":"web","status":"ok"}`
- `http://localhost:3001/health/live` → `{"service":"api","status":"ok"}`
- `http://localhost:3001/health/ready` → `{"service":"api","status":"ok"}`

The preview uses Next.js and NestJS watch processes directly; no Docker image build is involved.

## Pending exact-commit CI

CI now provisions PostgreSQL 16, migrates the empty database and runs database integration tests. ERP-110 remains in `review` until the pushed exact commit passes this workflow.
