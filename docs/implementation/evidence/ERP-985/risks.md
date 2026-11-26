# ERP-985 Risks

- None for existing data: no schema constraint was added to historical tables, so legacy foreign-currency rows remain readable and excluded from base-currency totals with explicit warnings (`BR-STAT-001`).
- Automation callers (n8n/CLI) sending foreign-currency documents now receive a deterministic non-retryable `422 FOREIGN_CURRENCY_NOT_SUPPORTED` error with instructions to convert to VND and record the exchange rate in the description before retrying with the same `externalId`.
