# ERP-001 Summary

## Outcome

Created the NAAI ERP pnpm/Turborepo monorepo foundation with:

- Next.js App Router web application.
- NestJS/Fastify API with liveness/readiness endpoints.
- TypeScript worker with heartbeat and graceful shutdown.
- Shared domain, database, contracts, config, observability and test-fixtures packages.
- Reserved database, deployment and documentation layout.
- Node 22 and pnpm 10 toolchain pins.

## Key decisions

- Business schema remains intentionally absent until ERP-002 ADR approval.
- Deployment files are placeholders only; Docker/Compose implementation remains ERP-800+.
- Root baseline quality commands run through Turborepo.

## Files

- Root workspace: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`.
- Applications: `apps/web`, `apps/api`, `apps/worker`.
- Shared packages: `packages/*`.
- Layout placeholders: `db/*`, `deploy/*`, `docs/{architecture,api,runbooks}`.

