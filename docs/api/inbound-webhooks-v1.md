# Inbound Webhooks v1

## Transport contract

`POST /api/v1/inbound/{sourcePublicId}/events`

Required headers:

- `Content-Type: application/json`
- `X-NAAI-Timestamp`: Unix seconds, accepted within the source policy (default ±300 seconds)
- `X-NAAI-Signature`: `sha256=<lowercase hex>`
- `Idempotency-Key`: stable per source event/retry
- `X-Correlation-Id`: optional; generated when absent

The HMAC-SHA256 input is the exact raw byte sequence:

```text
<timestamp>.<raw HTTP request body>
```

The secret is resolved through the integration source's `secret_ref` environment/secret-manager key. Secret bytes are never stored in PostgreSQL or returned by the API.

## Envelope

```json
{
  "schemaVersion": 1,
  "eventType": "expense.create",
  "externalId": "provider-event-001",
  "occurredAt": "2026-08-05T10:00:00Z",
  "data": {}
}
```

Supported create events are `sales_invoice.create`, `purchase_invoice.create` and `expense.create`. The integration actor may create drafts only; approval, posting, tax override and period controls are unchanged.

## Result semantics

- Same source/key/raw hash returns the stored inbox/business result.
- Same source/key with a different hash returns `409 IDEMPOTENCY_CONFLICT`.
- Same source/event/external ID with changed data returns `409 WEBHOOK_EXTERNAL_ID_CONFLICT`.
- Bad source/signature/timestamp returns `401` and creates no inbox or business mutation.
- Authenticated invalid/unsupported/unmapped payload is retained as `quarantined`, with no business mutation.
- Authorized replay preserves the original raw payload and appends attempt/audit history. An optional corrected envelope is stored separately.
