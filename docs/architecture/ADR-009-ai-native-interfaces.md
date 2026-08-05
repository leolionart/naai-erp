# ADR-009: AI-native interfaces

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002 follow-up
- Rules: BR-AI-001, BR-AI-002, BR-AI-003, BR-AI-004

## Context

NAAI ERP must be operable by people, automation and AI agents without screen scraping or direct database access. AI access must not weaken financial controls.

## Decision

- Every business entity and workflow is exposed through versioned REST/OpenAPI operations before or together with its UI.
- A first-party CLI consumes the same public API contract; it does not connect directly to PostgreSQL.
- Reads support stable IDs, organization scope, pagination, filtering, field selection and machine-readable errors.
- Mutations require authenticated actor context, organization membership, RBAC, correlation ID and idempotency where retry is possible.
- AI may create drafts within permission. Approval, posting, payment, reopen, merge and accountant override remain privileged workflow commands.
- Every mutation returns resource version, audit/event reference and permitted next actions.
- Bulk import/export and webhook/event contracts use schema versions and partial-failure results.
- AI may propose classification, mapping and journal drafts, but deterministic domain rules validate every effect.
- Direct database credentials are never an AI integration interface.

## Interface layers

1. REST/OpenAPI is the canonical synchronous contract.
2. CLI is a thin authenticated client over REST.
3. Webhooks/outbox are canonical asynchronous contracts.
4. Optional MCP/tool adapters may wrap REST/CLI without adding bypass paths.

## Consequences

- A feature is incomplete if it only has UI or database schema without machine-readable contracts.
- Contract, authorization, idempotency and audit tests are required for AI-writable resources.
- Admin UI and AI clients share the same application services and validation.
