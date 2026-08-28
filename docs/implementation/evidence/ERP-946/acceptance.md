# Acceptance

- Omitted funding on purchase-invoice create is normalized to `owner_paid`.
- Quick purchase ingestion sends the same canonical default.
- Owner-paid posting uses exactly one approved, effective TT133 `owner_current` account.
- Explicit company-bank funding is not rewritten and resolves its financial account ledger code.
- OpenAPI documents the canonical funding contract and default behavior.
