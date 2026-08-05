# ADR-004: Transactions, Outbox and Idempotency

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002
- Rules: BR-LED-002, BR-LED-004, BR-INT-001, BR-OUT-001, BR-OUT-002

## Context

Webhook retries and process crashes must not duplicate invoices, journals or events. Database state and outbound messages must not diverge.

## Decision

- Business mutation, journal posting, audit record and outbox row commit in one PostgreSQL transaction.
- Workers deliver outbox events at least once; consumers are idempotent.
- Inbound create operations use source identity, external ID, idempotency key and payload hash.
- Same key/same payload returns the prior result; same key/different payload is conflict.
- Raw inbound payload and attempts are retained in an inbox record.
- Failed/unmapped inputs are quarantined; outbound exhaustion enters dead-letter state.
- Retry uses exponential backoff and auditable manual replay.

## Consequences

- Direct message publishing inside an uncommitted transaction is forbidden.
- Event schemas are versioned in contracts.
- Integration tests inject crashes before/after commit and delivery.

