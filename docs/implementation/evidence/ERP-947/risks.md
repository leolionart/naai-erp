# Risks and follow-ups

- Existing production rows are intentionally not deleted. They remain available to audit users and
  ledger history; only default operational/read-model paths change.
- Journal-derived statements continue to include posted and reversed journal rows so reversal
  netting remains correct.
- A deploy/readback is still required before the production UI reflects this behavior.
