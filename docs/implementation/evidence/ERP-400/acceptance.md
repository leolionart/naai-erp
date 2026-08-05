# ERP-400 acceptance evidence

## Bank and cash accounts

Pass. `financial_accounts` separates company-owned bank/cash accounts from counterparty `party_bank_accounts`, links each account to an organization-owned asset ledger account, and exposes create/list/get/deactivate operations through REST, CLI and the admin UI.

## CSV import adapters

Pass. Generic CSV adapter v1 supports explicit column mapping, dry-run, bounded file/row validation, row-level accepted/duplicate/rejected outcomes and formula-risk review flags. Raw CSV rows are retained independently from normalized transaction representations.

## Fingerprint and duplicate prevention — BR-BNK-001

Pass in domain/unit/contract coverage; PostgreSQL proof awaits exact-commit CI. Provider transaction IDs are preferred when available and semantic SHA-256 fingerprints cover canonical booking/value date, signed amount, currency, reference, description and counterparty. Unique constraints and advisory transaction locks prevent concurrent duplication. Same idempotency key/same payload replays; changed payload conflicts.

## Immutable raw and versioned normalization — BR-BNK-001

Pass in schema/migration and tests; PostgreSQL execution awaits exact-commit CI. Append-only triggers reject update/delete of raw import rows, normalization history and transaction state events. New normalization versions append instead of rewriting history.

## Transaction state — BR-BNK-002

Pass. The domain models `imported → suggested → matched → reconciled` plus `ignored` and `needs_review`; ERP-400 API only exposes safe pre-reconciliation branch actions (`ignore`, `mark-needs-review`). Matching and reconciliation mutations are deferred to ERP-410.

## AI-native and operational parity

Pass. OpenAPI, typed contracts, CLI and UI call organization-scoped REST application services. Mutations enforce RBAC, correlation IDs, idempotency where retryable, append-only audit and outbox events. Admin UI provides the primary non-JSON account/import workflows at `/banking`.
