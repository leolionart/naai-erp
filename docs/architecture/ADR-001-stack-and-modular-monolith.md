# ADR-001: Stack and Modular Monolith

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002

## Context

NAAI ERP needs strict financial transactions, traceable reports and gradual delivery by a small team. Premature microservices would increase distributed-transaction, deployment and reconciliation risk.

## Decision

- Use a pnpm/Turborepo TypeScript monorepo.
- Web: Next.js App Router.
- API: NestJS with Fastify.
- Worker: TypeScript process sharing domain/contracts.
- Source of truth: PostgreSQL.
- Async jobs: Redis/BullMQ when introduced.
- Evidence: S3-compatible object storage.
- Architecture: modular monolith with explicit module boundaries and transactional outbox.
- Deploy development via containers later, but keep local packages independently testable.

Initial modules:

```text
identity, organization, commercial, projects, documents, expenses,
banking, ledger, planning, reporting, integrations, audit
```

## Consequences

- Strong database transactions are available for posting and outbox writes.
- Modules must not access another module's tables directly without an approved boundary.
- Microservice extraction is allowed only after measured scaling/ownership need and an ADR.
- Node 22 LTS and exact dependency versions are the supported baseline.
