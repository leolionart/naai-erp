# NAAI ERP Documentation

This directory contains the authoritative specification, architecture, contracts, and operational runbooks for NAAI ERP.

## Core Documentation

- `product/business-workflows.md`: overall user journey and step-by-step business workflows across sales, purchasing, expenses, banking, accounting, reporting and system operations.
- `product/business-rules.md`: authoritative business behavior and accounting invariants.
- `testing/test-specification.md`: test layers, golden fixtures, oracles and gate requirements.
- `testing/test-catalog.yaml`: machine-readable test registry.
- `implementation/task-ledger.yaml`: machine-readable task, gate and completion history ledger.
- `api/data-relationships-and-ingestion.md`: canonical AI lookup, dependency, ID propagation and ingestion playbook.
- `api/data-relationship-manifest-v1.json`: machine-readable application relationship graph and recipes.

## Subdirectories

- `architecture/`: Architecture Decision Records (ADRs) and design patterns.
- `product/`: accounting policies and domain specifications.
- `api/`: OpenAPI specs, webhook schemas, and machine-readable contract specifications.
- `ui/`: VietERP-informed design system standards and component guidelines.
- `security/`: threat model and secret handling policies.
- `runbooks/`: native development, Docker Compose production release, and backup/restore designs.

Start with `product/business-workflows.md` when learning how the system is used. Follow its links to
the authoritative business rules, API contracts and operational runbooks when implementing or
automating a specific workflow.
