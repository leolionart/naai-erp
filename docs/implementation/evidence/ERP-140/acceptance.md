# ERP-140 acceptance

- [x] All P1 master resources are listed in a closed compile-time registry and OpenAPI contract.
- [x] API supports organization-scoped list/get/create/update/deactivate where allowed.
- [x] Effective-dated tax/mapping history cannot be generically rewritten through mutable fields.
- [x] Bearer credentials are hashed, organization scoped, role scoped and expirable/revocable.
- [x] Mutations require idempotency and return version, audit reference, correlation and next actions.
- [x] Mutation, version, audit and idempotency outcome use one PostgreSQL transaction.
- [x] Bulk import has no-write dry-run validation and export has JSON output.
- [x] CLI emits JSON by default, calls REST and has no PostgreSQL dependency.
- [x] Structured API errors and optimistic version conflicts are defined.
- [x] Exact-commit migration, API-to-PostgreSQL auth/isolation/idempotency tests and CLI build pass on CI.

ERP-140 and Gate G1 are complete. ERP-200 is ready under Gate G2.
