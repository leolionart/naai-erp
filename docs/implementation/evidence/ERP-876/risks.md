# ERP-876 risks

- Existing posted rows without canonical source relationships remain review-required; the read model does not guess or rewrite history.
- The expense-entry workflow still uses category policy as a default funding treatment. A separate task is required to make payer/source-of-funds an explicit per-transaction input.
- Production totals will change only after this application version is published and deployed; this task performs no live data correction.
