# ERP-330 Summary

Implemented versioned inbound webhooks with exact raw-body HMAC validation, timestamp replay protection, source identity and two-layer idempotency.

- Source configuration stores only a runtime `secret_ref`, allowed event types, tolerance and retry policy.
- Security verification runs before inbox persistence or business processing.
- Inbox retains immutable raw JSON, SHA-256, external ID, state, result and correlation ID.
- Same key/hash and same external ID/hash replay the stable result; changed hashes conflict without duplicate effects.
- Supported events call the same sales/purchase/expense application services as REST/CLI with the integration role.
- Authenticated invalid, unsupported or business-invalid payloads are quarantined with zero document/journal effect.
- Attempts are append-only; admin list/read/replay is organization-scoped, RBAC-controlled, reasoned and audited.
- REST/OpenAPI and first-party CLI expose inbox inspection and authorized replay.

Start commit: `97bb4da88a89afcc5dab5b6ddf052cbf442a3523`.

Verified implementation commit: `67cbb186cc224aaeea479c358012fa250b610a31`.
Exact-commit CI: https://github.com/leolionart/naai-erp/actions/runs/30997337079
