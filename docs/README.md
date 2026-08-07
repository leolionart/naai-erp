# NAAI ERP Documentation

This directory contains the authoritative specification, architecture, contracts, and operational runbooks for NAAI ERP.

## Core Documentation

- `product/business-rules.md`: authoritative business behavior and accounting invariants.
- `testing/test-specification.md`: test layers, golden fixtures, oracles and gate requirements.
- `testing/test-catalog.yaml`: machine-readable test registry.
- `implementation/task-ledger.yaml`: machine-readable task, gate and completion history ledger.

## Subdirectories

- `architecture/`: Architecture Decision Records (ADRs) and design patterns.
- `product/`: accounting policies and domain specifications.
- `api/`: OpenAPI specs, webhook schemas, and machine-readable contract specifications.
- `ui/`: VietERP-informed design system standards and component guidelines.
- `security/`: threat model and secret handling policies.
- `runbooks/`: native development, Docker Compose production release, and backup/restore designs.
