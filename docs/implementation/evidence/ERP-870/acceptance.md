# ERP-870 acceptance

- Service plans are organization-scoped, versioned, audited and deactivatable: proven by domain,
  API and database tests.
- Subscriptions enforce active client role and customer/project consistency: proven by API/store
  tests and PostgreSQL constraint tests.
- Lifecycle uses typed actions with optimistic version and idempotency: proven by domain/API tests.
- Schedule preview is deterministic and accounting-neutral: proven by domain/API tests and UI copy.
- REST, OpenAPI and CLI expose equivalent read/write workflows: proven by contract and CLI tests.
- Portable packages include both resources and restore them through canonical services after a
  zero-write relationship preflight: proven by portable-adapter tests.
- The web workspace supports create/edit/filter/lifecycle/preview flows on desktop and mobile:
  proven by the focused Playwright E2E suite.
- AI ingestion documentation explains customer, client role, project, service-plan and subscription
  relationships: proven by documentation verification.
