# AI-native interface contract

Every response includes `api_version`, `request_id`, `organization_id` and either `data` or structured `error`.

Mutation responses also include `resource_version`, `audit_event_id`, `correlation_id`, allowed `next_actions` and idempotency replay status.

## Required operation families

- `get`, `list`, `create`, `update-draft`, `deactivate`;
- explicit workflow commands: `submit`, `approve`, `post`, `reverse`, `reopen`;
- validated bulk `import`, `export` and audit-history readback;
- outbound events for material state changes.

No generic update endpoint may mutate posted financial history or bypass a state machine.

## Query and mutation contract

- cursor pagination with deterministic ordering;
- organization scope from authenticated context;
- exact money as decimal/minor-unit strings, never JSON float;
- `Idempotency-Key`, `X-Correlation-Id` and optimistic resource version for mutations;
- stable error `code`, retryability, field details and remediation hints.

## AI safety boundary

AI identities receive explicit roles and organization membership. They call the same commands as equivalent human/service roles. Maker-checker, locked period, evidence, tax review and balanced-ledger rules remain enforced.

## CLI direction

```text
naai-erp <resource> list|get|create|update|deactivate
naai-erp <workflow> submit|approve|post|reverse|reopen
naai-erp import <resource> --file ... --dry-run
naai-erp export <resource|report> --format json|csv|xlsx
```

Default output is JSON for AI consumption; `--human` enables formatted tables.
