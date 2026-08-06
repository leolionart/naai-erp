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

Supported create events are `sales_invoice.create`, `purchase_invoice.create`, `credit_note.create` and `expense.create`. Invoice-backed supplier spend is ingested as a purchase invoice; `expense.create` is reserved for non-invoice spend.

Structured data may include an external reference containing the source system, external ID, canonical Paperless URL, checksum/version, sync timestamp and metadata. Within one organization, the same `(system, externalId)` identifies one business resource even when the HTTP idempotency key changes.

The integration actor may create or update drafts only. Approval, posting, tax override and period controls are unchanged. Paperless owns source file bytes and document lifecycle; NAAI ERP stores the external reference only.

## Result semantics

- Same request key and payload returns the prior result.
- Same request key with another payload returns `409 IDEMPOTENCY_CONFLICT`.
- A different request key carrying the same external identity returns or updates the same draft business resource rather than creating a duplicate.
- The same external identity may exist in another organization.
- Bad source/signature/timestamp returns `401` and creates no inbox or business mutation.
- Invalid, unsupported or unmapped payload returns a structured field error and creates no business mutation.
- n8n owns retry, alerting and extraction-review orchestration. NAAI ERP does not expose a separate quarantine/replay workflow for this MVP.
