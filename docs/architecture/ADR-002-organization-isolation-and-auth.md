# ADR-002: Organization Isolation and Authorization

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002
- Rules: BR-ORG-001, BR-AUD-001, BR-SEC-001

## Context

Financial data must never leak across organizations. Background jobs, APIs and reports need the same isolation guarantees.

## Decision

- Every tenant-owned table includes non-null `organization_id`.
- Composite keys/foreign keys include or validate organization ownership.
- Request/job context carries an authenticated actor and organization membership.
- Authorization is default-deny and evaluates resource, action, role and organization.
- PostgreSQL Row-Level Security is planned as defense-in-depth after schema/tooling selection.
- Service accounts/API keys are scoped identities, not anonymous bypasses.
- Maker/checker constraints are domain policies in addition to RBAC.
- Audit events record actor, organization, correlation ID and source.

## Consequences

- Repositories/services require organization context explicitly.
- Tests must include cross-organization IDOR and background-job isolation.
- Global reference data must be explicitly marked; tenant data cannot use a nullable organization as a shortcut.

