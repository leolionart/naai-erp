# Acceptance

- Every organization-scoped request gets a lifecycle activity: interceptor creates `running`, then finalizes status.
- Service, operation, correlation ID, summary and structured details are persisted.
- Fastify authentication failures are logged before response, including `stage=authentication`.
- Logging errors are isolated and do not alter API behavior.
