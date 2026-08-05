# ERP-410 acceptance evidence

## Candidate matching — BR-REC-001

Pass locally; PostgreSQL execution awaits exact-commit CI. Candidate scoring stores integer-bps factors for amount, date, reference, party, currency and outstanding. Auto-match is only valid when exactly one eligible candidate meets threshold; ambiguity remains reviewable. Manual override requires privileged role, reason and audit metadata.

## Partial and many-to-many allocation — BR-REC-002

Pass in domain/property/contract tests; database concurrency awaits CI. Exact integer allocations cannot exceed bank capacity or target outstanding. Matched attempts reserve target capacity. One bank transaction can split across sources and multiple bank transactions can settle one source.

## Fee, FX and suspense

Pass. These are explicit adjustment lines with account, side and base amount; they are never hidden inside source allocations. Exchange-rate identity/base amounts are persisted for reproducibility. Settlement journal construction rejects imbalance.

## Reconciled lock and unreconcile — BR-REC-003

Pass in domain/service tests; PostgreSQL execution awaits CI. Reconciled attempts are immutable and cannot rematch. Authorized unreconcile requires reason, creates a reversal journal, restores source outstanding/state and preserves the original attempt, allocations, adjustments, journal and event history.

## AI-native and UI parity

Pass. REST/OpenAPI, CLI and admin UI expose the same organization-scoped workflow. The `/banking` menu contains a reconciliation queue; complex work uses a dedicated detail route rather than an overloaded single page. UI consumes server-provided totals and factors and does not reproduce financial formulas.

## Independent fixture

Pass. GF-BANK-001 proves `60m + 50m = 110m` invoice settlement and a separate `109m` principal plus `1m` bank-fee journal against a `110m` cash outflow, with checksum-protected expected allocations and journals.
