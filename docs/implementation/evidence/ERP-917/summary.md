# ERP-917 — Background activity log viewer and bounded retention

## Scope

Define an organization-scoped operational activity stream for worker and maintenance jobs, with
redacted metadata, deterministic filters/pagination, and a configurable retention policy (default
30 days). Operational cleanup must not remove accounting history, source documents, resource audit
events, or immutable outbox history.

## Acceptance

Implementation evidence is recorded by the backend, CLI and web owners against `G74`. This folder
captures the required contract and test traceability while implementation is in progress.
