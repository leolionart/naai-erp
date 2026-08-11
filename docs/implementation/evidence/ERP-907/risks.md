# ERP-907 risks and follow-ups

## Remaining validation risks

- Additional manual UI exploration was skipped at the product owner's request after the full
  automated gate passed and the owner confirmed acceptance. Regression protection remains in the
  focused UI policy test and the repository web suite.
- A latest effective but unapproved mapping can be incomplete. Reports deliberately remain visible,
  but consumers must surface `reportWarnings`/`configurationWarnings` and must not present those
  warnings as statutory or tax approval.
- Tax evidence and eligibility remain separate from accounting recognition. Future UI changes must
  not turn VAT/CIT warnings back into a condition that removes a booked expense from management
  profit.
- Save-and-record reuses the existing atomic posting, duplicate, idempotency and period-lock paths.
  Future changes must keep these regressions in the mandatory financial safeguard gate.

## Operational follow-up

- Production rollout must use the supported migrate-first `latest` update path. API containers must
  not be restarted on the new image until migration 0053 has completed successfully.
- After migration, verify the removed cache table is absent and compare representative dashboard,
  P&L, cash and performance totals against canonical posted sources.
- No direct mutation of posted journal history is part of ERP-907; corrections continue through
  reversal and replacement.
