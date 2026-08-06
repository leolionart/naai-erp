# Outbound events admin API v1

> Retained compatibility contract for the completed transactional-outbox module. It is not an active invoice-MVP workstream and must not be added to primary MVP navigation unless the owner reactivates it.

ERP-340 exposes operational readback and controlled replay for the transactional outbox. Business services create outbox rows in the same PostgreSQL transaction as their financial mutation. The admin API never publishes an event directly and never edits the immutable event payload.

## Routes

- `GET /api/v1/organizations/{organizationId}/outbound-events/endpoints`
- `POST /api/v1/organizations/{organizationId}/outbound-events/endpoints`
- `GET /api/v1/organizations/{organizationId}/outbound-events/endpoints/{endpointId}`
- `PATCH /api/v1/organizations/{organizationId}/outbound-events/endpoints/{endpointId}`
- `GET /api/v1/organizations/{organizationId}/outbound-events/outbox`
- `GET /api/v1/organizations/{organizationId}/outbound-events/outbox/{eventId}`
- `GET /api/v1/organizations/{organizationId}/outbound-events/deliveries`
- `GET /api/v1/organizations/{organizationId}/outbound-events/deliveries/{deliveryId}`
- `POST /api/v1/organizations/{organizationId}/outbound-events/outbox/{eventId}/replay`

List routes use deterministic cursor pagination. Common filters include endpoint status, event type, aggregate type/ID, delivery state and outbox state. Read responses include endpoint metadata, immutable schema-versioned event payload metadata, attempt history, redacted response/error summaries and dead-letter reason. Secrets and complete authentication headers are never returned.

Endpoint create/update is restricted to `owner` and `finance_admin`, requires idempotency, stores only `secretRef`, rejects localhost/private-address HTTPS targets, and returns no secret material. Update additionally requires `If-Match` with the current endpoint version.

Replay requires `Idempotency-Key`, `X-Correlation-Id` and body:

```json
{
  "reason": "Receiving endpoint recovered",
  "endpointId": "optional-single-endpoint-replay"
}
```

Only `owner`, `finance_admin` and `accountant` may replay. The store must reject events that are not replayable, preserve all prior delivery attempts, append an audit event and enqueue a new pending delivery without mutating the original outbox payload. Same key and same request returns the prior result; same key with another event, endpoint or reason returns conflict.

## Delivery requirements

- Delivery is at least once; consumer endpoints must be idempotent.
- Worker claims use a lease or `FOR UPDATE SKIP LOCKED` and recover after crashes.
- Retry uses deterministic bounded exponential backoff so schedules are testable and auditable.
- Every attempt records endpoint, timestamps, HTTP status, duration and a redacted error/response summary.
- Exhausted deliveries enter `dead_letter`; manual replay is explicit, authorized and audited.
- Webhook signatures use endpoint key versions; secret material is resolved outside plaintext business records.
- Logs and API responses never expose endpoint secrets, signatures or full sensitive payloads.

## CLI

```text
naai-erp outbound-events list --data '{"state":"dead_letter"}'
naai-erp outbound-events get --key <event-id>
naai-erp outbound-events replay --key <event-id> --data '{"reason":"Endpoint recovered"}' --idempotency-key <stable-key>
```

Endpoint and delivery inventory can be read with resources `outbound-endpoints` and `outbound-deliveries` using the same `list|get` command family.

```text
naai-erp outbound-endpoints create --data '<endpoint-json>' --idempotency-key <stable-key>
naai-erp outbound-endpoints update --key <endpoint-id> --expected-version <version> --data '<patch-json>' --idempotency-key <stable-key>
```
